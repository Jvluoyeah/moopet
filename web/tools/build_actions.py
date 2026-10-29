#!/usr/bin/env python3
"""把 pic/<品种>/ 下的动作图处理成游戏能用的素材
   ============================================================
   输入有两种形态，都要吃：
     A) 已经手工命名过的（萨摩耶 / 边牧 / 哈士奇）→ pic/<品种>/actions/*.png
     B) 只有原始生成图的（金毛 / 柯基 / 柴犬 / 德牧 / 比熊）
        → pic/<品种>/<子目录>/jimeng-*.png，动作名由 tools 里的对照表给出

   输出：
     web/public/breeds/<code>/actions/<动作>_<序号>.png   512×512 透明底
     web/public/breeds/<code>/actions/index.json          给前端 preloadActions 读

   四条口径（都是前面踩出来的）：
   1) **抠背景从四边洪水填充**，不能"全局删浅色"——萨摩耶/比熊/哈士奇的肚子接近纯白，
      全局阈值会把狗掏空。同时守住"墨线不能吃"：白判据卡在 248 且要求低饱和，
      否则墨线外侧的抗锯齿灰边会被当背景，狗变成没有边线的色块。
   2) **同一个品种的所有身体动作共用一个缩放系数**（由所有帧高度中位数定），
      否则换动作时狗会忽大忽小。
   3) **脚底对齐同一条基线**（470），换图不跳。
   4) **头部特写单独一套口径**（它只画头，不能按全身高度缩放）。
"""
import io
import json
import os
import re
import sys
from collections import deque

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.normpath(os.path.join(HERE, '..'))
PIC = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'pic'))
OUT = os.path.join(WEB, 'public', 'breeds')

CANVAS = 512
BASELINE = 470
BODY_H = 340          # 身体动作：所有帧高度的中位数缩到这个高度
HEAD_H = 430          # 头部特写：头高缩到这个高度
BG_TOL = 26

BREEDS = {'萨摩耶': 'samoyed', '边牧': 'border_collie', '金毛': 'golden',
          '柯基': 'corgi', '柴犬': 'shiba', '德牧': 'german_shepherd',
          '哈士奇': 'husky', '比熊': 'bichon'}

DONE = {'萨摩耶', '边牧', '哈士奇'}          # 这三个已经手工命名好了

# ---------------------------------------------------------------
# 未命名品种的对照表：按**长宽比降序**排出来的第 N 张 → 动作名。
# 认图依据见 tests/shots/BB-<品种>.png（那张图就是这个顺序，标了编号与长宽比）。
# 认不准的一律留 'extra'，宁可不用，也不要把动作名按错——
# 按错的话游戏里狗会在跑的时候做出趴下的姿势。
# ---------------------------------------------------------------
TILES = {
 '金毛': {1: 'sleep_01', 2: 'run_03', 3: 'run_01', 4: 'extra', 5: 'extra',
          6: 'attack_01', 7: 'roll_01', 8: 'run_02', 9: 'extra', 10: 'idle_01',
          11: 'run_04', 12: 'head_side_01', 13: 'win_01', 14: 'back_01',
          15: 'skill_01', 16: 'head_happy_01', 17: 'extra', 18: 'jump_01',
          19: 'head_side_02', 20: 'sleep_02', 21: 'idle_02', 22: 'head_grin_01'},
 '柯基': {1: 'sleep_01', 2: 'run_03', 3: 'run_01', 4: 'extra', 5: 'sleep_02',
          6: 'idle_01', 7: 'roll_01', 8: 'attack_01', 9: 'run_02',
          10: 'head_puzzle_01', 11: 'idle_02', 12: 'extra', 13: 'extra',
          14: 'extra', 15: 'back_01', 16: 'jump_01', 17: 'extra',
          18: 'head_happy_01', 19: 'head_side_01', 20: 'win_01',
          21: 'head_side_02', 22: 'skill_01'},
 '柴犬': {1: 'sleep_01', 2: 'run_01', 3: 'idle_01', 4: 'run_02', 5: 'run_03',
          6: 'roll_01', 7: 'idle_02', 8: 'head_puzzle_01', 9: 'extra',
          10: 'attack_01', 11: 'sleep_02', 12: 'back_01', 13: 'extra',
          14: 'jump_01', 15: 'extra', 16: 'head_happy_01', 17: 'head_grin_01',
          18: 'skill_01', 19: 'extra', 20: 'head_side_01', 21: 'win_01',
          22: 'skill_02'},
 '德牧': {1: 'sleep_01', 2: 'run_03', 3: 'run_01', 4: 'roll_01', 5: 'sleep_02',
          6: 'idle_01', 7: 'extra', 8: 'attack_01', 9: 'run_02', 10: 'run_04',
          11: 'extra', 12: 'extra', 13: 'extra', 14: 'skill_01', 15: 'extra',
          16: 'win_01', 17: 'jump_01', 18: 'extra', 19: 'head_puzzle_01',
          20: 'head_happy_01', 21: 'head_side_01', 22: 'head_grin_01'},
 # 比熊第 21 张画成了猫（尖耳狐狸脸，明显漂移）→ extra 弃用
 '比熊': {1: 'sleep_01', 2: 'run_03', 3: 'idle_01', 4: 'run_01', 5: 'sleep_02',
          6: 'idle_02', 7: 'head_grin_01', 8: 'run_02', 9: 'head_side_01',
          10: 'extra', 11: 'extra', 12: 'extra', 13: 'roll_01',
          14: 'attack_01', 15: 'head_happy_01', 16: 'head_side_02',
          17: 'win_01', 18: 'skill_01', 19: 'jump_01', 20: 'extra',
          21: 'extra', 22: 'extra'},
}


