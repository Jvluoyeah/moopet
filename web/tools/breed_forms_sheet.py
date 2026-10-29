#!/usr/bin/env python3
"""切图质检页：把切好的四形态排成一张对比图，人工扫一眼就能发现
   "哪只没抠干净 / 哪只趴下被放大成巨狗 / 哪只脚没对齐"。

   用法：python tools/breed_forms_sheet.py
   输出：web/tests/shots/90-breed-forms.png
"""
import json
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.normpath(os.path.join(HERE, '..'))
OUT = os.path.join(WEB, 'public', 'breeds')
SHOTS = os.path.join(WEB, 'tests', 'shots')

ORDER = ['samoyed', 'border_collie', 'golden', 'corgi',
         'shiba', 'german_shepherd', 'husky', 'bichon']
FORMS = ['sit', 'face', 'paw', 'lie']
CN = {'samoyed': '萨摩耶', 'border_collie': '边牧', 'golden': '金毛', 'corgi': '柯基',
      'shiba': '柴犬', 'german_shepherd': '德牧', 'husky': '哈士奇', 'bichon': '比熊'}

CELL = 190
PAD = 10
LABEL = 26
COLS = len(FORMS)


def checker(size, a=(232, 226, 212), b=(214, 206, 190), step=12):
    im = Image.new('RGB', (size, size), a)
    d = ImageDraw.Draw(im)
    for y in range(0, size, step):
        for x in range(0, size, step):
            if ((x // step) + (y // step)) % 2:
                d.rectangle([x, y, x + step - 1, y + step - 1], fill=b)
    return im


def main():
    os.makedirs(SHOTS, exist_ok=True)
    cols = COLS + 1
    W = cols * (CELL + PAD) + PAD
    H = len(ORDER) * (CELL + LABEL + PAD) + PAD + 34
    sheet = Image.new('RGB', (W, H), (245, 241, 232))
    d = ImageDraw.Draw(sheet)
    d.text((PAD, 10), 'breed forms QA  ·  sit / face / paw / lie  ·  canvas 512, baseline 470',
           fill=(40, 38, 34))
    for c, name in enumerate(FORMS):
        d.text((PAD + (c + 1) * (CELL + PAD) + 6, 26), name, fill=(90, 86, 78))

    missing = []
    for r, code in enumerate(ORDER):
        y = 40 + r * (CELL + LABEL + PAD)
        d.text((PAD + 4, y + CELL // 2), CN[code], fill=(40, 38, 34))
        art_path = os.path.join(OUT, code, 'art.json')
        art = {}
        if os.path.isfile(art_path):
            with open(art_path, encoding='utf-8') as f:
                art = json.load(f)
        for c, form in enumerate(FORMS):
            x = PAD + (c + 1) * (CELL + PAD)
            sheet.paste(checker(CELL), (x, y))
            fp = os.path.join(OUT, code, 'forms', f'{form}.png')
            if not os.path.isfile(fp):
                missing.append(f'{code}/{form}')
                d.text((x + 8, y + CELL // 2), 'MISSING', fill=(168, 51, 42))
                continue
            im = Image.open(fp).convert('RGBA')
            im.thumbnail((CELL, CELL), Image.LANCZOS)
            sheet.paste(im, (x + (CELL - im.width) // 2, y + CELL - im.height), im)
            h = art.get('forms', {}).get(form, {}).get('h', '')
            d.text((x + 4, y + 4), f'h={h}', fill=(120, 112, 100))

    sheet.save(os.path.join(SHOTS, '90-breed-forms.png'))
    print('已写出', os.path.join(SHOTS, '90-breed-forms.png'))
    if missing:
        print('缺文件：', missing)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
