#!/usr/bin/env python3
"""把 pic/<品种>/ 里的形象图切成分层可用的素材
   ============================================================
   输入（用户提供）：
     pic/<中文名>/主图.png        一张大的 3/4 侧坐立绘
     pic/<中文名>/四种形态.jpg     2×2 的四格：坐 / 正面 / 挥手 / 趴下
                                   （哈士奇、德牧里叫"四个形态"，两种名字都认）

   输出：
     web/public/breeds/<code>/forms/sit.png    坐（= 主图，等同于图鉴立绘）
     web/public/breeds/<code>/forms/face.png   正面
     web/public/breeds/<code>/forms/paw.png    挥手（打招呼/撒娇）
     web/public/breeds/<code>/forms/lie.png    趴下（休息/倒地）
     web/public/breeds/<code>/art.json         每张的锚点与尺寸，前端按它摆位

   三条处理规则（都是为了"摆到一起不违和"）：
   1) **抠背景用洪水填充，不用"删掉所有浅色"**。
      狗肚子本身就是接近白的，全局阈值会把萨摩耶/哈士奇/比熊掏空。
      从四边往里灌，只吃掉真正连到边界的背景。
   2) **同一张四格图里的四只按同一个缩放系数缩**。
      各缩各的会让"趴下"被放大成一只巨狗。系数由"坐"那一格反推。
   3) **脚底对齐同一条基线、水平居中**，画布统一 512×512。
      这样切出来的四张可以直接叠着换，不会跳。
"""
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))          # …/w6/web/tools
WEB = os.path.normpath(os.path.join(HERE, '..'))           # …/w6/web
PIC = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'pic'))   # …/competition/pic
OUT = os.path.join(WEB, 'public', 'breeds')

# 中文目录名 → 项目里的品种 code（和 server/app/seeds.py 一致）
BREEDS = {
    '萨摩耶': 'samoyed',
    '边牧': 'border_collie',
    '金毛': 'golden',
    '柯基': 'corgi',
    '柴犬': 'shiba',
    '德牧': 'german_shepherd',
    '哈士奇': 'husky',
    '比熊': 'bichon',
}

# 四格的语义（左上→右上→左下→右下）
CELLS = ['sit', 'face', 'paw', 'lie']

CANVAS = 512          # 输出画布边长
BASELINE = 470        # 脚底基线（距顶 470，留 42px 给贴地的阴影）
TARGET_H = 400        # "坐"这一格在画布里的高度 → 400/512 ≈ 78%

BG_TOL = 26           # 洪水填充的容差：和边界背景色的差小于它就当背景


def find_sheet(folder):
    """四格图有两种文件名，都认。"""
    for name in ('四种形态', '四个形态'):
        for ext in ('.png', '.jpg', '.jpeg'):
            p = os.path.join(folder, name + ext)
            if os.path.isfile(p):
                return p
    return None


def find_main(folder):
    for name in ('主图', '主视图'):
        for ext in ('.png', '.jpg', '.jpeg'):
            p = os.path.join(folder, name + ext)
            if os.path.isfile(p):
                return p
    return None