# ---------------------------------------------------------------- 抠图
def key_out(img):
    """四边洪水填充抠背景。

    ⚠️ 用 scipy 的连通域来做，不要用 Python 的 BFS：
    原图是 1145×1374，纯 Python 逐像素 BFS 一张要跑几十秒，
    8 个品种 × 22 张直接跑到超时（第一次就是这么挂的）。

    判据两条取并集：
      ① 和边框背景色接近；
      ② 本身就是接近纯白（>=248 且低饱和）。
    第 ② 条不能放松：卡到 232 会把墨线外侧的抗锯齿灰边当背景吃掉，
    狗就变成没有边线的色块（踩过）。洪水填充只吃**连到画布边**的像素，
    所以白狗肚子被墨线包着，灌不进去。
    """
    rgb = np.asarray(img.convert('RGB')).astype(np.int16)
    border = np.concatenate([rgb[0].reshape(-1, 3), rgb[-1].reshape(-1, 3),
                             rgb[:, 0].reshape(-1, 3), rgb[:, -1].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    lo, hi = rgb.min(axis=2), rgb.max(axis=2)
    near = ((np.abs(rgb - bg).sum(axis=2) <= BG_TOL * 3)
            | ((lo >= 248) & ((hi - lo) <= 6)))
    lab, n = ndimage.label(near)                 # 默认 4 邻域，正好
    outside = np.zeros_like(near)
    if n:
        edge = set(lab[0].tolist()) | set(lab[-1].tolist()) \
            | set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())
        edge.discard(0)
        if edge:
            outside = np.isin(lab, list(edge))
    return np.dstack([rgb.astype(np.uint8),
                      np.where(outside, 0, 255).astype(np.uint8)])


def despeckle(rgba, min_area=200):
    """去掉抠剩的孤立小碎块（同样走 scipy，别用 Python BFS）。"""
    m = rgba[:, :, 3] > 0
    lab, n = ndimage.label(m)
    if n == 0:
        return rgba
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    keep = np.concatenate([[False], sizes >= min_area])
    rgba[:, :, 3] = np.where(keep[lab], rgba[:, :, 3], 0)
    return rgba


def content_bbox(rgba):
    ys, xs = np.where(rgba[:, :, 3] > 0)
    if len(ys) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def place(crop, scale):
    """缩放后贴到 512×512：脚底对齐基线、水平居中。"""
    ch, cw = crop.shape[:2]
    nw, nh = max(1, round(cw * scale)), max(1, round(ch * scale))
    im = Image.fromarray(crop, 'RGBA').resize((nw, nh), Image.LANCZOS)
    base = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    x = (CANVAS - nw) // 2
    y = max(0, BASELINE - nh)
    base.alpha_composite(im, (max(0, x), y))
    return np.asarray(base)


# ---------------------------------------------------------------- 取源文件
def raw_sorted(cn):
    """未命名品种：按长宽比降序（与 BB-<品种>.png 对照图同序）。"""
    d = os.path.join(PIC, cn)
    items = []
    for root, dirs, files in os.walk(d):
        if os.path.basename(root) == 'actions':
            continue
        for f in files:
            if f.lower().endswith('.png') and f.startswith('jimeng'):
                p = os.path.join(root, f)
                rgb = np.asarray(Image.open(p).convert('RGB')).astype(np.int16)
                m = rgb.min(axis=2) < 235
                ys, xs = np.where(m)
                if not len(ys):
                    continue
                ar = (xs.max() - xs.min() + 1) / max(1, ys.max() - ys.min() + 1)
                items.append((ar, p))
    items.sort(key=lambda t: -t[0])
    return [p for _, p in items]


def named_files(cn):
    d = os.path.join(PIC, cn, 'actions')
    return [(os.path.splitext(f)[0], os.path.join(d, f))
            for f in sorted(os.listdir(d))] if os.path.isdir(d) else []


# ---------------------------------------------------------------- 主流程
def process(cn, code, log):
    if cn in DONE:
        src = named_files(cn)
    else:
        table = TILES[cn]
        src = []
        for i, p in enumerate(raw_sorted(cn), 1):
            name = table.get(i, 'extra')
            if name != 'extra':
                src.append((name, p))
    if not src:
        log.append(f'  ! {cn}: 没有可用素材')
        return 0

    # 抠图 + 量尺寸
    items = []
    for name, p in src:
        im = Image.open(p)
        # 输出只有 512，2K 原图没必要全尺寸跑（抠图和连通域都按像素数涨）
        if max(im.size) > 1200:
            k = 1200 / max(im.size)
            im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        rgba = despeckle(key_out(im))
        bb = content_bbox(rgba)
        if not bb:
            log.append(f'  ! {cn}/{name}: 抠完是空的')
            continue
        h = bb[3] - bb[1] + 1
        items.append((name, rgba, bb, h, name.startswith('head_')))

    body = [it for it in items if not it[4]]
    head = [it for it in items if it[4]]
    # 2) 每个品种的身体动作共用一个缩放系数。
    #    尺子用 win_01：它是"坐姿挺胸"，和 forms/sit.png 是**同一个姿势**，
    #    而 sit.png 当初就是按"狗高 400"切的，所以 win_01 → 400 就把两套素材对齐了。
    #    （用所有帧高度的中位数不行：趴着和蜷成球的那些帧会把中位数拉低，
    #      结果站姿/坐姿普遍偏小 15%，换动作时狗会缩一下。）
    ruler = next((it[3] for it in body if it[0].startswith('win')), None)
    if ruler is None:                     # 没有 win 就退回"最高的那几帧的中位数"
        tall = sorted((it[3] for it in body), reverse=True)[:3]
        ruler = float(np.median(tall)) if tall else 1.0
    s_body = 400.0 / float(ruler)
    s_head = (HEAD_H / float(np.median([it[3] for it in head]))) if head else 1.0

    outdir = os.path.join(OUT, code, 'actions')
    os.makedirs(outdir, exist_ok=True)
    for f in os.listdir(outdir):                  # 清掉上一版
        if f.endswith('.png'):
            os.remove(os.path.join(outdir, f))

    counts = {}
    for name, rgba, bb, h, is_head in items:
        crop = rgba[bb[1]:bb[3] + 1, bb[0]:bb[2] + 1]
        img = place(crop, s_head if is_head else s_body)
        Image.fromarray(img, 'RGBA').save(os.path.join(outdir, f'{name}.png'))
        act = re.sub(r'_\d+$', '', name)          # run_01 → run
        counts[act] = counts.get(act, 0) + 1

    with io.open(os.path.join(outdir, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump({'code': code, 'canvas': [CANVAS, CANVAS],
                   'baseline': BASELINE,
                   'scale': {'body': round(s_body, 4), 'head': round(s_head, 4)},
                   'actions': {k: {'frames': v, 'kind':
                                   'head' if k.startswith('head_') else 'body'}
                               for k, v in sorted(counts.items())},
                   'note': '由 tools/build_actions.py 从 pic/ 处理而来；'
                           '同一品种身体动作共用一个缩放系数，脚底对齐 470'},
                  f, ensure_ascii=False, indent=2)
    log.append(f'  {cn:5s} → {code:15s} {len(items):2d} 张  '
               f'系数 body {s_body:.3f} / head {s_head:.3f}  '
               f'动作 {len(counts)} 种')
    return len(items)


def main():
    log = []
    total = 0
    only = sys.argv[1:] or list(BREEDS)
    for cn in only:
        code = BREEDS.get(cn)
        if not code:
            continue
        try:
            total += process(cn, code, log)
        except Exception as e:                     # noqa: BLE001
            log.append(f'  ! {cn} 处理失败：{type(e).__name__}: {e}')
    print('\n'.join(log))
    print(f'\n共处理 {total} 张 → {OUT}/<code>/actions/')
    return 0


if __name__ == '__main__':
    sys.exit(main())
