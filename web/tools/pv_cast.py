#!/usr/bin/env python3
"""把 剧本/图片/ 里的人物立绘拷进 PV 的素材目录。

⚠️ 上一版这里是错的：我以为是白底，跑了一遍洪水填充抠图。
   实际上那几张源图**本来就是 RGBA 透明底**（透明占比 36~63%），不需要抠；
   而且我还把它们从 1536 高缩到了 900，白掉一次画质。
   现在改成：**原样拷贝，不加工**，只量一个"实心内容框"给前端摆位用
   （用 alpha>128 量，避开边缘那一圈很淡的抗锯齿）。

输出：web/public/pv/cast/<name>.png  +  cast.json
"""
import json
import os
import shutil

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.normpath(os.path.join(HERE, '..'))
SRC = os.path.normpath(os.path.join(WEB, '..', '..', '剧本', '图片'))
OUT = os.path.join(WEB, 'public', 'pv', 'cast')

# 源文件 → 输出名（ASCII，免得中文路径在浏览器/服务器上出岔子）
MAP = [
    ('记录员全身.png',    'recorder_full'),   # 记录员 · 全身
    ('记录员形象.png',    'recorder_bust'),   # 记录员 · 半身（兜帽细节）
    ('登记处的女人.png',  'qin_su'),          # 秦素
    ('老记录员.png',      'han_bai'),         # 韩柏
    ('对手记录员.png',    'zhou_lang'),       # 周朗
]


def main():
    # 清掉上一版加工过的产物
    if os.path.isdir(OUT):
        for f in os.listdir(OUT):
            if f.endswith('.png'):
                os.remove(os.path.join(OUT, f))
    os.makedirs(OUT, exist_ok=True)

    meta = {}
    for src, name in MAP:
        p = os.path.join(SRC, src)
        if not os.path.isfile(p):
            print(f'  ! 缺少 {src}')
            continue
        dst = os.path.join(OUT, f'{name}.png')
        shutil.copyfile(p, dst)                      # 原样拷贝，不重新编码

        im = Image.open(dst).convert('RGBA')
        a = np.asarray(im)[:, :, 3]
        solid = a > 128                              # 避开边缘淡抗锯齿
        ys, xs = np.where(solid)
        box = ([int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
               if len(ys) else [0, 0, im.width - 1, im.height - 1])
        meta[name] = {
            'file': f'cast/{name}.png',
            'w': im.width, 'h': im.height,
            'box': box,
            'boxAr': round((box[2] - box[0] + 1) / max(1, box[3] - box[1] + 1), 3),
        }
        print(f'  {src:22s} → {name:14s} {im.width}x{im.height}  '
              f'实心框 {box[2] - box[0] + 1}x{box[3] - box[1] + 1}')

    with open(os.path.join(OUT, 'cast.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f'\n共 {len(meta)} 张（原样拷贝，未加工）→ {OUT}')


if __name__ == '__main__':
    main()
