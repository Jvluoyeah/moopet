"""数据模型（服务端侧）。

与狗本体的 11 张养成表**刻意分开**：
  * 养成数据（经验/等级/火花/日记）以**狗本地为权威**，断网也能养狗；
  * 服务端只管账号、社群、对战、排行这些"必须联网才有意义"的东西。
两边的接缝是 `Match.pending_exp`：对战奖励先记账，狗上线后自己领取并本地结算。

表一览：
  account / breed / dog_profile / community / community_member /
  presence / friendship / visit / match / match_player / leaderboard_entry
  + 月塔端口那三张（checkin / lottery_draw / diary_entry，见文件末尾）
"""
from datetime import datetime

from sqlalchemy import (JSON, Boolean, DateTime, ForeignKey, Integer, String,
                        UniqueConstraint, func)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _now():
    return datetime.utcnow()


class Account(Base):
    __tablename__ = 'account'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(128), default='')
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(16), default='user')
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    # 昵称：登录名（username）之后**不能改**，昵称可以。
    # 空字符串表示"还没起过昵称"，对外一律回退成 username。
    # ⚠️ 这两列是后加的，而 `create_all` **只建表、不补列** ——
    #    已有库要靠 db.ensure_columns() 补（见 db.py 里的说明）。
    nickname: Mapped[str] = mapped_column(String(32), default='')
    # token 版本号。改密码 / 退出其他设备时 +1，
    # 旧 token 里的 ver 对不上就失效 —— 这是"多设备"那条的基础。
    token_version: Mapped[int] = mapped_column(Integer, default=0)

    dogs: Mapped[list['DogProfile']] = relationship(back_populates='account')


class LoginSession(Base):
    """一次登录 = 一台设备。

    为什么需要它：JWT 是**无状态**的，签出去就收不回来 ——
    没有这张表就做不到"看看我都在哪些设备上登录着""把那台踢下线"。
    每个 token 带一个 jti，这里记一行；撤销就是给这一行盖 revoked_at。
    """
    __tablename__ = 'login_session'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey('account.id'), index=True)
    jti: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_agent: Mapped[str] = mapped_column(String(255), default='')
    ip: Mapped[str] = mapped_column(String(64), default='')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Breed(Base):
    """品种：形象包 + 四维（社群互动与对战共用）。"""
    __tablename__ = 'breed'

    code: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(32))
    subtitle: Mapped[str] = mapped_column(String(64), default='')
    # 四维：体力 / 敏捷 / 智力 / 亲和
    power: Mapped[int] = mapped_column(Integer, default=50)
    agility: Mapped[int] = mapped_column(Integer, default=50)
    wisdom: Mapped[int] = mapped_column(Integer, default=50)
    affinity: Mapped[int] = mapped_column(Integer, default=50)
    asset_pack: Mapped[str] = mapped_column(String(64), default='')
    palette: Mapped[dict] = mapped_column(JSON, default=dict)
    description: Mapped[str] = mapped_column(String(255), default='')
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class DogProfile(Base):
    """狗狗档案：一只狗 = 一个账号领养的一只机械狗。"""
    __tablename__ = 'dog_profile'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey('account.id'), index=True)
    name: Mapped[str] = mapped_column(String(24))
    breed_code: Mapped[str] = mapped_column(ForeignKey('breed.code'))
    # 云端只做"镜像展示"：等级/经验由狗本体上报，云端不反向下发
    level: Mapped[int] = mapped_column(Integer, default=1)
    total_exp: Mapped[int] = mapped_column(Integer, default=0)
    personality: Mapped[str] = mapped_column(String(16), default='独立型')
    appearance: Mapped[dict] = mapped_column(JSON, default=dict)
    # 成就由狗本体解锁，云端只镜像展示（档案卡上要显示徽章）
    achievements: Mapped[list] = mapped_column(JSON, default=list)
    motto: Mapped[str] = mapped_column(String(64), default='')
    # 演示用 NPC 狗（预置数据）：由服务端惰性刷新位置，让广场看起来是活的
    is_npc: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    account: Mapped[Account] = relationship(back_populates='dogs')
    breed: Mapped[Breed] = relationship()