def key_out_background(img):
    """从四边洪水填充抠背景，返回 RGBA numpy 数组。

    为什么不用"全局删浅色"：萨摩耶/比熊/哈士奇的肚子是接近白的，
    全局阈值会把狗掏成镂空。从边界灌水只会吃掉真正连到外面的背景。
    """
    rgb = np.asarray(img.convert('RGB')).astype(np.int16)
    h, w, _ = rgb.shape
    # 四角的中位色当作背景色（比取左上角一个点稳）
    corners = np.stack([rgb[0, 0], rgb[0, w - 1], rgb[h - 1, 0], rgb[h - 1, w - 1]])
    bg = np.median(corners, axis=0)

    diff = np.abs(rgb - bg).sum(axis=2)
    near = diff <= BG_TOL * 3          # 三个通道合计的容差
    visited = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near[y, x] and not visited[y, x]:
                visited[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near[y, x] and not visited[y, x]:
                visited[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not visited[ny, nx]:
                visited[ny, nx] = True
                q.append((ny, nx))

    alpha = np.where(visited, 0, 255).astype(np.uint8)
    out = np.dstack([rgb.astype(np.uint8), alpha])
    return out


def clean_alpha(rgba):
    """把抠剩的孤立小点抹掉（JPEG 压缩会在背景里留下脏点）。"""
    a = rgba[:, :, 3] > 0
    h, w = a.shape
    seen = np.zeros_like(a)
    keep = np.zeros_like(a)
    for sy in range(h):
        for sx in range(w):
            if not a[sy, sx] or seen[sy, sx]:
                continue
            comp = []
            q = deque([(sy, sx)])
            seen[sy, sx] = True
            while q:
                y, x = q.popleft()
                comp.append((y, x))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and a[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if len(comp) < 400:        # 小于 400 像素的碎块直接扔
                continue
            for (y, x) in comp:
                keep[y, x] = True
    rgba[:, :, 3] = np.where(keep, rgba[:, :, 3], 0)
    return rgba


def label_components(alpha):
    """对整张图做连通域标记。

    返回 [{pixels:[(y,x)], area, bbox:(x0,y0,x1,y1), cx, cy}, ...]，按面积从大到小。

    只在"有内容的像素"上做 BFS（先把坐标取出来放集合里），
    不逐像素扫整张图——1900×2300 逐像素在 Python 里要跑好几分钟。
    """
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
        cy = [p[0] for p in comp]
        cx = [p[1] for p in comp]
        comps.append({
            'pixels': comp, 'area': len(comp),
            'bbox': (min(cx), min(cy), max(cx), max(cy)),
            'cx': sum(cx) / len(cx), 'cy': sum(cy) / len(cy),
        })
    comps.sort(key=lambda c: -c['area'])
    return comps


def split_by_components(rgba, verbose=False):
    """把四格图分成四个"每一格只含自己那只狗"的裁切框。

    ⚠️ 算法要点（这一版是第二版，第一版会把图**截断**）：
      第一版的做法是"每格里只保留最大的连通块"。问题是描边在 JPEG 压缩后
      可能出现一两个像素的断口，于是狗的一条腿/一只爪子就成了**独立连通块**，
      被当成"隔壁伸过来的碎片"整块删掉——切出来的狗缺手缺脚。
      现在改成：
        1) 全图做一次连通域标记；
        2) 每个连通域按**重心**归到它所在的那一格；
        3) 每格里只丢掉"面积小于该格最大块 1% 且绝对值小于 600 像素"的碎屑。
      这样隔壁的碎片（重心在隔壁）不会混进来，而自己断开的肢体（重心在本格、
      面积也不小）会被保留。宁可按整只算，也不要把狗切残。
    """
    h, w = rgba.shape[:2]
    alpha = rgba[:, :, 3]
    comps = label_components(alpha)
    if not comps:
        return [(0, 0, w, h)] * 4, {}

    # 用最大块（就是其中一只狗）量一个"体量"参考，用来判断什么叫碎屑
    ref = comps[0]['area']

    grid = {0: [], 1: [], 2: [], 3: []}
    dropped = []
    for c in comps:
        col = 0 if c['cx'] < w / 2 else 1
        row = 0 if c['cy'] < h / 2 else 1
        idx = row * 2 + col
        if c['area'] < max(600, ref * 0.01):
            dropped.append((idx, c['area']))
            continue
        grid[idx].append(c)

    # 某一格空了（重心法偶尔会把一只狗整体判到隔壁）→ 用第 1 版的"中缝法"兜底
    cells = []
    for idx in range(4):
        items = grid[idx]
        if not items:
            cells.append(None)
            continue
        x0 = min(c['bbox'][0] for c in items)
        y0 = min(c['bbox'][1] for c in items)
        x1 = max(c['bbox'][2] for c in items)
        y1 = max(c['bbox'][3] for c in items)
        cells.append((x0, y0, x1, y1))

    if verbose:
        for idx in range(4):
            n = len(grid[idx])
            parts = sum(c['area'] for c in grid[idx])
            print(f'    格{idx}: {n} 块 / {parts} 像素'
                  + ('' if cells[idx] else '  ← 空，需要兜底'))
        if dropped:
            print(f'    丢掉碎屑 {len(dropped)} 块，合计 {sum(a for _, a in dropped)} 像素')

    if any(c is None for c in cells):
        fallback = split_by_gutters(rgba)
        cells = [c if c else fallback[i] for i, c in enumerate(cells)]
    return cells, {'dropped': dropped, 'ref': ref}


def split_by_gutters(rgba):
    """兜底：按"整行/整列都是空的"找中缝。重心法失效时用它。"""
    h, w = rgba.shape[:2]
    alpha = rgba[:, :, 3] > 0
    rows_empty = ~alpha.any(axis=1)

    def gutter(empty, lo, hi):
        best = None
        start = None
        for i in range(lo, hi):
            if empty[i]:
                if start is None:
                    start = i
            else:
                if start is not None:
                    if best is None or (i - start) > (best[1] - best[0]):
                        best = (start, i)
                    start = None
        if start is not None and (best is None or (hi - start) > (best[1] - best[0])):
            best = (start, hi)
        if best is None:
            mid = (lo + hi) // 2
            return mid, mid
        return best

    my0, my1 = gutter(rows_empty, int(h * 0.25), int(h * 0.75))
    cells = []
    for (y0, y1) in ((0, my0), (my1, h)):
        sub = rgba[y0:y1]
        cols_empty = ~(sub[:, :, 3] > 0).any(axis=0)
        gx0, gx1 = gutter(cols_empty, int(w * 0.25), int(w * 0.75))
        cells.append((0, y0, gx0, y1))
        cells.append((gx1, y0, w, y1))
    return cells


def bbox_of(rgba, x0, y0, x1, y1):
    """在指定区域里找内容的外接矩形（像素坐标，含端点）。"""
    sub = rgba[y0:y1, x0:x1, 3] > 0
    ys, xs = np.where(sub)
    if len(ys) == 0:
        return None
    return (x0 + int(xs.min()), y0 + int(ys.min()),
            x0 + int(xs.max()), y0 + int(ys.max()))


def split_quadrants(rgba):
    """按"整行/整列都是空的"来找四格的中缝，比硬切 1/2 稳。

    四格的间距不一定在正中间（图是生成出来的），
    直接对半切会把上一格的脚切到下一格里。
    """
    h, w = rgba.shape[:2]
    alpha = rgba[:, :, 3] > 0
    rows_empty = ~alpha.any(axis=1)
    cols_empty = ~alpha.any(axis=0)

    def gutter(empty, lo, hi):
        """在中段找最宽的一段空白当缝"""
        best = None
        start = None
        for i in range(lo, hi):
            if empty[i]:
                if start is None:
                    start = i
            else:
                if start is not None:
                    if best is None or (i - start) > (best[1] - best[0]):
                        best = (start, i)
                    start = None
        if start is not None and (best is None or (hi - start) > (best[1] - best[0])):
            best = (start, hi)
        if best is None:
            mid = (lo + hi) // 2
            return mid, mid
        return best

    my0, my1 = gutter(rows_empty, int(h * 0.25), int(h * 0.75))
    mx0, mx1 = gutter(cols_empty, int(w * 0.25), int(w * 0.75))
    # 水平缝取两半各自的（左右两列的狗高度不同）
    cells = []
    for (y0, y1) in ((0, my0), (my1, h)):
        sub = rgba[y0:y1]
        cols_sub = ~(sub[:, :, 3] > 0).any(axis=0)
        gx0, gx1 = gutter(cols_sub, int(w * 0.25), int(w * 0.75))
        cells.append((0, y0, gx0, y1))
        cells.append((gx1, y0, w, y1))
    return cells


def paste_centered(canvas, crop, scale):
    """把裁好的图按 scale 缩放后，脚底对齐基线、水平居中地贴到画布上。"""
    ch, cw = crop.shape[:2]
    nw, nh = max(1, int(round(cw * scale))), max(1, int(round(ch * scale)))
    im = Image.fromarray(crop, 'RGBA').resize((nw, nh), Image.LANCZOS)
    x = (CANVAS - nw) // 2
    y = BASELINE - nh
    if y < 0:                       # 太高就整体下压，别切掉耳朵
        y = 0
    base = Image.fromarray(canvas, 'RGBA')
    base.alpha_composite(im, (max(0, x), max(0, y)))
    return np.asarray(base)


def process_breed(cn_name, code, log):
    folder = os.path.join(PIC, cn_name)
    if not os.path.isdir(folder):
        log.append(f'  ! 缺少目录 {cn_name}')
        return None
    outdir = os.path.join(OUT, code, 'forms')
    os.makedirs(outdir, exist_ok=True)

    sheet_path = find_sheet(folder)
    if sheet_path is None:
        log.append(f'  ! {cn_name} 找不到四格图')
        return None

    sheet = key_out_background(Image.open(sheet_path))
    cleaned = clean_alpha(sheet)
    # 面积小的碎屑在 clean_alpha 里已经清过一轮，这里再按连通域归格
    sheet = cleaned
    boxes, info = split_by_components(sheet, verbose=True)
    # 兜底：某一格还是空的就用"中缝法"重切
    for i, b in enumerate(boxes):
        if not b:
            boxes = split_by_gutters(sheet)
            break
    heights = [b[3] - b[1] + 1 for b in boxes]

    # ⚠️ 四格用**同一个**缩放系数（按"坐"那一格定），各缩各的会把趴下放大成巨狗
    sit_h = heights[0]
    scale = TARGET_H / float(sit_h)

    # 主图（如果有）优先当 sit：分辨率更高、细节更干净
    main_path = find_main(folder)
    sit_source = 'sheet'
    if main_path:
        main = clean_alpha(key_out_background(Image.open(main_path)))
        b = bbox_of(main, 0, 0, main.shape[1], main.shape[0])
        if b:
            crop = main[b[1]:b[3] + 1, b[0]:b[2] + 1]
            # 用主图自己的高度重算系数，保证它也是 400 高
            k = TARGET_H / float(crop.shape[0])
            canvas = np.zeros((CANVAS, CANVAS, 4), dtype=np.uint8)
            canvas = paste_centered(canvas, crop, k)
            Image.fromarray(canvas, 'RGBA').save(os.path.join(outdir, 'sit.png'))
            sit_source = os.path.basename(main_path)
    if sit_source == 'sheet':
        crop = sheet[boxes[0][1]:boxes[0][3] + 1, boxes[0][0]:boxes[0][2] + 1]
        canvas = paste_centered(np.zeros((CANVAS, CANVAS, 4), dtype=np.uint8), crop, scale)
        Image.fromarray(canvas, 'RGBA').save(os.path.join(outdir, 'sit.png'))

    sizes = {}
    for i, name in enumerate(CELLS):
        if name == 'sit' and sit_source != 'sheet':
            sizes[name] = TARGET_H
            continue
        b = boxes[i]
        crop = sheet[b[1]:b[3] + 1, b[0]:b[2] + 1]
        canvas = paste_centered(np.zeros((CANVAS, CANVAS, 4), dtype=np.uint8), crop, scale)
        Image.fromarray(canvas, 'RGBA').save(os.path.join(outdir, f'{name}.png'))
        sizes[name] = int(round(crop.shape[0] * scale))

    art = {
        'code': code,
        'name': cn_name,
        'canvas': [CANVAS, CANVAS],
        'baseline': BASELINE,
        'reference': 'sit',
        'forms': {
            'sit':  {'file': 'forms/sit.png',  'h': sizes.get('sit', TARGET_H), 'use': '图鉴/档案/大世界立牌/对战待机'},
            'face': {'file': 'forms/face.png', 'h': sizes['face'], 'use': '正面（对话、结算）'},
            'paw':  {'file': 'forms/paw.png',  'h': sizes['paw'],  'use': '挥手（打招呼/撒娇）'},
            'lie':  {'file': 'forms/lie.png',  'h': sizes['lie'],  'use': '趴下（休息/倒地）'},
        },
        'source': {
            'main': os.path.basename(main_path) if main_path else '',
            'sheet': os.path.basename(sheet_path),
            'note': '由 tools/slice_breeds.py 从用户提供的图切出；四格同系数缩放、脚底对齐 470 基线',
        },
    }
    with open(os.path.join(OUT, code, 'art.json'), 'w', encoding='utf-8') as f:
        json.dump(art, f, ensure_ascii=False, indent=2)
    log.append(f'  {cn_name:6s} → {code:16s} 四格高 {heights}  系数 {scale:.3f}  '
               f'sit 用 {sit_source}')
    return art


def main():
    log = []
    made = 0
    for cn, code in BREEDS.items():
        try:
            if process_breed(cn, code, log):
                made += 1
        except Exception as e:      # noqa: BLE001
            log.append(f'  ! {cn} 处理失败：{type(e).__name__}: {e}')
    print('\n'.join(log))
    print(f'\n{made}/{len(BREEDS)} 个品种已切好 → {OUT}')
    return 0 if made == len(BREEDS) else 1


if __name__ == '__main__':
    sys.exit(main())
