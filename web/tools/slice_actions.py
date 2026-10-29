#!/usr/bin/env python3
"""把战斗动作的横条图切成逐帧素材
   ============================================================
   两种交付都吃：
     A) 逐帧出图（推荐）  pic/<中文名>/actions/run_01.png run_02.png …
     B) 一条横条 / 网格    pic/<中文名>/actions/run.png（内部 6 格或 2×3）

   输出：web/public/breeds/<code>/actions/<动作>_<序号>.png
        （512×512 透明底，脚底压在同一条基线 470 上）

   ⚠️ 归一化口径（这里改过一次，别改回去）：
     第一版按**bbox 高度**归一——"一只 400 高的狗"。
     问题是狗的姿势一变，bbox 就跟着变：跑起来腿张开，bbox 变矮；
     跳起来拉长，bbox 变高；趴下蜷起来，bbox 又矮又短。
     按高度归一的结果是"跑的狗被放大、趴着的被缩成小球"，
     同一个动作里还不明显，跨动作一看就露馅（对照图一眼看出来）。

     现在按**剪影面积**归一：同一只狗，面积 ∝ 尺寸²，
     姿势怎么变，面积都稳定得多。于是：
       frameScale_i = sqrt(参考面积 / 面积_i)
       actionScale  = 该动作所有帧的中位数   ← 一个动作共用，保证循环不抖
     再乘一个按动作微调的系数（ACTION_FIX），以及配置里的逐帧覆盖。
"""
import json
import os
import re
import sys
from collections import deque

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.normpath(os.path.join(HERE, '..'))
PIC = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'pic'))
OUT = os.path.join(WEB, 'public', 'breeds')
CONF = os.path.join(HERE, 'actions')

BREEDS = {
    '萨摩耶': 'samoyed', '边牧': 'border_collie', '金毛': 'golden', '柯基': 'corgi',
    '柴犬': 'shiba', '德牧': 'german_shepherd', '哈士奇': 'husky', '比熊': 'bichon',
}

CANVAS = 512
BASELINE = 470
BG_TOL = 26

# 参考剪影面积（缩放后，单位像素²）。一只"标准站姿"的狗大约占 300×420 的 45%，
# 取这个值让站姿落在 ~420 高。改这一个数就能整体放大/缩小所有动作帧。
REF_AREA = 62000

# 逐动作微调（在面积归一之后乘上去）。只放"面积归一解释不了"的差异：
#   down/sleep 是躺着的，重心低，看着会比站着小，给一点补偿。
ACTION_FIX = {
    'down': 1.10,
    'sleep': 1.08,
}

# 头部表情图**不参与面积归一**：它们是"只有头和脖子"的图，
# 按面积归一会把脑袋缩得跟整只狗一样"重"，看着就成小头了。
# 这一类直接按高度定（给头像/表情用，本来就要大）。
HEIGHT_ACTIONS = {
    'head_happy': 430,
    'head_bone': 430,
    'head_puzzle': 430,
    'head_grin': 430,
}