class Community(Base):
    """社群：注册领养后自动加入的公开社群。"""
    __tablename__ = 'community'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(48))
    kind: Mapped[str] = mapped_column(String(16), default='public')
    description: Mapped[str] = mapped_column(String(255), default='')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class CommunityMember(Base):
    __tablename__ = 'community_member'
    __table_args__ = (UniqueConstraint('community_id', 'dog_id'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    community_id: Mapped[int] = mapped_column(ForeignKey('community.id'), index=True)
    dog_id: Mapped[int] = mapped_column(ForeignKey('dog_profile.id'), index=True)
    friendship_points: Mapped[int] = mapped_column(Integer, default=0)
    social_level: Mapped[int] = mapped_column(Integer, default=1)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Presence(Base):
    """开放世界在线状态：谁在哪个场景、站在哪。

    **坐标单位是"格"（整数），不是 1/100 格**——这一点曾经两边不一致过：
    早期注释写着 1/100，但种子数据与 `/api/world` 一直按"格"存取，
    结果端到端联机时新领养的狗会出生在场地角落。
    v2 起统一成"格"，`/ws/world/{scene}` 广播的也是"格"。
    """
    __tablename__ = 'presence'

    dog_id: Mapped[int] = mapped_column(ForeignKey('dog_profile.id'), primary_key=True)
    scene: Mapped[str] = mapped_column(String(24), default='plaza')
    x: Mapped[int] = mapped_column(Integer, default=0)     # 格
    y: Mapped[int] = mapped_column(Integer, default=0)     # 格（对应世界坐标的 z）
    status: Mapped[str] = mapped_column(String(16), default='idle')
    bubble: Mapped[str] = mapped_column(String(64), default='')
    last_seen: Mapped[datetime] = mapped_column(DateTime, default=_now,
                                                onupdate=_now)


class Friendship(Base):
    __tablename__ = 'friendship'
    __table_args__ = (UniqueConstraint('dog_a', 'dog_b'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dog_a: Mapped[int] = mapped_column(ForeignKey('dog_profile.id'), index=True)
    dog_b: Mapped[int] = mapped_column(ForeignKey('dog_profile.id'), index=True)
    points: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Visit(Base):
    """串门记录：去别人的狗窝看过。"""
    __tablename__ = 'visit'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    visitor_dog_id: Mapped[int] = mapped_column(ForeignKey('dog_profile.id'),
                                                index=True)
    host_dog_id: Mapped[int] = mapped_column(ForeignKey('dog_profile.id'), index=True)
    message: Mapped[str] = mapped_column(String(64), default='')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class Match(Base):
    """对战：一局 = 一条记录，含回放所需的输入日志。"""
    __tablename__ = 'match'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    room_code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    mode: Mapped[str] = mapped_column(String(16), default='ai')   # ai/shadow/pvp
    status: Mapped[str] = mapped_column(String(16), default='waiting')  # waiting/playing/done/aborted
    seed: Mapped[int] = mapped_column(Integer, default=0)
    frames: Mapped[int] = mapped_column(Integer, default=0)
    input_log: Mapped[list] = mapped_column(JSON, default=list)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    pending_exp: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class MatchPlayer(Base):
    __tablename__ = 'match_player'
    __table_args__ = (UniqueConstraint('match_id', 'side'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    match_id: Mapped[int] = mapped_column(ForeignKey('match.id'), index=True)
    dog_id: Mapped[int | None] = mapped_column(ForeignKey('dog_profile.id'),
                                               nullable=True)   # AI 座位为空
    side: Mapped[int] = mapped_column(Integer, default=0)       # 0/1
    display_name: Mapped[str] = mapped_column(String(32), default='')
    score: Mapped[int] = mapped_column(Integer, default=0)
    is_ai: Mapped[bool] = mapped_column(Boolean, default=False)
    claimed: Mapped[bool] = mapped_column(Boolean, default=False)


class LeaderboardEntry(Base):
    """统一排行榜：等级榜 / 对战榜 / 社交榜（学参考站的"统一排行榜组件"）。"""
    __tablename__ = 'leaderboard_entry'
    __table_args__ = (UniqueConstraint('kind', 'dog_id'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(16), index=True)   # level/match/social
    dog_id: Mapped[int] = mapped_column(ForeignKey('dog_profile.id'), index=True)
    score: Mapped[int] = mapped_column(Integer, default=0)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now,
                                                 onupdate=_now)


class TrainingProgress(Base):
    """剧情关卡进度：「档案册」里的一条训练记录。

    一句话边界：**关卡怎么打是客户端的事，通关这件事由服务端记账**。
    经验仍按"养成本地权威"由客户端 exp_engine 结算，
    服务端只保证"首通奖励只能领一次"和"通关榜是真的"。

    存的是**最好成绩**：星级取最高、用时取最短。
    重复通关会更新它们，但不会让成绩变差（否则刷一关就能把榜刷烂）。
    """
    __tablename__ = 'training_progress'
    __table_args__ = (UniqueConstraint('dog_id', 'level_code'),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dog_id: Mapped[int] = mapped_column(ForeignKey('dog_profile.id'), index=True)
    level_code: Mapped[str] = mapped_column(String(16), index=True)
    cleared: Mapped[bool] = mapped_column(Boolean, default=False)
    stars: Mapped[int] = mapped_column(Integer, default=0)       # 最好星级 0~3
    best_ticks: Mapped[int] = mapped_column(Integer, default=0)  # 最快通关帧数（0 = 没通过）
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    first_clear_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now,
                                                 onupdate=_now)


class TrainingDrop(Base):
    """掉落记录：首通的大件只给一次，重复通关给少量经验。

    单独一张表而不是塞进 progress：掉落是要能"翻流水"的
    （以后做背包/合成时，玩家会问"我这个齿轮哪来的"）。
    """
    __tablename__ = 'training_drop'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dog_id: Mapped[int] = mapped_column(ForeignKey('dog_profile.id'), index=True)
    level_code: Mapped[str] = mapped_column(String(16), index=True)
    item: Mapped[str] = mapped_column(String(32), default='')
    exp: Mapped[int] = mapped_column(Integer, default=0)
    first_clear: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


# ---------------- 月塔端口（签到 / 抽签 / 册子上的日记） ----------------
# 为什么这三张在**服务端**（和上面那条"养成数据以本地为权威"不冲突）：
#   · 签到与抽签天生要**全局计时 + 防刷**（一天一次、保底计数），
#     本地算等于把日历交给客户端，改个系统时间就无限签；
#   · 日记反过来 —— 按既定架构它是"本地权威、上行镜像"，
#     这里存的是**镜像**：由真实行为（对战/训练/串门/盖章）在各自动作点写入，
#     这样网页端和游戏里看到的是同一份，不用等哪一边先联网。

class Checkin(Base):
    """每天在册子上按一个印。连续天数在这里累计。"""
    __tablename__ = 'checkin'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dog_id: Mapped[int] = mapped_column(ForeignKey('dog_profile.id'), index=True)
    # 按"长夜月的哪一天"记，用本地时区的日期串（YYYY-MM-DD）。同一天只有一行。
    day: Mapped[str] = mapped_column(String(10), index=True)
    streak: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class LotteryDraw(Base):
    """抽签流水。

    每个 dog 一行一次抽；`pity` 记"距上次出稀有过了几抽"，用来做保底
    （保底必须在服务端算，否则客户端可以说自己每次都中）。
    """
    __tablename__ = 'lottery_draw'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dog_id: Mapped[int] = mapped_column(ForeignKey('dog_profile.id'), index=True)
    day: Mapped[str] = mapped_column(String(10), index=True)
    prize_code: Mapped[str] = mapped_column(String(32))
    rarity: Mapped[str] = mapped_column(String(8), default='common')
    pity: Mapped[int] = mapped_column(Integer, default=0)      # 这一抽之后，离保底还差几抽
    from_pity: Mapped[bool] = mapped_column(Boolean, default=False)   # 是不是保底给的
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class DiaryEntry(Base):
    """册子上的日记（镜像）。

    由**真实行为**在各自动作点写入 —— 对战结算、训练通关、串门、盖章、抽签。
    不做"每日任务"式的东西：只有真的发生了事，才有这一行。
    """
    __tablename__ = 'diary_entry'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dog_id: Mapped[int] = mapped_column(ForeignKey('dog_profile.id'), index=True)
    # battle / training / visit / checkin / draw / level / quiz
    kind: Mapped[str] = mapped_column(String(16), index=True)
    text: Mapped[str] = mapped_column(String(200))
    extra: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now, index=True)


class QuizAnswer(Base):
    """月塔问询的答题流水。

    为什么要单独存流水而不是只存一个计数：一天的上限、当天答对几题、
    "今天问过哪些题别再问" 都要从这里算 —— 和 TrainingDrop 一样，
    这是能"翻流水"的表。
    **答错也记一行**（要占当天次数），但不写进册子上的日记。
    """
    __tablename__ = 'quiz_answer'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dog_id: Mapped[int] = mapped_column(ForeignKey('dog_profile.id'), index=True)
    question_id: Mapped[str] = mapped_column(String(32), index=True)
    correct: Mapped[bool] = mapped_column(Boolean, default=False)
    day: Mapped[str] = mapped_column(String(10), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class QuizSetting(Base):
    """月塔问询的**基准**：这只狗让月塔按哪一档问。

    为什么存在服务端而不是浏览器里：基准是"我这只狗的底子"，
    换台设备、换个浏览器翻开册子都该还是那一档；存在本地等于每次重定一遍。
    """
    __tablename__ = 'quiz_setting'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    dog_id: Mapped[int] = mapped_column(ForeignKey('dog_profile.id'), unique=True,
                                        index=True)
    baseline: Mapped[str] = mapped_column(String(16), default='auto')
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)


class QuizDuel(Base):
    """同问（好友对战）：**同一道题，两个人同时答，看谁快**。

    规则（用户定的）：
      · 两个人**同时**拿到同一道题（不是轮流）—— 谁先答对谁拿这一回合；
      · 一局 5 个回合，拿下的回合多的人赢；
      · **智力高的狗提示解锁得更早**（growth.js 的 duelHintMs），
        所以聪明的狗是真的占便宜：它更早看见提示，也更容易抢在对面之前答对。

    判分与计时**全在服务端**（见 ws/quiz_routes.py 的 QuizRoom）：
      · 谁先答对由服务端按到达时刻判 —— 客户端说自己快没有用；
      · 提示文本**冷却没到绝不下发** —— 否则改一下前端就能提前看提示，
        "智力换先手"这条机制就成了一句空话。
    """
    __tablename__ = 'quiz_duel'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    room_code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    mode: Mapped[str] = mapped_column(String(12), default='friend')   # friend / npc
    # waiting（等人进房）/ playing（开局了）/ done（打完了）
    status: Mapped[str] = mapped_column(String(16), default='waiting', index=True)
    baseline: Mapped[str] = mapped_column(String(16), default='auto')
    size: Mapped[int] = mapped_column(Integer, default=5)
    challenger_dog_id: Mapped[int] = mapped_column(ForeignKey('dog_profile.id'),
                                                   index=True)
    # 座位 1。开房时还不知道是谁（好友要拿房间码进来），所以可空。
    opponent_dog_id: Mapped[int | None] = mapped_column(ForeignKey('dog_profile.id'),
                                                        nullable=True, index=True)
    question_ids: Mapped[list] = mapped_column(JSON, default=list)   # 这局真问过的题
    rounds: Mapped[list] = mapped_column(JSON, default=list)         # 每回合谁怎么答的
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    day: Mapped[str] = mapped_column(String(10), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class QuizDuelAnswer(Base):
    """同问里的一次作答（含**用时**，用来解释"谁快"）。

    **刻意不写进 quiz_answer**：那张表是"今天的问询还剩几次"的依据，
    而对战不该吃掉一天 10 次的名额（对局另有 3 局/天的上限）。
    但防刷要跨两张表看 —— 同一题今天已经答对过，在哪边答都不再给经验，
    见 quiz.py 的 _right_today()。
    """
    __tablename__ = 'quiz_duel_answer'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    duel_id: Mapped[int] = mapped_column(ForeignKey('quiz_duel.id'), index=True)
    dog_id: Mapped[int] = mapped_column(ForeignKey('dog_profile.id'), index=True)
    question_id: Mapped[str] = mapped_column(String(32), index=True)
    round_index: Mapped[int] = mapped_column(Integer, default=0)
    choice: Mapped[int] = mapped_column(Integer, default=-1)
    correct: Mapped[bool] = mapped_column(Boolean, default=False)
    # 这一回合开始 → 服务端收到作答 的毫秒数。**判快慢用的就是它**。
    ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)


class GalSave(Base):
    """剧情模式（gal）的**存档同步**。

    为什么在服务端：剧情模式是个独立应用（AVGPlus 引擎），它的存档按引擎设计
    存在浏览器的 IndexedDB 里 —— 换台设备、换个浏览器就没了。
    用户要的是"**同账号下**存档同步"，也就是：只要登录的是同一个账号，
    在哪台机器上翻开册子都接着上次读。

    存法是**整块 JSON**（`data`），不做字段级拆解：
      · 那个存档是引擎自己的格式，拆字段等于我去解释别人的数据结构，
        引擎一升级就全坏；
      · 同步的粒度本来就是"整份存档"，冲突时也只需要整份覆盖。
    `slot` 留给以后多周目/多存档位；现在固定用 'main'。
    """
    __tablename__ = 'gal_save'

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey('account.id'), index=True)
    slot: Mapped[str] = mapped_column(String(16), default='main')
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    # 存档里那个"什么时候存的"（引擎自己记的），用来判断哪边更新
    saved_at: Mapped[str] = mapped_column(String(40), default='')
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now,
                                                 index=True)
