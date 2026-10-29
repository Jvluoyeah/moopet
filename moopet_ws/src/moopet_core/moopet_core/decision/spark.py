#!/usr/bin/env python3
"""火花计划引擎（W5 · 李文扬）——纯逻辑，无 ROS，SQLite 持久化。

对齐排期 W5·李文扬条目：
  ① 火花全流程与行为/回复联动（提醒三档：18:00 / 21:00 / 23:00）
  ② 双栈集成：决策引擎 + 火花 + 纪念日统一调度（on_tick 周期检查接入）
  ③ 里程碑解锁玩法接入（LED 灯位 / 肤位外观数据占位）

规则来源：狗2.md「养成需求」（抽奖/签到/每日任务/等级解锁）+ 排期 W5·牛浩然条
（火花 API：连续天数增减、0-5 档佩戴、续火/熄灭/挽回）。

  - 火花（连续陪伴）：0~5 档佩戴；连续互动 → 续火；断档 → 熄灭；回归 → 挽回
  - 每日任务：每天 4 点随机刷新；全部完成 → +2 次抽奖机会
  - 签到：每天 1 次 → +1 次抽奖机会
  - 抽奖：概率 40/30/20/9.5/0.5%，奖 20/50/100/500/10000 经验；
          抽奖经验不计入每周经验上限；200 次保底出超级大奖
  - 里程碑解锁：核心功能前 10 级解锁完成，后续非核心每 5 级一项到 30 级；
                另含 LED 灯位 / 肤位（外观）数据占位

表：streak / daily_task / daily_reward（schema.sql W1 已建）+ spark_meta（本模块兜底）。
"""
import json
import os
import random
import sqlite3
from datetime import date, datetime, timedelta

# ------------------------- 常量（对齐狗2.md + 排期 W5） -------------------------

# 火花档位：连续天数 → 佩戴档位（0~5）。每连续 7 天升一档（对齐 exp_engine._update_streak）
SPARK_LEVEL_DAYS = 7
SPARK_MAX_LEVEL = 5

# 三档提醒时间（18:00 / 21:00 / 23:00）
REMIND_TIMES = (18, 21, 23)

# 每日任务刷新时刻（每天 4 点随机刷新）
TASK_REFRESH_HOUR = 4

# 抽奖机会：每天签到 +1 次；完成每日养成（全部任务） +2 次
SIGNIN_CHANCES = 1
DAILY_TASK_CHANCES = 2

# 抽奖奖池（狗2.md：三等+20/二等+50/一等+100/特等+500/超级+10000，概率 40/30/20/9.5/0.5%）
LOTTERY_PRIZES = [
    dict(prize='三等奖',   exp=20,   prob=0.40),
    dict(prize='二等奖',   exp=50,   prob=0.30),
    dict(prize='一等奖',   exp=100,  prob=0.20),
    dict(prize='特等奖',   exp=500,  prob=0.095),
    dict(prize='超级大奖', exp=10000, prob=0.005),
]
LOTTERY_PITY = 200                # 200 次保底出超级大奖
LOTTERY_SUPER = '超级大奖'

# 每日任务池（随机抽取；task_type 对应经验来源，progress 按互动事件累计）
TASK_POOL = [
    dict(task_type='pet',       target=3, name='抚摸'),
    dict(task_type='handshake', target=2, name='握手'),
    dict(task_type='call',      target=2, name='呼唤'),
    dict(task_type='walk',      target=2, name='散步'),
    dict(task_type='quiz',      target=3, name='答题'),
    dict(task_type='ventilate', target=1, name='通风'),
]
TASK_DAILY_COUNT = 2              # 每天随机抽 2 个任务

# 里程碑解锁（狗2.md 等级解锁）：核心功能 1~9 级解锁、10 级核心功能解锁完成；
# 后续非核心功能每 5 级一项直到 30 级
CORE_FEATURES = {
    1: ['时钟', '天气', '智能家居管理'],
    2: ['AI 交互'],
    3: ['导航'],
    4: ['通讯'],
    5: ['监控'],
    6: ['空气质量检测'],
    7: ['投影'],
    8: ['音乐'],
    9: ['多模态情绪共鸣'],
}
NON_CORE_FEATURES = {15: '非核心功能·A', 20: '非核心功能·B',
                     25: '非核心功能·C', 30: '非核心功能·D'}