def key_out_background(img):
    """从四边洪水填充抠背景，返回 RGBA numpy 数组。

    背景色取**整圈边框像素的中位数**，不是只看四个角：
    截图里那块白色图片区的矩形四角常常是深色 UI，只采样四角会把背景色取错，
    结果白底整块留下来（实测过：输出图四角 alpha=255、rgb=255,255,255）。

    白色兜底判据卡得很紧（>= 248 且通道差 <= 6）。这条**踩过一次**：
    一开始写成 `min >= 232`，把墨线外侧的抗锯齿灰边（240 左右）也当成了背景，
    于是右侧那条画得细的轮廓被整条吃掉，狗变成了没有边线的色块。
    宁可漏一点背景（有 despeckle 兜底），也不能吃轮廓。

    洪水填充只吃**连到画布边**的像素，狗的肚子被一圈墨线闭合包着灌不进去——
    这正是"从四边灌"而不是"全局删浅色"的意义。
    """
    rgb = np.asarray(img.convert('RGB')).astype(np.int16)
    h, w, _ = rgb.shape
    border = np.concatenate([
        rgb[0].reshape(-1, 3), rgb[-1].reshape(-1, 3),
        rgb[:, 0].reshape(-1, 3), rgb[:, -1].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    lo = rgb.min(axis=2)
    hi = rgb.max(axis=2)
    near = ((np.abs(rgb - bg).sum(axis=2) <= BG_TOL * 3)
            | ((lo >= 248) & ((hi - lo) <= 6)))
    visited = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near[y, x] and not visited[y, x]:
                visited[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near[y, x] and not visited[y, x]:
                visited[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not visited[ny, nx]:
                visited[ny, nx] = True; q.append((ny, nx))
    return np.dstack([rgb.astype(np.uint8), np.where(visited, 0, 255).astype(np.uint8)])


def _components(alpha, min_area=1):
    """连通域列表，按面积从大到小。"""
    ys, xs = np.where(alpha > 0)
    alive = {(int(y), int(x)) for y, x in zip(ys, xs)}
    comps = []
    while alive:
        seed = alive.pop()
        stack = [seed]
        comp = [seed]
        while stack:
            y, x = stack.pop()
            for nb in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if nb in alive:
                    alive.discard(nb)
                    stack.append(nb)
                    comp.append(nb)
        if len(comp) < min_area:
            continue
        cy = [p[0] for p in comp]
        cx = [p[1] for p in comp]
        comps.append({'pixels': comp, 'area': len(comp),
                      'bbox': (min(cx), min(cy), max(cx), max(cy))})
    comps.sort(key=lambda c: -c['area'])
    return comps


def drop_border_bands(rgba):
    """去掉"贴着画布边、又宽又扁（或又高又细）"的色块。

    典型来源：提示词里写了"脚底压在一条水平基线上"，模型就真的画了一条灰色地面带。
    这种带子会：
      ① 被洪水填充当成内容留下（它不连到背景色）；
      ② 因为它撑满整行/整列，把"找空白缝分格"的算法直接搞崩。
    判据用长宽比：宽度超过画布 55% 且高度不到画布 12% 的块，一定是装饰线不是狗。
    """
    h, w = rgba.shape[:2]
    removed = 0
    for c in _components(rgba[:, :, 3], min_area=200):
        x0, y0, x1, y1 = c['bbox']
        bw, bh = x1 - x0 + 1, y1 - y0 + 1
        touches = (x0 <= 1 or y0 <= 1 or x1 >= w - 2 or y1 >= h - 2)
        flat = bw > w * 0.55 and bh < h * 0.12
        thin = bh > h * 0.55 and bw < w * 0.12
        if touches and (flat or thin):
            for (y, x) in c['pixels']:
                rgba[y, x, 3] = 0
            removed += 1
    return removed


def largest_only(rgba):
    """只留最大的一坨——**逐帧交付的单帧文件**用这个。

    单帧文件里按定义只有一只狗，所以"最大连通块"就是它，
    不需要去找缝分格（找缝反而会被地面线、边框之类的装饰物带偏）。
    """
    comps = _components(rgba[:, :, 3], min_area=200)
    if not comps:
        return rgba
    keep = np.zeros(rgba.shape[:2], dtype=bool)
    for (y, x) in comps[0]['pixels']:
        keep[y, x] = True
    rgba[:, :, 3] = np.where(keep, rgba[:, :, 3], 0)
    return rgba


def bbox_of(rgba, x0=0, y0=0, x1=None, y1=None):
    """内容的外接矩形（含端点）。全空返回 None。"""
    a = rgba[:, :, 3] > 0
    ys, xs = np.where(a)
    if len(ys) == 0:
        return None
    return (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))


def keep_subject(rgba, pad=80):
    """留下"主体 + 贴着主体的附属小块"，丢掉远处的杂物。

    为什么不是 largest_only：动作图里常常有**故意画上去的表现元素**——
    吼叫的声波弧线、奔跑的速度线、跳起来的气流。它们和狗是分开的连通块，
    只留最大块会把这些全删掉，图就"干"了。
    判据：与主体的外接矩形（外扩 pad）有重叠、且面积不是碎屑的块，一起留下。

    背景里的杂质（JPEG 脏点、格线残渣）通常既小又离得远，两类判据都能筛掉。
    """
    comps = _components(rgba[:, :, 3], min_area=200)
    if not comps:
        return rgba
    mx0, my0, mx1, my1 = comps[0]['bbox']
    keep = np.zeros(rgba.shape[:2], dtype=bool)
    floor = max(200.0, comps[0]['area'] * 0.002)
    for c in comps:
        if c is comps[0]:
            pass
        elif c['area'] < floor:
            continue
        else:
            x0, y0, x1, y1 = c['bbox']
            if (x1 < mx0 - pad or x0 > mx1 + pad
                    or y1 < my0 - pad or y0 > my1 + pad):
                continue
        for (y, x) in c['pixels']:
            keep[y, x] = True
    rgba[:, :, 3] = np.where(keep, rgba[:, :, 3], 0)
    return rgba


def unwrap_screenshot(img):
    """识破"这是截图不是原图"，把外面那层平台 UI 裁掉。

    症状：直接把平台截图丢进来时，四角是深色 UI，中间是一块白色图片区域。
    抠背景是从四边灌的，于是**深色 UI 被当前景扣掉、白色图片区反而被留着**，
    结果切出来带着一个大白方块，缩放系数也跟着算错。

    ⚠️ 这里的关键是"取**最大的一整块**亮区"，不能取"所有亮像素的外接矩形"：
    截图里到处都有零星亮像素（顶部提示条、底部输入框、完成提示），
    取全局外接矩形会框住几乎整张图，等于没裁（第一版就是这么写的，白折腾一轮）。

    返回 (PIL.Image, 状态)。状态：'' 正常 / 'cropped' 已裁 / 'failed' 裁不动。
    """
    rgb = np.asarray(img.convert('RGB')).astype(np.int16)
    h, w, _ = rgb.shape
    corners = np.stack([rgb[0, 0], rgb[0, w - 1], rgb[h - 1, 0], rgb[h - 1, w - 1]])
    if corners.mean() > 110:
        return img, ''
    bright = (rgb.mean(axis=2) > 150).astype(np.uint8)
    comps = _components(bright, min_area=2000)
    if not comps:
        return img, 'failed'
    x0, y0, x1, y1 = comps[0]['bbox']          # 最大的一块亮区 = 那张白底图
    if (y1 - y0) < h * 0.25 or (x1 - x0) < w * 0.25:
        return img, 'failed'
    # 裁完还是占了原图 85% 以上 → 等于没裁，别自欺欺人
    if (y1 - y0) * (x1 - x0) > h * w * 0.85:
        return img, 'failed'
    return img.crop((x0, y0, x1 + 1, y1 + 1)), 'cropped'


def despeckle(rgba, min_area=300):
    """去掉抠剩的孤立小点（JPEG 会在背景里留脏点）。"""
    a = rgba[:, :, 3] > 0
    ys, xs = np.where(a)
    alive = {(int(y), int(x)) for y, x in zip(ys, xs)}
    keep = np.zeros_like(a)
    while alive:
        seed = alive.pop()
        stack = [seed]; comp = [seed]
        while stack:
            y, x = stack.pop()
            for nb in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if nb in alive:
                    alive.discard(nb); stack.append(nb); comp.append(nb)
        if len(comp) < min_area:
            continue
        for (y, x) in comp:
            keep[y, x] = True
    rgba[:, :, 3] = np.where(keep, rgba[:, :, 3], 0)
    return rgba


def _empty_runs(flags, min_len):
    """找出一段段"全空"的区间（长度 >= min_len）。"""
    runs = []
    start = None
    for i, v in enumerate(flags):
        if v:
            if start is None:
                start = i
        else:
            if start is not None:
                if i - start >= min_len:
                    runs.append((start, i))
                start = None
    if start is not None and len(flags) - start >= min_len:
        runs.append((start, len(flags)))
    return runs


def _cuts_from(runs, size):
    """把空白区间变成切点（取每段空白的中间），并忽略贴边的外边距。"""
    cuts = [0]
    for (a, b) in runs:
        if a <= size * 0.02 or b >= size * 0.98:
            continue
        cuts.append((a + b) // 2)
    cuts.append(size)
    return cuts


def split_cells(rgba):
    """把一张动作图切成若干帧，**横条和网格都认**。

    返回按"阅读顺序"（先上后下、先左后右）排好的 [(x0,y0,x1,y1), ...]。

    为什么必须支持网格：一行 6 格的长条是 6:1 的极端比例，
    不少出图平台只给 1:1 / 16:9，硬出长条会糊。
    2×3 或 3×2 的方形网格反而更稳——所以这里两种都要能吃。
    """
    h, w = rgba.shape[:2]
    alpha = rgba[:, :, 3] > 0

    row_gap = max(6, h // 120)
    col_gap = max(6, w // 120)

    # 行：整行都是空的
    row_flags = ~alpha.any(axis=1)
    row_cuts = _cuts_from(_empty_runs(row_flags, row_gap), h)

    cells = []
    for ri in range(len(row_cuts) - 1):
        y0, y1 = row_cuts[ri], row_cuts[ri + 1]
        if y1 - y0 < 8:
            continue
        band = alpha[y0:y1]
        col_flags = ~band.any(axis=0)
        col_cuts = _cuts_from(_empty_runs(col_flags, col_gap), w)
        for ci in range(len(col_cuts) - 1):
            x0, x1 = col_cuts[ci], col_cuts[ci + 1]
            if x1 - x0 < 8:
                continue
            sub = alpha[y0:y1, x0:x1]
            ys, xs = np.where(sub)
            if len(ys) == 0:
                continue
            cells.append((x0 + int(xs.min()), y0 + int(ys.min()),
                          x0 + int(xs.max()), y0 + int(ys.max())))
    return cells


def paste(crop, scale):
    """把一帧缩放后贴到 512×512 画布上，脚底对齐基线、水平居中。

    ⚠️ 这里踩过一次：`Image.fromarray(canvas).alpha_composite(...)` 是在**临时对象**上合成，
    接着又 `Image.fromarray(canvas)` 从原数组重建，合成结果就丢了——
    切出来的帧全是空白。必须拿住 base 这个对象再返回它。
    """
    ch, cw = crop.shape[:2]
    nw, nh = max(1, int(round(cw * scale))), max(1, int(round(ch * scale)))
    im = Image.fromarray(crop, 'RGBA').resize((nw, nh), Image.LANCZOS)
    base = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    x = (CANVAS - nw) // 2
    y = max(0, BASELINE - nh)
    base.alpha_composite(im, (max(0, x), y))
    return np.asarray(base)


def process_actions(cn, code, log):
    """两种交付都能吃：

      A) **逐帧出图**（推荐）
         run_01.png run_02.png run_03.png run_04.png
      B) 一条横条 / 网格出一组
         run.png（内部一行 6 格或 2×3 网格）

    归一化：见文件头。一句话——**按剪影面积**，一个动作共用一个系数。
    """
    folder = os.path.join(PIC, cn, 'actions')
    if not os.path.isdir(folder):
        return 0

    # 1) 先把文件按动作分组：run_01.png → ('run', 1)；run.png → ('run', None)
    groups = {}
    for fn in sorted(os.listdir(folder)):
        if not fn.lower().endswith(('.png', '.jpg', '.jpeg')):
            continue
        stem = os.path.splitext(fn)[0].lower()
        # 动作名允许带下划线（head_happy_01 / sleep_02），所以字符集是 [a-z_]
        m = re.match(r'^([a-z][a-z_]*?)(?:[_-](\d+))?$', stem)
        if not m:
            log.append(f'  ! {cn}/{fn}: 文件名认不出来（应当是 run.png 或 run_01.png）')
            continue
        action = m.group(1)
        idx = int(m.group(2)) if m.group(2) else None
        groups.setdefault(action, []).append((idx, fn))

    if not groups:
        return 0

    outdir = os.path.join(OUT, code, 'actions')
    os.makedirs(outdir, exist_ok=True)
    # 可选：单帧覆盖（配置里写了就用它，跳过自动归一化）
    override = {}
    cfg_path = os.path.join(CONF, f'{code}.json')
    if os.path.isfile(cfg_path):
        with open(cfg_path, encoding='utf-8') as f:
            override = (json.load(f).get('scale') or {})

    # 2) 先把所有帧抠好、量出紧致 bbox 与剪影面积（这一步不做缩放）
    prepared = {}
    for action, files in sorted(groups.items()):
        files.sort(key=lambda t: (t[0] is None, t[0] or 0, t[1]))
        frames = []
        for idx, fn in files:
            img, shot = unwrap_screenshot(Image.open(os.path.join(folder, fn)))
            if shot == 'cropped':
                log.append(f'    · {fn}: 看起来是**平台截图**（四角是深色 UI），已自动裁掉外层')
            elif shot == 'failed':
                log.append(f'  ! {fn}: 看起来是平台截图但自动裁剪失败——'
                           f'**请从平台下载原图**再放进目录')
            rgba = despeckle(key_out_background(img))
            bands = drop_border_bands(rgba)      # 去掉模型画出来的"地面线/边框"
            if bands:
                log.append(f'    · {fn}: 去掉了 {bands} 条贴边的装饰线/色带')
            # 逐帧交付：一个文件就是一只狗（可能带声波/速度线），取主体 + 贴着它的小块
            rgba = keep_subject(rgba)
            box = bbox_of(rgba)
            if box is None:
                log.append(f'  ! {cn}/{fn}: 切不出内容（整张都是空的？）')
                continue
            # ⚠️ 归一化用的是**主体那一块**的面积，不是整张图：
            #    声波弧线、速度线是为了好看加的装饰，算进去会把狗压小
            #    （奔跑那几帧带速度线的明显偏小，就是这么来的）。
            comps = _components(rgba[:, :, 3], min_area=200)
            subject_area = float(comps[0]['area']) if comps else 1.0
            frames.append({
                'fn': fn,
                'crop': rgba[box[1]:box[3] + 1, box[0]:box[2] + 1],
                'area': subject_area,
                'bboxH': box[3] - box[1] + 1,
            })
        if frames:
            prepared[action] = frames

    manifest = {}
    made = 0
    for action, frames in sorted(prepared.items()):
        fix = ACTION_FIX.get(action, 1.0)
        # 头部表情图按**前缀**认，不再逐个列名字：新加 head_xxx 不用改这里
        if action.startswith('head_') or action in HEIGHT_ACTIONS:
            # 头部表情：按高度定，不按面积
            target = float(HEIGHT_ACTIONS.get(action, 430))
            raw = [target / float(f['bboxH']) for f in frames]
        else:
            # 3) 每帧按**主体面积**算一个系数，动作内取中位数（一个动作共用一个，循环才不抖）
            raw = [(REF_AREA / max(1.0, f['area'])) ** 0.5 * fix for f in frames]
        raw.sort()
        scale = raw[len(raw) // 2] if raw else 1.0
        # 逐帧覆盖优先
        for f in frames:
            key = os.path.splitext(f['fn'])[0].lower()
            if key in override:
                f['scale'] = float(override[key])
            else:
                f['scale'] = scale
        # 4) 横向放不下就整体压（paste 是居中贴的，溢出会被裁掉）
        widest = max(f['crop'].shape[1] * f['scale'] for f in frames)
        tallest = max(f['crop'].shape[0] * f['scale'] for f in frames)
        cap = min((CANVAS * 0.96) / widest, (BASELINE + 30) / tallest)
        if cap < 1.0:
            log.append(f'    · {action}: 缩放后最宽 {widest:.0f}px / 最高 {tallest:.0f}px，'
                       f'统一压到 {cap:.3f} 以免被画布裁掉')
            for f in frames:
                f['scale'] *= cap
        else:
            cap = 1.0

        for i, f in enumerate(frames):
            Image.fromarray(paste(f['crop'], f['scale']), 'RGBA').save(
                os.path.join(outdir, f'{action}_{i + 1:02d}.png'))
        manifest[action] = {
            'frames': len(frames),
            'scale': round(scale * cap, 4),
            'fix': fix,
            'areas': [int(f['area']) for f in frames],
            'source': [f['fn'] for f in frames],
        }
        made += len(frames)
        log.append(f'  {cn:6s} {action:12s} → {len(frames)} 帧'
                   f'（系数 {scale * cap:.4f}，含修正 ×{fix}，面积 '
                   f'{min(int(f["area"]) for f in frames)}~'
                   f'{max(int(f["area"]) for f in frames)}）')

    if manifest:
        p = os.path.join(outdir, 'index.json')
        with open(p, 'w', encoding='utf-8') as f:
            json.dump({'code': code, 'canvas': [CANVAS, CANVAS],
                       'baseline': BASELINE, 'refArea': REF_AREA,
                       'actions': manifest}, f, ensure_ascii=False, indent=2)
    return made


def main():
    only = [a for a in sys.argv[1:] if not a.startswith('-')]
    log = []
    total = 0
    for cn, code in BREEDS.items():
        if only and code not in only and cn not in only:
            continue
        try:
            total += process_actions(cn, code, log)
        except Exception as e:      # noqa: BLE001
            log.append(f'  ! {cn} 处理失败：{type(e).__name__}: {e}')
    print('\n'.join(log) if log else '（没有找到 action 图；放 pic/<品种>/actions/ 下再跑）')
    print(f'\n共切出 {total} 帧动作素材 → {OUT}/<code>/actions/')
    return 0


if __name__ == '__main__':
    sys.exit(main())
