#!/usr/bin/env python3
"""养成系机械狗 · 经验结算引擎（纯逻辑，无 ROS 依赖，可单测）。

对应排期 W2·黄鑫禹条目，由李文扬承接 demo 联调：
  - 7 种来源归一加经验（狗2.md：运动 1 + 居家 3 + 互动 3）
  - 周上限统计（按周一 week_start 聚合）
  - 衰减惩罚（连续 7 天未使用 → 经验逐天衰减，最低 30 级）
  - 升级/成就判定（依据 level_exp / achievement 表）
  - 边界用例见 tests/test_exp_engine.py

规则来源：狗2.md「养成需求」
"""
import os
import sqlite3
from datetime import date, timedelta

# ------------------------- 常量（对齐狗2.md） -------------------------

# 8 种来源：单位经验 + 每周上限（W3 新增 quiz 答题）
SOURCES = {
    'walk':          {'exp': 10, 'weekly_cap': 500},   # 运动类·散步 每50米
    'ventilate':     {'exp': 10, 'weekly_cap': 100},   # 居家类·通风提醒
    'projector':     {'exp': 10, 'weekly_cap': 100},   # 居家类·投影
    'communication': {'exp': 10, 'weekly_cap': 100},   # 居家类·通讯
    'pet':           {'exp': 10, 'weekly_cap': 200},   # 互动类·抚摸
    'handshake':     {'exp': 10, 'weekly_cap': 200},   # 互动类·握手
    'call':          {'exp': 10, 'weekly_cap': 200},   # 互动类·呼唤
    'quiz':          {'exp': 10, 'weekly_cap': 200},   # 智能类·答题答对（W3）
}

WALK_DISTANCE_M = 50          # 每 50 米散步 +10
GUIDE_EXP = 100               # 使用指引全套流程一次性 +100
WEEKLY_MAX_EXP = 2000         # 每周最多获取经验
MAX_LEVEL = 100               # 最高等级
MIN_DECAY_LEVEL = 30          # 衰减最低等级
DECAY_AFTER_DAYS = 7          # 连续 7 天未使用触发衰减
DECAY_EXP_PER_DAY = 10        # 每超期一天衰减经验

# W3 答题连击奖励（一次性，不计入 quiz 周上限；对齐排期「5/10 连击奖励」）
QUIZ_COMBO_BONUS = {5: 50, 10: 100}

# W5 抽奖经验来源（不计入每周经验上限，对齐狗2.md「抽奖经验不计入每周经验获取」）
WEEKLY_EXEMPT_SOURCES = ('achievement', 'quiz_combo', 'lottery')

# 成就定义（一次性解锁）
ACHIEVEMENTS = [
    dict(code='FIRST_EXP',    name='初次见面',  desc='获得第一笔经验',          exp_reward=20),
    dict(code='LEVEL_5',      name='成长之路',  desc='达到 5 级',              exp_reward=50),
    dict(code='LEVEL_10',     name='小有所成',  desc='达到 10 级',             exp_reward=100),
    dict(code='WEEK_CAP',     name='劳逸结合',  desc='单周经验达到周上限 2000', exp_reward=150),
    dict(code='EXP_500',      name='经验丰富',  desc='累计经验达到 500',        exp_reward=100),
    dict(code='EXP_1000',     name='大师养成',  desc='累计经验达到 1000',       exp_reward=200),
    dict(code='ALL_INTERACT', name='全能互动',  desc='完成全部 7 种互动来源',    exp_reward=200),
    dict(code='QUIZ_10',      name='答题小能手', desc='累计答对 10 题',          exp_reward=100),
]

SCHEMA_PATH = os.path.join(os.path.dirname(__file__), 'data', 'schema.sql')


def monday_of(d):
    """该日期所在周的周一（周上限聚合口径）"""
    return d - timedelta(days=d.weekday())


