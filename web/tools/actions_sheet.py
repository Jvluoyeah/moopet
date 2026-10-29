#!/usr/bin/env python3
"""动作帧质检图：每个品种一行，把关键动作和已有的 sit 立绘并排放在同一画布上。

看三件事：
  1) 透明有没有抠干净（棋盘底，出现白方块就是没抠掉）
  2) 换动作时狗会不会忽大忽小（同一个品种所有身体动作共用一个缩放系数）
  3) 动作名有没有按错（run 那一格应该是跑的姿势，不能是趴着）

用法：python tools/actions_sheet.py [品种中文名...]
输出：web/tests/shots/CC-actions.png
"""
import json
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.normpath(os.path.join(HERE, '..'))
OUT = os.path.join(WEB, 'public', 'breeds')
SHOTS = os.path.join(WEB, 'tests', 'shots')

BREEDS = [('萨摩耶', 'samoyed'), ('边牧', 'border_collie'), ('金毛', 'golden'),
          ('柯基', 'corgi'), ('柴犬', 'shiba'), ('德牧', 'german_shepherd'),
          ('哈士奇', 'husky'), ('比熊', 'bichon')]

# 想看的顺序（没有的品种自动跳过）
WANT = ['sit', 'idle_01', 'run_01', 'run_02', 'attack_01', 'jump_01',
        'roll_01', 'sleep_01', 'win_01', 'head_happy_01']
CELL = 132
PAD = 5
LABEL = 20


def checker(size, a=(236, 231, 220), b=(218, 211, 197), step=11):
    im = Image.new('RGB', (size, size), a)
    d = ImageDraw.Draw(im)
    for y in range(0, size, step):
        for x in range(0, size, step):
            if ((x // step) + (y // step)) % 2:
                d.rectangle([x, y, x + step - 1, y + step - 1], fill=b)
    return im


def main():
    picks = sys.argv[1:]
    rows = [b for b in BREEDS if not picks or b[0] in picks]
    os.makedirs(SHOTS, exist_ok=True)
    W = (len(WANT) + 1) * (CELL + PAD) + PAD
    H = len(rows) * (CELL + LABEL + PAD) + PAD + 34
    sheet = Image.new('RGB', (W, H), (246, 243, 236))
    d = ImageDraw.Draw(sheet)
    d.text((PAD, 6), '动作帧质检 · 每行一个品种，第一列是已有的 sit 立绘（同一画布 512/基线 470）',
           fill=(35, 33, 29))
    d.text((PAD, 20), '检查：透明抠干净没 / 换动作会不会忽大忽小 / 动作名有没有按错',
           fill=(150, 60, 50))

    for r, (cn, code) in enumerate(rows):
        y = 34 + r * (CELL + LABEL + PAD)
        d.text((PAD + 2, y + CELL // 2), cn, fill=(35, 33, 29))
        files = [('sit', os.path.join(OUT, code, 'forms', 'sit.png'))]
        for name in WANT[1:]:
            files.append((name, os.path.join(OUT, code, 'actions', f'{name}.png')))
        missing = []
        for c, (name, p) in enumerate(files):
            x = PAD + (c + 1) * (CELL + PAD)
            sheet.paste(checker(CELL), (x, y))
            if not os.path.isfile(p):
                missing.append(name)
                d.text((x + 6, y + CELL // 2), '—', fill=(170, 160, 148))
            else:
                im = Image.open(p).convert('RGBA')
                im.thumbnail((CELL, CELL), Image.LANCZOS)
                sheet.paste(im, (x + (CELL - im.width) // 2,
                                 y + CELL - im.height), im)
            d.text((x + 3, y + CELL + 2), name, fill=(90, 84, 76))
        if missing:
            print(f'  {cn} 缺少: {missing}')

    p = os.path.join(SHOTS, 'CC-actions.png')
    sheet.save(p)
    print('已写出', p, sheet.size)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
