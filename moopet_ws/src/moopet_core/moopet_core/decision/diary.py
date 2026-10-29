#!/usr/bin/env python3
"""成长日记（W4 · 李文扬）——决策输出 → "狗狗日记" 落库。

对齐狗2.md 陪伴仪式感「成长日记：自动记录与用户的互动，生成狗狗日记」+ 排期 W4。

设计（保持纯逻辑与 ROS 分离）：
  - DecisionEngine.daily_stats(date) 统计某天互动（决策历史按日期）
  - build_diary_content(...) 纯函数：把统计 + 黑箱状态写成第一人称日记文本
  - DogDiary：SQLite 落库（diary 表，schema W1 已建；一天一条，重复写则覆盖）
    调用方：decision_engine_node（跨日时写昨日日记）/ standalone demo。
"""
import os
import sqlite3

# 与 data/schema.sql 中 diary 表一致（建库走 schema，这里兜底防缺表）
_DIARY_DDL = """
CREATE TABLE IF NOT EXISTS diary (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    date     TEXT NOT NULL DEFAULT (date('now', 'localtime')),
    content  TEXT NOT NULL,
    UNIQUE(date)
);
"""

# 互动中文名（日记用语）
_ACT_NAMES = {
    'pet': '主人摸了我',
    'handshake': '和主人握了手',
    'call': '听到了主人的呼唤',
    'walk': '跟主人出去散步了',
    'guide': '完成了使用指引',
    'air_quality': '一起关注了室内空气',
    'tick': '',
    'milestone': '迎来了升级里程碑',
    'anniversary': '过了有意义的一天',
}


def build_diary_content(date, stats, blackboard):
    """把某天的互动统计 + 决策黑箱写成第一人称日记文本（纯函数）。

    stats: DecisionEngine.daily_stats(date) 的结果
    blackboard: 决策黑箱（等级/心情/性格/情感账户）
    """
    level = blackboard.get('level', 1)
    personality = blackboard.get('personality', '独立型')
    account = round(float(blackboard.get('emotion_account', 50.0)))
    emotion = blackboard.get('emotion', 'neutral')
    emotion_cn = {'happy': '开心', 'sad': '有点低落', 'tired': '有点累',
                  'angry': '有点生气', 'neutral': '平静'}.get(emotion, '平静')

    parts = []
    quiz_c = stats.get('quiz_correct', 0)
    quiz_w = stats.get('quiz_wrong', 0)
    if quiz_c or quiz_w:
        line = f'今天陪主人答了 {quiz_c + quiz_w} 道题，答对 {quiz_c} 道'
        if quiz_c >= 10:
            line += '，还拿到了连击加餐，太开心啦'
        parts.append(line)
    pet_n = stats.get('pet', 0)
    if pet_n:
        parts.append(f'主人摸了我 {pet_n} 次' + ('，我最喜欢这个啦' if pet_n >= 3 else ''))
    walk_n = stats.get('walk', 0)
    if walk_n:
        parts.append(f'出去散步了 {walk_n} 次，风很舒服')
    call_n = stats.get('call', 0)
    if call_n:
        parts.append(f'主人叫了我 {call_n} 次，我都有好好回应')
    for key, name in _ACT_NAMES.items():
        if key in ('pet', 'walk', 'call', 'tick') or key not in stats:
            continue
        parts.append(f'{name} {stats[key]} 次')
    if not parts:
        parts.append('今天主人很忙，我安安静静等了一天')

    return (f'{date}。今天我 LV.{level}，心情{emotion_cn}，'
            f'是{personality}的小狗。\n' + '；'.join(parts) + f'。\n'
            f'我们的情感账户存到了 {account}，感觉我们越来越有默契啦。')


class DogDiary:
    """成长日记落库：diary 表一天一条（重复写覆盖），读最近若干条。"""

    def __init__(self, db_path):
        self.db_path = db_path
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self.conn = sqlite3.connect(db_path)
        self.conn.execute(_DIARY_DDL)
        self.conn.commit()

    def write(self, content, date=None):
        """写/覆盖某天日记（diary 表 UNIQUE(date)，INSERT OR REPLACE）。"""
        import datetime as _dt
        date = date or _dt.date.today().strftime('%Y-%m-%d')
        self.conn.execute('INSERT OR REPLACE INTO diary(date, content) VALUES(?, ?)',
                          (date, content))
        self.conn.commit()
        return date

    def read(self, date=None):
        import datetime as _dt
        date = date or _dt.date.today().strftime('%Y-%m-%d')
        row = self.conn.execute('SELECT content FROM diary WHERE date = ?',
                                (date,)).fetchone()
        return row[0] if row else None

    def latest(self, n=7):
        rows = self.conn.execute(
            'SELECT date, content FROM diary ORDER BY date DESC LIMIT ?', (n,)).fetchall()
        return rows

    def close(self):
        self.conn.close()