class ExpEngine:
    """经验结算引擎：SQLite 持久化，7 来源归一 + 周上限 + 衰减 + 升级/成就。"""

    def __init__(self, db_path=None):
        if db_path is None:
            db_path = os.path.join(os.path.expanduser('~'), '.moopet', 'moopet.db')
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.db_path = db_path
        self._conn = sqlite3.connect(db_path)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute('PRAGMA foreign_keys = ON')
        self._init_db()

    # ---------------- 初始化 ----------------

    def _init_db(self):
        with open(SCHEMA_PATH, encoding='utf-8') as f:
            self._conn.executescript(f.read())
        self._seed_level_curve()
        self._seed_achievements()
        self._conn.commit()

    def _seed_level_curve(self):
        """等级经验曲线：等级 2~9 用狗2.md 表格，9 级后每级递增 5（封顶 200）。"""
        curve = {1: 0, 2: 10, 3: 20, 4: 35, 5: 55, 6: 80, 7: 110, 8: 145, 9: 185}
        cum = 185
        for level in range(10, MAX_LEVEL + 1):
            inc = min(40 + (level - 9) * 5, 200)
            cum += inc
            curve[level] = cum
        for level, req in curve.items():
            self._conn.execute(
                'INSERT OR IGNORE INTO level_exp (level, exp_required) VALUES (?, ?)',
                (level, req))

    def _seed_achievements(self):
        for a in ACHIEVEMENTS:
            self._conn.execute(
                'INSERT OR IGNORE INTO achievement (code, name, descr, exp_reward) '
                'VALUES (?, ?, ?, ?)', (a['code'], a['name'], a['desc'], a['exp_reward']))

    # ---------------- 查询 ----------------

    def _state(self):
        row = self._conn.execute('SELECT * FROM dog_state WHERE id = 1').fetchone()
        return dict(row)

    def _week_sum(self, source, week):
        row = self._conn.execute(
            'SELECT COALESCE(SUM(amount), 0) AS s FROM exp_record '
            'WHERE source = ? AND week_start = ?', (source, week.isoformat())).fetchone()
        return row['s']

    def _week_all(self, week):
        row = self._conn.execute(
            'SELECT COALESCE(SUM(amount), 0) AS s FROM exp_record '
            'WHERE week_start = ?', (week.isoformat(),)).fetchone()
        return row['s']

    def _insert_record(self, source, amount, week, note):
        self._conn.execute(
            'INSERT INTO exp_record (source, amount, week_start, note) VALUES (?, ?, ?, ?)',
            (source, amount, week.isoformat(), note))

    def level_from_exp(self, total_exp):
        row = self._conn.execute(
            'SELECT MAX(level) AS lv FROM level_exp WHERE exp_required <= ?',
            (total_exp,)).fetchone()
        return row['lv'] or 1

    def exp_into_next(self, total_exp):
        lv = self.level_from_exp(total_exp)
        cur = self._conn.execute('SELECT exp_required FROM level_exp WHERE level = ?',
                                 (lv,)).fetchone()['exp_required']
        if lv >= MAX_LEVEL:
            return 0
        nxt = self._conn.execute('SELECT exp_required FROM level_exp WHERE level = ?',
                                 (lv + 1,)).fetchone()['exp_required']
        return nxt - cur

    # ---------------- 核心：加点 ----------------

    def gain(self, source, amount=0, note='', d=None, skip_achievements=False):
        """归一加点入口。返回结算结果 dict。
        source in SOURCES / 'guide' / 'achievement' / 'quiz_combo'（W3 连击奖励）
        """
        d = d or date.today()
        week = monday_of(d)
        requested = amount or SOURCES.get(source, {}).get('exp', 0)
        capped = False
        weekly_exempt = source in WEEKLY_EXEMPT_SOURCES   # 免周上限（成就/连击/W5 抽奖）

        if source == 'guide':
            done = self._conn.execute(
                'SELECT COUNT(*) AS c FROM exp_record WHERE source = ?',
                ('guide',)).fetchone()['c']
            if done > 0:
                return self._result(source, 0, 0, False, d,
                                    message='使用指引已完成过一次，不重复加点')
            requested = GUIDE_EXP
        elif weekly_exempt:
            # 成就 / 答题连击奖励：不计周上限，按 amount 直接给
            requested = amount
            if requested <= 0:
                return self._result(source, 0, 0, True, d, message='无可加点数')
        elif source in SOURCES:
            week_sum = self._week_sum(source, week)
            remaining = SOURCES[source]['weekly_cap'] - week_sum
            if remaining <= 0:
                return self._result(source, 0, 0, True, d,
                                    message=f'{source} 本周已达上限'
                                            f'（{SOURCES[source]["weekly_cap"]}）')
            if requested > remaining:
                requested, capped = remaining, True
            # 全局周上限 2000
            week_all = self._week_all(week)
            if week_all >= WEEKLY_MAX_EXP:
                return self._result(source, 0, 0, True, d, message='本周经验已满 2000')
            if requested > WEEKLY_MAX_EXP - week_all:
                requested, capped = WEEKLY_MAX_EXP - week_all, True
        else:
            raise ValueError(f'未知经验来源: {source}')

        if requested <= 0:
            return self._result(source, 0, 0, True, d, message='无可加点数')

        self._insert_record(source, requested, week, note)

        st = self._state()
        new_total = st['total_exp'] + requested
        new_week = st['week_exp'] + (0 if weekly_exempt else requested)
        new_level = self.level_from_exp(new_total)
        leveled_up = new_level > st['level']

        self._conn.execute(
            'UPDATE dog_state SET level = ?, total_exp = ?, week_exp = ?, '
            'week_start = ?, last_active_date = ?, updated_at = datetime("now","localtime") '
            'WHERE id = 1',
            (new_level, new_total, new_week, week.isoformat(), d.isoformat()))
        # 注意：连续天数（streak 表）的写入权归 SparkEngine.register_activity。
        # 这里**刻意不写**——W5 时两处都写同一行，导致 spark 看到"今天已登记"而
        # 把点燃/续火/挽回事件吞掉（火花话术不触发）。streak 只有一个写入方。

        unlocked = []
        if not skip_achievements:
            unlocked = self._check_achievements(d)

        self._conn.commit()
        msg = f'{source} +{requested} 经验'
        if capped:
            msg += '（本周该来源已到上限，按剩余结算）'
        return self._result(source, requested, new_level, capped, d,
                            leveled_up=leveled_up, old_level=st['level'],
                            week_exp=new_week, total_exp=new_total,
                            unlocked=unlocked, message=msg)

    def _result(self, source, exp_gained, level, capped, d, message='',
                leveled_up=False, old_level=None, week_exp=None, total_exp=None,
                unlocked=None):
        st = self._state() if total_exp is None else None
        return {
            'source': source,
            'exp_gained': exp_gained,
            'capped': capped,
            'level': level or st['level'],
            'old_level': old_level,
            'leveled_up': leveled_up,
            'week_exp': week_exp if week_exp is not None else st['week_exp'],
            'total_exp': total_exp if total_exp is not None else st['total_exp'],
            'unlocked': unlocked or [],
            'message': message,
            'date': d,
        }

    # ---------------- 散步：按里程结算 ----------------

    def add_walk_distance(self, meters, d=None, skip_achievements=False):
        """累计里程，每满 50m 结算一次 walk +10。"""
        d = d or date.today()
        st = self._state()
        rem = st['walk_remainder'] + meters
        count = int(rem // WALK_DISTANCE_M)
        rem = rem - count * WALK_DISTANCE_M
        self._conn.execute('UPDATE dog_state SET walk_remainder = ? WHERE id = 1', (rem,))
        results = []
        for _ in range(count):
            results.append(self.gain('walk', note='散步里程结算', d=d,
                                     skip_achievements=skip_achievements))
        self._conn.commit()
        return results

    # ---------------- W3 答题：结算 + 连击 ----------------

    def quiz_answer(self, correct, combo_count=0, category='', question_id=0, d=None,
                    skip_achievements=False):
        """W3 答题结算（quiz_node 与 /dog/combo 判题桥接共用）。

        - 每次作答写入 quiz_record（对错 + 连击数）
        - 答对：quiz 来源 +10（周上限 200）；连击到 5/10 → 连击奖励（免周上限）
        - 答错：不加点，仅记录
        返回合并后的结算 dict（correct / combo_count / bonus_exp / leveled_up）。
        """
        d = d or date.today()
        self._conn.execute(
            'INSERT INTO quiz_record (question_id, category, is_correct, combo_count) '
            'VALUES (?, ?, ?, ?)', (question_id, category, 1 if correct else 0, combo_count))
        if not correct:
            self._conn.commit()
            st = self._state()
            return {
                'correct': False, 'source': 'quiz', 'exp_gained': 0,
                'combo_count': combo_count, 'bonus_exp': 0,
                'level': st['level'], 'week_exp': st['week_exp'],
                'total_exp': st['total_exp'], 'leveled_up': False, 'unlocked': [],
                'message': f'答错啦（{category}），再接再厉，不加点', 'date': d,
            }

        base = self.gain('quiz', note=f'答题·{category}', d=d,
                         skip_achievements=skip_achievements)
        unlocked = list(base.get('unlocked') or [])
        bonus = 0
        if combo_count in QUIZ_COMBO_BONUS:
            bonus = QUIZ_COMBO_BONUS[combo_count]
            b = self.gain('quiz_combo', amount=bonus, note=f'答题连击×{combo_count} 奖励',
                          d=d, skip_achievements=skip_achievements)
            for name in b.get('unlocked') or []:
                if name not in unlocked:
                    unlocked.append(name)
        st = self._state()
        return {
            'correct': True, 'source': 'quiz',
            'exp_gained': base['exp_gained'] + bonus,
            'base_exp': base['exp_gained'], 'bonus_exp': bonus,
            'combo_count': combo_count, 'level': st['level'],
            'week_exp': st['week_exp'], 'total_exp': st['total_exp'],
            'leveled_up': base.get('leveled_up', False), 'unlocked': unlocked,
            'message': (f'答对啦（{category}）+{base["exp_gained"]}'
                        + (f'，连击×{combo_count} 奖励 +{bonus}' if bonus else '')),
            'date': d,
        }

    def quiz_correct_total(self, category=''):
        """累计答对题数（成就 QUIZ_10 与统计用）。"""
        sql = 'SELECT COUNT(*) AS c FROM quiz_record WHERE is_correct = 1'
        args = ()
        if category:
            sql += ' AND category = ?'
            args = (category,)
        return self._conn.execute(sql, args).fetchone()['c']

    # ---------------- W5 抽奖加点（经验不计入每周上限） ----------------

    def lottery_gain(self, amount, note='抽奖奖励', d=None, skip_achievements=False):
        """抽奖经验加点：走 weekly-exempt 来源 'lottery'，不计入每周经验获取（狗2.md）。"""
        return self.gain('lottery', amount=amount, note=note, d=d,
                         skip_achievements=skip_achievements)

    # ---------------- 火花（连续使用，轻量版） ----------------

    def _update_streak(self, d):
        """【已废弃·保留兼容】连续天数写入权已归 SparkEngine.register_activity。

        留着这个方法是为了不让历史调用点直接报错；新代码不要调用它，
        否则又会和火花引擎抢同一行 streak 数据。
        """
        row = self._conn.execute('SELECT * FROM streak WHERE id = 1').fetchone()
        last = row['last_activity_date']
        if last == d.isoformat():
            cur = row['current_days']
        else:
            try:
                prev = date.fromisoformat(last)
                cur = row['current_days'] + 1 if (d - prev).days == 1 else 1
            except ValueError:
                cur = 1
        mx = max(row['max_days'], cur)
        lvl = min(5, cur // 7)          # 每连续 7 天升一档（0~5）
        self._conn.execute(
            'UPDATE streak SET current_days = ?, max_days = ?, level = ?, '
            'last_activity_date = ?, updated_at = datetime("now","localtime") WHERE id = 1',
            (cur, mx, lvl, d.isoformat()))

    def get_streak(self):
        """只读：连续陪伴状态由 SparkEngine 维护，这里仅用于状态展示。"""
        row = self._conn.execute('SELECT * FROM streak WHERE id = 1').fetchone()
        return dict(row)

    # ---------------- 成就判定（一次性） ----------------

    def _check_achievements(self, d):
        st = self._state()
        week = monday_of(d)
        week_all = self._week_all(week)
        used_sources = {r['source'] for r in self._conn.execute(
            'SELECT DISTINCT source FROM exp_record').fetchall()}
        unlocked = []

        def cond(code):
            if code == 'FIRST_EXP':
                return st['total_exp'] > 0
            if code == 'LEVEL_5':
                return st['level'] >= 5
            if code == 'LEVEL_10':
                return st['level'] >= 10
            if code == 'WEEK_CAP':
                return week_all >= WEEKLY_MAX_EXP
            if code == 'EXP_500':
                return st['total_exp'] >= 500
            if code == 'EXP_1000':
                return st['total_exp'] >= 1000
            if code == 'ALL_INTERACT':
                return SOURCES.keys() <= used_sources
            if code == 'QUIZ_10':
                return self.quiz_correct_total() >= 10
            return False

        rows = self._conn.execute('SELECT * FROM achievement').fetchall()
        for a in rows:
            if cond(a['code']):
                got = self._conn.execute(
                    'SELECT COUNT(*) AS c FROM user_achievement WHERE achievement_id = ?',
                    (a['id'],)).fetchone()['c']
                if got == 0:
                    self._conn.execute(
                        'INSERT INTO user_achievement (achievement_id) VALUES (?)', (a['id'],))
                    # 成就奖励：计入 total，不占周上限
                    self._insert_record('achievement', a['exp_reward'], week,
                                        f'成就：{a["name"]}')
                    self._conn.execute(
                        'UPDATE dog_state SET total_exp = total_exp + ?, '
                        'level = ?, updated_at = datetime("now","localtime") WHERE id = 1',
                        (a['exp_reward'], self.level_from_exp(st['total_exp'] + a['exp_reward'])))
                    unlocked.append(a['name'])
        return unlocked

    # ---------------- 衰减惩罚 ----------------

    def decay_check(self, d=None):
        """连续 7 天未使用：经验逐天衰减，最低 30 级。"""
        d = d or date.today()
        st = self._state()
        if not st['last_active_date']:
            return {'decayed_exp': 0, 'level': st['level']}
        last = date.fromisoformat(st['last_active_date'])
        idle = (d - last).days
        if idle < DECAY_AFTER_DAYS:
            return {'decayed_exp': 0, 'level': st['level'], 'idle_days': idle}

        decay_days = idle - (DECAY_AFTER_DAYS - 1)
        decay_exp = decay_days * DECAY_EXP_PER_DAY

        floor_row = self._conn.execute(
            'SELECT exp_required FROM level_exp WHERE level = ?', (MIN_DECAY_LEVEL,)).fetchone()
        floor = floor_row['exp_required']
        new_total = max(floor, st['total_exp'] - decay_exp)
        decayed = st['total_exp'] - new_total
        new_level = self.level_from_exp(new_total)
        self._conn.execute(
            'UPDATE dog_state SET total_exp = ?, level = ?, '
            'updated_at = datetime("now","localtime") WHERE id = 1', (new_total, new_level))
        self._conn.commit()
        return {'decayed_exp': decayed, 'level': new_level, 'idle_days': idle,
                'total_exp': new_total}

    # ---------------- 状态快照 ----------------

    def get_state(self):
        st = self._state()
        streak = self.get_streak()
        return {
            'level': st['level'],
            'total_exp': st['total_exp'],
            'week_exp': st['week_exp'],
            'week_start': st['week_start'],
            'emotion': st['emotion'],
            'personality': st['personality'],
            'exp_into_next': self.exp_into_next(st['total_exp']),
            'streak_days': streak['current_days'],
            'streak_max': streak['max_days'],
            'streak_level': streak['level'],
        }

    def set_emotion(self, emotion):
        self._conn.execute('UPDATE dog_state SET emotion = ? WHERE id = 1', (emotion,))
        self._conn.commit()

    def close(self):
        self._conn.close()


if __name__ == '__main__':
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        eng = ExpEngine(os.path.join(tmp, 'demo.db'))
        print('=== 经验结算引擎自检 ===')
        print('初始:', eng.get_state())
        r = eng.gain('guide')
        print(r['message'], '| 等级', r['level'])
        for src in ['pet', 'pet', 'handshake', 'call']:
            r = eng.gain(src)
            print(r['message'], '| 等级', r['level'],
                  ('[升级!]' if r['leveled_up'] else ''),
                  (' 解锁:' + '、'.join(r['unlocked']) if r['unlocked'] else ''))
        r = eng.gain('ventilate')
        print(r['message'], '| 等级', r['level'])
        print('最终:', eng.get_state())
        eng.close()
