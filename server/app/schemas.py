"""请求/响应模型（pydantic v2）。

统一约定：
  * 入参做长度与格式校验，不合法直接 422（FastAPI 内建）；
  * 出参不暴露 password_hash 等敏感字段；
  * 数值字段（位置/四维）都用整数，避免浮点在前后端/服务端之间产生不一致。
"""
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------------- 账号 ----------------
class RegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=32, pattern=r'^[\w\u4e00-\u9fa5-]+$')
    password: str = Field(min_length=6, max_length=128)
    email: str = Field(default='', max_length=128)


class LoginRequest(BaseModel):
    username: str
    password: str


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    email: str = ''
    role: str = 'user'
    # 昵称：可以改；空的话前端回退显示 username
    nickname: str = ''


class TokenOut(BaseModel):
    access_token: str
    token_type: str = 'bearer'
    expires_in_hours: int
    account: AccountOut


# ---------------- 账号设置（改昵称 / 改密码 / 设备 / 注销）----------------
class ProfileUpdate(BaseModel):
    """改昵称。username（登录名）**不允许改** —— 它是登录凭证，
    而且改名会让"档案编号"对不上。"""
    nickname: str = Field(min_length=0, max_length=32)


class PasswordChange(BaseModel):
    old_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


class SessionOut(BaseModel):
    """一台登录着的设备。"""
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_agent: str = ''
    ip: str = ''
    created_at: datetime
    last_seen_at: datetime
    current: bool = False


class PasswordConfirm(BaseModel):
    """注销账号这种不可逆操作，必须再验一次密码。"""
    password: str = Field(min_length=1, max_length=128)


# ---------------- 品种 ----------------
class BreedStats(BaseModel):
    power: int
    agility: int
    wisdom: int
    affinity: int


class BreedOut(BaseModel):
    code: str
    name: str
    subtitle: str = ''
    stats: BreedStats
    asset_pack: str = ''
    palette: dict = {}
    description: str = ''


# ---------------- 狗狗档案 ----------------
class AdoptRequest(BaseModel):
    name: str = Field(min_length=1, max_length=24)
    breed_code: str = Field(min_length=1, max_length=32)
    motto: str = Field(default='', max_length=64)


class DogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    breed_code: str
    breed_name: str = ''
    level: int = 1
    total_exp: int = 0
    personality: str = '独立型'
    motto: str = ''
    appearance: dict = {}
    achievements: list[str] = []


class DogCardOut(BaseModel):
    """羊皮纸档案卡：档案页要的全部信息一次给全。"""
    dog: DogOut
    owner: str
    community: Optional['CommunityOut'] = None
    social_level: int = 1
    friendship_points: int = 0
    visits_received: int = 0
    achievements: list[str] = []
    stats: Optional[BreedStats] = None


class DogUpdateRequest(BaseModel):
    """狗本体上报镜像数据（等级/经验/性格/外观/成就）。云端只存展示用。"""
    level: Optional[int] = Field(default=None, ge=1, le=100)
    total_exp: Optional[int] = Field(default=None, ge=0)
    personality: Optional[str] = Field(default=None, max_length=16)
    appearance: Optional[dict] = None
    achievements: Optional[list[str]] = None
    motto: Optional[str] = Field(default=None, max_length=64)


# ---------------- 社群 ----------------
class CommunityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    kind: str = 'public'
    description: str = ''
    member_count: int = 0
    # 真正"在场"的只数（10 分钟内有心跳的 + NPC）。
    # 为什么要单列一个字段：前端原来拿 member_count 配「在场」这个标签，
    # 于是"登记在册 272 只"被写成了"在场 272 只" —— 语义是错的。
    online_count: int = 0


class MemberOut(BaseModel):
    dog_id: int
    dog_name: str
    breed_code: str
    breed_name: str = ''
    level: int = 1
    social_level: int = 1
    friendship_points: int = 0
    online: bool = False


class PresenceOut(BaseModel):
    dog_id: int
    dog_name: str
    breed_code: str
    breed_name: str = ''
    level: int = 1
    scene: str = 'plaza'
    x: int = 0
    y: int = 0
    status: str = 'idle'
    bubble: str = ''


class MoveRequest(BaseModel):
    scene: Optional[Literal['plaza', 'park', 'kennel', 'arena']] = None
    x: Optional[int] = Field(default=None, ge=0, le=1000)
    y: Optional[int] = Field(default=None, ge=0, le=1000)
    status: Optional[Literal['idle', 'walk', 'play', 'battle', 'rest']] = None
    bubble: Optional[str] = Field(default=None, max_length=64)


class VisitRequest(BaseModel):
    message: str = Field(default='', max_length=64)


# ---------------- 对战 ----------------
class MatchCreateRequest(BaseModel):
    mode: Literal['ai', 'shadow', 'pvp'] = 'ai'
    opponent_dog_id: Optional[int] = None


class MatchPlayerOut(BaseModel):
    side: int
    dog_id: Optional[int] = None
    display_name: str = ''
    score: int = 0
    is_ai: bool = False


class MatchOut(BaseModel):
    id: int
    room_code: str
    mode: str
    status: str
    seed: int
    frames: int = 0
    result: dict = {}
    pending_exp: int = 0
    players: list[MatchPlayerOut] = []


class MatchResultRequest(BaseModel):
    """客户端上报本局结果（锁步下双方各自算出的结果应当一致）。"""
    frames: int = Field(ge=0)
    scores: list[int] = Field(default_factory=list)
    winner_side: Optional[int] = Field(default=None, ge=0, le=1)
    duration_ms: int = Field(default=0, ge=0)


# ---------------- 排行榜 ----------------
class LeaderboardRow(BaseModel):
    rank: int
    dog_id: int
    dog_name: str
    breed_code: str
    breed_name: str = ''
    level: int = 1
    score: int = 0
    wins: int = 0
    losses: int = 0
    is_me: bool = False


class LeaderboardOut(BaseModel):
    kind: str
    rows: list[LeaderboardRow]
    me: Optional[LeaderboardRow] = None


# ---------------- 剧情关卡（训练记录） ----------------
class TrainingLevelOut(BaseModel):
    """一关 + 我的进度。关卡**内容**在前端（levels.js），这里只给名字与成绩。"""
    code: str
    name: str
    boss: str = ''
    rec_level: int = 1
    max_stars: int = 3
    cleared: bool = False
    stars: int = 0
    best_ticks: int = 0
    attempts: int = 0


class TrainingClearRequest(BaseModel):
    level_code: str
    ticks: int = Field(default=0, ge=0)      # 通关用了多少帧（30Hz）
    stars: int = Field(default=1, ge=0, le=3)
    hp_left: int = Field(default=0, ge=0)    # 结算时的剩余血量比例（千分比）


class TrainingBoardRow(BaseModel):
    rank: int
    dog_id: int
    dog_name: str
    breed_code: str
    level: int = 1
    stars: int = 0
    ticks: int = 0
    seconds: float = 0.0


DogCardOut.model_rebuild()
