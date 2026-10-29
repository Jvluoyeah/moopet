-- ============================================================
-- 养成系机械狗 SQLite 建库脚本（11 张表）
-- 对应方案 §6 数据模型，W1·牛浩然 schema.sql 口径
-- 实际文件路径：moopet_dog/moopet_dog/data/schema.sql
-- ============================================================

PRAGMA journal_mode = WAL;

-- 1. 用户
CREATE TABLE IF NOT EXISTS user (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL DEFAULT '主人',
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 2. 狗本体状态（当前等级/累计经验/心情/性格）
CREATE TABLE IF NOT EXISTS dog_state (
    id               INTEGER PRIMARY KEY CHECK (id = 1),
    level            INTEGER NOT NULL DEFAULT 1,
    total_exp        INTEGER NOT NULL DEFAULT 0,
    week_exp         INTEGER NOT NULL DEFAULT 0,
    week_start       TEXT,                -- 本周周一日期 YYYY-MM-DD
    emotion          TEXT NOT NULL DEFAULT 'neutral',
    personality      TEXT NOT NULL DEFAULT '独立型',
    walk_remainder   INTEGER NOT NULL DEFAULT 0,   -- 散步不足 50m 的里程余量
    last_active_date TEXT NOT NULL DEFAULT '',     -- 最近一次使用日期（衰减判定）
    updated_at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 3. 经验流水（7 种来源归一 + 指引/成就等）
CREATE TABLE IF NOT EXISTS exp_record (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source      TEXT NOT NULL,            -- walk/ventilate/projector/communication/pet/handshake/call/guide/achievement
    amount      INTEGER NOT NULL,
    week_start  TEXT NOT NULL,            -- 所属周（周一），用于周上限聚合
    note        TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 4. 等级经验曲线
CREATE TABLE IF NOT EXISTS level_exp (
    level        INTEGER PRIMARY KEY,
    exp_required INTEGER NOT NULL         -- 到达该级所需累计经验
);

-- 5. 成就定义
CREATE TABLE IF NOT EXISTS achievement (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    code      TEXT UNIQUE NOT NULL,
    name      TEXT NOT NULL,
    descr     TEXT,
    exp_reward INTEGER NOT NULL DEFAULT 0
);

-- 6. 用户已解锁成就（一次性）
CREATE TABLE IF NOT EXISTS user_achievement (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    achievement_id INTEGER NOT NULL REFERENCES achievement(id),
    unlocked_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    UNIQUE(achievement_id)
);

-- 7. 火花/连续使用
CREATE TABLE IF NOT EXISTS streak (
    id                 INTEGER PRIMARY KEY CHECK (id = 1),
    current_days       INTEGER NOT NULL DEFAULT 0,
    max_days           INTEGER NOT NULL DEFAULT 0,
    level              INTEGER NOT NULL DEFAULT 0,   -- 0~5 档
    last_activity_date TEXT NOT NULL DEFAULT '',
    updated_at         TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 8. 成长日记（W4）
CREATE TABLE IF NOT EXISTS diary (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    date     TEXT NOT NULL DEFAULT (date('now', 'localtime')),
    content  TEXT NOT NULL,
    UNIQUE(date)
);

-- 9. 答题记录（W3）
CREATE TABLE IF NOT EXISTS quiz_record (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,
    category    TEXT,
    is_correct  INTEGER NOT NULL,
    combo_count INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 10. 每日任务（W5，先建表）
CREATE TABLE IF NOT EXISTS daily_task (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT NOT NULL,
    task_type   TEXT NOT NULL,
    progress    INTEGER NOT NULL DEFAULT 0,
    target      INTEGER NOT NULL DEFAULT 1,
    done        INTEGER NOT NULL DEFAULT 0,
    UNIQUE(date, task_type)
);

-- 11. 每日签到/抽奖（狗2.md）
CREATE TABLE IF NOT EXISTS daily_reward (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    date         TEXT NOT NULL,
    sign_in      INTEGER NOT NULL DEFAULT 0,   -- 1=已签到
    lottery_count INTEGER NOT NULL DEFAULT 0,
    prize        TEXT,
    exp_gained   INTEGER NOT NULL DEFAULT 0,
    UNIQUE(date)
);

-- 默认主人
INSERT OR IGNORE INTO user (id, name) VALUES (1, '主人');
-- 默认狗状态
INSERT OR IGNORE INTO dog_state (id) VALUES (1);
-- 默认火花
INSERT OR IGNORE INTO streak (id) VALUES (1);