# LED 灯位（外观·数据占位，供前端灯效展示）
LED_POSITIONS = {
    1: '耳部 LED', 5: '眼部 LED', 10: '胸背 LED',
    15: '四肢 LED', 20: '尾部 LED', 25: '全身 LED',
}
# 肤位（外观皮肤·数据占位，供主题/皮肤切换）
SKIN_SLOTS = {
    1: '经典白', 5: '暖橙', 10: '星空蓝',
    15: '薄荷绿', 20: '曜石黑', 25: '极光紫', 30: '鎏金',
}

# spark_meta 兜底建表（schema.sql 未含，本模块自管）
_META_DDL = """
CREATE TABLE IF NOT EXISTS spark_meta (
    k TEXT PRIMARY KEY,
    v TEXT
);
"""


def level_from_days(days):
    """连续陪伴天数 → 佩戴档位（0~5）。每连续 7 天升一档，封顶 5 档。"""
    return min(SPARK_MAX_LEVEL, days // SPARK_LEVEL_DAYS)


class SparkEngine:
    """火花计划引擎：连续陪伴（续火/熄灭/挽回）+ 三档提醒 + 每日任务 + 签到抽奖 + 里程碑解锁。

    与 exp_engine 共用同一个 SQLite（db_path 参数）；streak/daily_task/daily_reward
    用 schema.sql 已建表，spark_meta（保底计数/提醒去重/任务加成标记）本模块自建。
    """

    def __init__(self, db_path=None):
        if db_path is None:
            db_path = os.path.join(os.path.expanduser('~'), '.moopet', 'moopet.db')
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self.db_path = db_path
        self._conn = sqlite3.connect(db_path)
        self._conn.row_factory = sqlite3.Row
        self._init_tables()

    def _init_tables(self):
        # streak / daily_task / daily_reward 已在 schema.sql；这里兜底建表保证独立可用
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS streak (
                id                 INTEGER PRIMARY KEY CHECK (id = 1),
                current_days       INTEGER NOT NULL DEFAULT 0,
                max_days           INTEGER NOT NULL DEFAULT 0,
                level              INTEGER NOT NULL DEFAULT 0,
                last_activity_date TEXT NOT NULL DEFAULT '',
                updated_at         TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            )""")
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS daily_task (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                date      TEXT NOT NULL,
                task_type TEXT NOT NULL,
                progress  INTEGER NOT NULL DEFAULT 0,
                target    INTEGER NOT NULL DEFAULT 1,
                done      INTEGER NOT NULL DEFAULT 0,
                UNIQUE(date, task_type)
            )""")
        self._conn.execute("""
            CREATE TABLE IF NOT EXISTS daily_reward (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                date          TEXT NOT NULL,
                sign_in       INTEGER NOT NULL DEFAULT 0,
                lottery_count INTEGER NOT NULL DEFAULT 0,
                prize         TEXT,
                exp_gained    INTEGER NOT NULL DEFAULT 0,
                UNIQUE(date)
            )""")
        self._conn.execute(_META_DDL)
        self._conn.execute('INSERT OR IGNORE INTO streak (id) VALUES (1)')
        self._conn.commit()

    # ---------------- 内部工具 ----------------

    def _streak(self):
        return dict(self._conn.execute(
            'SELECT * FROM streak WHERE id = 1').fetchone())

    def _set_streak(self, cur, mx, level, d):
        self._conn.execute(
            'UPDATE streak SET current_days = ?, max_days = ?, level = ?, '
            'last_activity_date = ?, updated_at = datetime("now","localtime") '
            'WHERE id = 1', (cur, mx, level, d.isoformat()))

    def _meta(self, key, default=None):
        row = self._conn.execute(
            'SELECT v FROM spark_meta WHERE k = ?', (key,)).fetchone()
        return row['v'] if row else default

    def _set_meta(self, key, value):
        self._conn.execute(
            'INSERT OR REPLACE INTO spark_meta (k, v) VALUES (?, ?)',
            (key, str(value)))

    def _reward_row(self, d):
        row = self._conn.execute(
            'SELECT * FROM daily_reward WHERE date = ?',
            (d.isoformat(),)).fetchone()
        if row is None:
            self._conn.execute(
                'INSERT INTO daily_reward (date) VALUES (?)', (d.isoformat(),))
            # 必须立刻提交：本方法会被 lottery_chances() 这类"看着像只读"的接口调用，
            # 不提交就会让本连接长期占着写锁，把共用同一个库的 exp_engine 挡在门外
            # （表现为莫名的 "database is locked"）。
            self._conn.commit()
            row = self._conn.execute(
                'SELECT * FROM daily_reward WHERE date = ?',
                (d.isoformat(),)).fetchone()
        return dict(row)

    # ---------------- 火花：连续陪伴（续火/熄灭/挽回） ----------------

    def get_spark(self):
        """火花快照：连续天数/最高天数/档位/状态/今天是否已续火。"""
        st = self._streak()
        today = date.today().isoformat()
        return {
            'current_days': st['current_days'],
            'max_days': st['max_days'],
            'level': st['level'],
            'last_activity_date': st['last_activity_date'],
            'lit_today': st['last_activity_date'] == today,
            'status': self._status(st['current_days'], st['last_activity_date']),
        }

    def _status(self, cur, last_date):
        """火花状态：burning（燃烧中）/ risking（今天还没续·临近熄灭）/ extinguished（已熄灭）。"""
        if cur <= 0:
            return 'extinguished'
        today = date.today().isoformat()
        if last_date == today:
            return 'burning'
        return 'risking'          # 今天还没互动，还差一天就熄灭

    def register_activity(self, d=None):
        """互动登记：连续互动 → 续火；断档回归 → 挽回；首次 → 点燃。

        返回 spark 事件 dict（供决策引擎行为/回复联动）：
          event: 'new' 首次点燃 / 'keep' 续火 / 'recover' 熄灭后挽回 / 'already' 今日已记
        """
        d = d or date.today()
        st = self._streak()
        last = st['last_activity_date']
        today = d.isoformat()
        if last == today:
            return self._spark_event('already', st['current_days'], st['level'])
        if last:
            try:
                prev = date.fromisoformat(last)
            except ValueError:
                prev = None
        else:
            prev = None
        if prev and (d - prev).days == 1:
            cur = st['current_days'] + 1
            event = 'keep'
        elif prev:
            cur = 1
            event = 'recover'                 # 断档后回归 → 挽回
        else:
            cur = 1
            event = 'new'                     # 首次点燃
        level = level_from_days(cur)
        self._set_streak(cur, max(st['max_days'], cur), level, d)
        self._conn.commit()
        return self._spark_event(event, cur, level)

    def _spark_event(self, event, cur, level):
        return {'event': event, 'current_days': cur, 'level': level}

    def settle_missed_days(self, d=None):
        """结算断档：今天已是次日且昨天没互动 → 火花熄灭（连续天数归零）。

        由 on_tick 周期调用；返回是否发生了熄灭。持续不回来 → 归零一次后保持。
        """
        d = d or date.today()
        st = self._streak()
        if st['current_days'] <= 0 or not st['last_activity_date']:
            return False
        try:
            last = date.fromisoformat(st['last_activity_date'])
        except ValueError:
            return False
        if (d - last).days >= 2:              # 错过完整一天 → 熄灭
            self._set_streak(0, st['max_days'], 0, last)
            self._conn.commit()
            return True
        return False

    # ---------------- 三档提醒（18:00 / 21:00 / 23:00） ----------------

    def remind_due(self, now=None):
        """当前时刻是否该提醒（命中 18/21/23 且今天还没续火、且该档当天未提醒过）。

        返回提醒档位时刻（18/21/23）或 None。
        """
        now = now or datetime.now()
        if now.hour not in REMIND_TIMES:
            return None
        st = self._streak()
        if st['last_activity_date'] == now.date().isoformat():
            return None                        # 今天已互动，不用提醒
        reminded = self._reminded_tiers(now.date())
        if now.hour in reminded:
            return None                        # 本档当天已提醒过
        return now.hour

    def mark_reminded(self, tier, d=None):
        """记录某天某档已提醒（去重，防止每 60s 重复播报）。"""
        d = d or date.today()
        key = f'reminded:{d.isoformat()}'
        tiers = self._reminded_tiers(d)
        if tier not in tiers:
            tiers.append(tier)
            self._set_meta(key, json.dumps(tiers, ensure_ascii=False))
            self._conn.commit()      # 同上：不留未提交写事务

    def _reminded_tiers(self, d):
        raw = self._meta(f'reminded:{d.isoformat()}', '[]')
        try:
            return list(json.loads(raw))
        except (ValueError, TypeError):
            return []

    # ---------------- 每日任务（每天 4 点随机刷新） ----------------

    def daily_tasks(self, d=None, now=None):
        """获取（必要时随机生成）当天每日任务。刷新口径：每天 4 点后是新一天的任务。"""
        d = d or date.today()
        rows = [dict(r) for r in self._conn.execute(
            'SELECT * FROM daily_task WHERE date = ? ORDER BY id',
            (d.isoformat(),)).fetchall()]
        if rows:
            return rows
        picked = random.sample(TASK_POOL, TASK_DAILY_COUNT)
        for t in picked:
            self._conn.execute(
                'INSERT INTO daily_task (date, task_type, progress, target, done) '
                'VALUES (?, ?, 0, ?, 0)', (d.isoformat(), t['task_type'], t['target']))
        self._conn.commit()
        return self.daily_tasks(d, now)

    def report_event(self, source, d=None):
        """互动事件 → 累计当日匹配任务的进度；全部完成 → 发放 +2 次抽奖机会。

        返回 dict：{tasks_updated: [...], all_done: bool, bonus_granted: bool}。
        """
        d = d or date.today()
        tasks = self.daily_tasks(d)
        updated = []
        for t in tasks:
            if t['task_type'] == source and not t['done']:
                progress = t['progress'] + 1
                done = 1 if progress >= t['target'] else 0
                self._conn.execute(
                    'UPDATE daily_task SET progress = ?, done = ? '
                    'WHERE date = ? AND task_type = ?',
                    (progress, done, d.isoformat(), source))
                updated.append({'task_type': source, 'progress': progress,
                                'target': t['target'], 'done': bool(done)})
        all_done = all(self._task_done(d, t['task_type']) for t in tasks)
        bonus = False
        if all_done and self._meta(f'task_bonus:{d.isoformat()}') != '1':
            self._set_meta(f'task_bonus:{d.isoformat()}', '1')
            self._add_chances(d, DAILY_TASK_CHANCES)
            bonus = True
        self._conn.commit()
        return {'tasks_updated': updated, 'all_done': all_done,
                'bonus_granted': bonus}

    def _task_done(self, d, task_type):
        row = self._conn.execute(
            'SELECT done FROM daily_task WHERE date = ? AND task_type = ?',
            (d.isoformat(), task_type)).fetchone()
        return bool(row and row['done'])

    def tasks_all_done(self, d=None):
        d = d or date.today()
        tasks = self.daily_tasks(d)
        return bool(tasks) and all(
            self._task_done(d, t['task_type']) for t in tasks)

    # ---------------- 签到 / 抽奖 ----------------

    def sign_in(self, d=None):
        """每日签到（每天 1 次）→ +1 次抽奖机会。返回是否首次签到。"""
        d = d or date.today()
        row = self._reward_row(d)
        if row['sign_in']:
            return False
        self._conn.execute(
            'UPDATE daily_reward SET sign_in = 1, lottery_count = lottery_count + ? '
            'WHERE date = ?', (SIGNIN_CHANCES, d.isoformat()))
        self._conn.commit()
        return True

    def _add_chances(self, d, n):
        self._reward_row(d)                       # 确保当日记录存在（否则 UPDATE 空转）
        self._conn.execute(
            'UPDATE daily_reward SET lottery_count = lottery_count + ? '
            'WHERE date = ?', (n, d.isoformat()))

    def lottery_chances(self, d=None):
        d = d or date.today()
        return self._reward_row(d)['lottery_count']

    def draw_lottery(self, d=None, rng=None):
        """抽奖（消耗 1 次机会）：按 40/30/20/9.5/0.5% 出奖；200 次保底出超级大奖。

        抽奖经验不计入每周上限（由调用方以 weekly-exempt 来源加点）。
        rng 可注入（测试用固定随机序列）。
        """
        d = d or date.today()
        rng = rng or random.Random()
        row = self._reward_row(d)
        if row['lottery_count'] <= 0:
            return {'ok': False, 'message': '没有抽奖机会了，先签到或完成每日任务吧',
                    'prize': None, 'exp': 0, 'pity': self._pity()}
        self._conn.execute(
            'UPDATE daily_reward SET lottery_count = lottery_count - 1 '
            'WHERE date = ?', (d.isoformat(),))
        pity = self._pity()
        if pity + 1 >= LOTTERY_PITY:
            prize = LOTTERY_SUPER                      # 200 次保底
            pity = 0
        else:
            roll = rng.random()
            acc = 0.0
            prize = LOTTERY_PRIZES[-1]['prize']        # 兜底超级大奖（浮点容差）
            for p in LOTTERY_PRIZES:
                acc += p['prob']
                if roll < acc:
                    prize = p['prize']
                    break
            pity = 0 if prize == LOTTERY_SUPER else pity + 1
        self._set_meta('pity', pity)
        exp = next(p['exp'] for p in LOTTERY_PRIZES if p['prize'] == prize)
        self._conn.execute(
            'UPDATE daily_reward SET prize = ?, exp_gained = exp_gained + ? '
            'WHERE date = ?', (prize, exp, d.isoformat()))
        self._conn.commit()
        return {'ok': True, 'prize': prize, 'exp': exp, 'pity': pity,
                'message': f'抽中「{prize}」+{exp} 经验'}

    def _pity(self):
        raw = self._meta('pity', '0')
        try:
            return int(raw)
        except (TypeError, ValueError):
            return 0

    # ---------------- 里程碑解锁玩法接入（LED 灯位 / 肤位数据占位） ----------------

    def milestone_unlocks(self, level):
        """给定等级，返回已解锁玩法（功能 / LED 灯位 / 肤位外观）数据占位。

        核心功能 1~9 级解锁、10 级核心完成；后续非核心每 5 级一项到 30 级。
        LED 灯位 / 肤位为数据占位，供前端主题/皮肤切换与外观成长消费。
        """
        features = []
        for lv, names in sorted(CORE_FEATURES.items()):
            if level >= lv:
                features.extend(names)
        if level >= 10:
            features.append('核心功能解锁完成')
        for lv in sorted(NON_CORE_FEATURES):
            if level >= lv:
                features.append(NON_CORE_FEATURES[lv])
        led = [pos for lv, pos in sorted(LED_POSITIONS.items()) if level >= lv]
        skin = [s for lv, s in sorted(SKIN_SLOTS.items()) if level >= lv]
        return {'level': level, 'features': features, 'led': led, 'skin': skin}

    # ---------------- 统计 / 关闭 ----------------

    def today_summary(self, d=None):
        d = d or date.today()
        row = self._reward_row(d)
        return {
            'date': d.isoformat(),
            'sign_in': bool(row['sign_in']),
            'lottery_count': row['lottery_count'],
            'prize': row['prize'],
            'exp_gained': row['exp_gained'],
            'tasks': self.daily_tasks(d),
            'spark': self.get_spark(),
        }

    def close(self):
        self._conn.close()
