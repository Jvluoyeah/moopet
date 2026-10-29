#!/usr/bin/env python3
"""把一批图排成带编号的联络表，方便一眼分类（哪张是跑、哪张是跳、哪张是表情）。

用法：python tools/contact_sheet.py <目录> <输出png> [列数] [每格px] [--fixed]

  --fixed  不按格子缩放，统一按"每格 px = 原图的一个固定比例"贴。
           比较**相对大小**时必须用它：默认模式会把每张都缩到一样大，
           改帧之间的比例问题就全看不出来了（切动作帧时踩过）。
"""
import os
import sys

from PIL import Image, ImageDraw

RAW = [a for a in sys.argv[1:] if not a.startswith('--')]
SRC = RAW[0]
OUT = RAW[1]
COLS = int(RAW[2]) if len(RAW) > 2 else 4
CELL = int(RAW[3]) if len(RAW) > 3 else 320
FIXED = '--fixed' in sys.argv

files = sorted(
    f for f in os.listdir(SRC)
    if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')))
if not files:
    print('目录里没有图：', SRC)
    raise SystemExit(1)

LABEL = 30
rows = (len(files) + COLS - 1) // COLS
W = COLS * (CELL + 8) + 8
H = rows * (CELL + LABEL + 8) + 8
sheet = Image.new('RGB', (W, H), (245, 241, 232))
d = ImageDraw.Draw(sheet)

for i, name in enumerate(files):
    r, c = divmod(i, COLS)
    x = 8 + c * (CELL + 8)
    y = 8 + r * (CELL + LABEL + 8)
    # 棋盘底：能看出透明区，也能看出白底图的白边在哪
    for yy in range(0, CELL, 16):
        for xx in range(0, CELL, 16):
            col = (226, 220, 206) if ((xx // 16) + (yy // 16)) % 2 else (240, 236, 226)
            d.rectangle([x + xx, y + yy, x + xx + 15, y + yy + 15], fill=col)
    try:
        im = Image.open(os.path.join(SRC, name)).convert('RGBA')
    except Exception as e:      # noqa: BLE001
        d.text((x + 6, y + CELL // 2), f'打不开: {e}', fill=(168, 51, 42))
        continue
    if FIXED:
        # 同比例对照：不缩到格子大小，按"原图多高就占多高 × 一个固定系数"贴，
        # 这样帧与帧的**相对大小**才看得出来（切动作帧时就是靠这个发现某帧偏大）
        k = CELL / 512.0
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))),
                       Image.LANCZOS)
        sheet.paste(im, (x + (CELL - im.width) // 2, y + CELL - im.height), im)
        # 基线：所有帧的脚底都应该压在这条线上
        by = y + round(470 * k)
        d.line([x, by, x + CELL, by], fill=(168, 51, 42), width=1)
    else:
        im.thumbnail((CELL, CELL), Image.LANCZOS)
        sheet.paste(im, (x + (CELL - im.width) // 2, y + (CELL - im.height) // 2), im)
    d.text((x + 4, y + CELL + 6), f'#{i:02d}  {name[:46]}', fill=(20, 20, 18))
    d.text((x + 4, y + CELL + 18), f'      {im.width}x{im.height}', fill=(120, 112, 100))
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
sheet.save(OUT)
print(f'已写出 {OUT}  ({len(files)} 张，{COLS} 列)')
for i, f in enumerate(files):
    print(f'  #{i:02d} {f}')
