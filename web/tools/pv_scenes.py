#!/usr/bin/env python3
"""把用户生成的场景图拷进 PV 素材目录（ASCII 命名），并出一张总览图。

原图 2560×1440 都是 16:9，直接原样拷贝——**不缩放、不重新编码**。
PV 里一张底图全屏铺，浏览器自己缩；保留原分辨率是为了后期还能拿去剪视频。
"""
import glob
import json
import os
import shutil

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.normpath(os.path.join(HERE, '..'))
SRC = os.path.normpath(os.path.join(WEB, '..', '..', '剧本', '图片', '场景'))
OUT = os.path.join(WEB, 'public', 'pv', 'scene')

MAP = {
    '登记处-外（门）.png':    'registry_out',
    '登记处 -内（柜台）.png': 'registry_in',
    '柜台的台面.png':         'desk_top',
    '八格位的图鉴架.png':      'dex_rack',
    '册子摊开的一页.png':      'book_page',
    '门缝底下那条光.png':      'door_light',
    '月塔-外.png':            'tower_out',
    '月塔-一楼归档处.png':     'tower_archive',
    '月塔的窗.png':           'tower_window',
    '长夜月广场-石环.png':     'plaza',
    '长夜月公园.png':          'park',
    '月光竞技场.png':          'arena',
    '训练场.png':             'training',
    '天台.png':               'rooftop',
    '石环的局部.png':          'ring_close',
}


def main():
    os.makedirs(OUT, exist_ok=True)
    meta, missing = {}, []
    for src, name in MAP.items():
        p = os.path.join(SRC, src)
        if not os.path.isfile(p):
            missing.append(src)
            continue
        dst = os.path.join(OUT, f'{name}.png')
        im = Image.open(p)
        src_w, src_h = im.size
        # ⚠️ **原样拷贝，不降分辨率**（用户明确要求）。
        # 网页里靠"横向擦除条"遮住换图那一瞬来省性能，不靠缩图。
        shutil.copyfile(p, dst)
        meta[name] = {'file': f'scene/{name}.png', 'w': im.width, 'h': im.height,
                      'src': src, 'srcSize': f'{src_w}x{src_h}'}
        print(f'  {src:24s} → {name:14s} {im.width}x{im.height}')

    with open(os.path.join(OUT, 'scenes.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    # 总览图
    keys = list(meta)
    COLS, CW, CH, PAD = 4, 330, 186, 6
    rows = (len(keys) + COLS - 1) // COLS
    sheet = Image.new('RGB', (COLS * (CW + PAD) + PAD, rows * (CH + 18) + PAD + 16),
                      (24, 24, 24))
    d = ImageDraw.Draw(sheet)
    d.text((6, 3), f'长夜月 · 场景素材 {len(keys)} 张（2560×1440）', fill=(230, 226, 216))
    for i, k in enumerate(keys):
        r, c = divmod(i, COLS)
        x, y = PAD + c * (CW + PAD), 16 + r * (CH + 18)
        im = Image.open(os.path.join(OUT, f'{k}.png')).convert('RGB')
        im.thumbnail((CW, CH), Image.LANCZOS)
        sheet.paste(im, (x, y))
        d.text((x + 3, y + CH + 2), k, fill=(198, 193, 183))
    sp = os.path.join(WEB, 'tests', 'shots', 'SC-scenes.png')
    sheet.save(sp)
    print(f'\n共 {len(meta)} 张 → {OUT}')
    if missing:
        print('缺：', missing)
    print('总览图 →', sp)


if __name__ == '__main__':
    main()
