"""开放世界：场景边界表 + 演示 NPC 的确定性位置。

⚠️ v2 之后这个模块的定位变了，别搞混：

  * **真人玩家**的位置不再由服务端算——客户端操控、上报，服务端只校验与广播
    （见 `ws/world_routes.py` 与 `ws/world_hub.py`）。
  * 这里剩下的 `position_for()` 只服务于**演示 NPC**（`is_npc=True` 的种子狗）
    和 v1 遗留的 `GET /api/world` 看板接口：让它们自己慢慢晃，
    这样"广场上一直有人"这件事在没有真人在线时也成立。

坐标单位是"格"（1 格 = 前端世界单位），落库时乘 100 存整数，避免浮点差异。
场景尺寸来自 `shared/world_scenes.json`——前后端共用一份，改尺寸只改那个文件。
"""
import hashlib
import time

from .ws.world_hub import SCENES as _SHARED_SCENES

_DESCS = {
    'plaza': '人最多的地方，刚领养的狗默认来这里',
    'park': '遛弯专用，走满里程能顺带完成散步任务',
    'kennel': '自己的地盘，可以摆装扮、看日记',
    'arena': '对战入口，约战与观战都在这里',
}

# 兼容 v1 的 {'size': N} 写法（旧代码/旧测试按方形场地理解），
# 同时补上真实的 w/d——v2 的场地是长方形。
SCENES = {
    code: dict(name=meta['name'],
               size=max(meta['w'], meta['d']),
               w=meta['w'], d=meta['d'], spawn=list(meta['spawn']),
               capacity=meta['capacity'], desc=_DESCS.get(code, ''))
    for code, meta in _SHARED_SCENES.items()
}

BUCKET_SECONDS = 8          # 每 8 秒换一个位置片：看起来像在慢慢走动


def scene_size(scene='plaza'):
    meta = SCENES.get(scene) or SCENES['plaza']
    return float(meta['w']), float(meta['d'])


def time_bucket(now=None):
    return int((time.time() if now is None else now) // BUCKET_SECONDS)


def _rand01(*parts):
    """把若干整数稳定映射到 [0,1)。"""
    h = hashlib.sha256(':'.join(str(p) for p in parts).encode()).digest()
    return int.from_bytes(h[:6], 'big') / float(1 << 48)


def home_of(dog_id, scene='plaza'):
    """每只狗有一个稳定的"常去位置"，避免每次刷新到处乱跳。

    留出 12% 的边距：NPC 都是贴着场地边缘出生的，看着很假。
    """
    w, d = scene_size(scene)
    mx, my = w * 0.12, d * 0.12
    return (int(mx + _rand01('home-x', dog_id, scene) * (w - 2 * mx)),
            int(my + _rand01('home-y', dog_id, scene) * (d - 2 * my)))


def position_for(dog_id, bucket=None, scene='plaza'):
    """确定性位置：自家附近小幅游走（演示 NPC 用）。"""
    bucket = time_bucket() if bucket is None else int(bucket)
    hx, hy = home_of(dog_id, scene)
    w, d = scene_size(scene)
    dx = int((_rand01('dx', dog_id, bucket) - 0.5) * w * 0.12)
    dy = int((_rand01('dy', dog_id, bucket) - 0.5) * d * 0.12)
    x = max(0, min(int(w), hx + dx))
    y = max(0, min(int(d), hy + dy))
    return x, y


# 狗在广场上会说的话（不带 emoji，走文本气泡；后续可换成品种化台词）
BUBBLES = {
    'samoyed': ['今天也要开开心心', '要不要一起散步', '这里风好舒服'],
    'border_collie': ['来答题吗，我刚连对五道', '我算了三步之后的路'],
    'golden': ['慢慢来，我陪着你', '刚遛完一圈，腿有点酸'],
    'corgi': ['短腿也能跑很快', '谁在喊我名字'],
    'shiba': ['……先看看再说', '别摸我尾巴'],
    'german_shepherd': ['这边我看着，放心', '检测到空气有点闷'],
    'husky': ['啊啊啊啊——', '我要说话我要说话'],
    'bichon': ['抱一下好不好', '今天认识了三只新朋友'],
}


def bubble_for(dog_id, breed_code, bucket=None):
    bucket = time_bucket() if bucket is None else int(bucket)
    pool = BUBBLES.get(breed_code) or ['……']
    idx = int(_rand01('bubble', dog_id, bucket) * len(pool))
    return pool[min(idx, len(pool) - 1)]


def status_for(dog_id, bucket=None):
    bucket = time_bucket() if bucket is None else int(bucket)
    r = _rand01('status', dog_id, bucket)
    if r < 0.45:
        return 'walk'
    if r < 0.75:
        return 'idle'
    if r < 0.9:
        return 'play'
    return 'rest'
