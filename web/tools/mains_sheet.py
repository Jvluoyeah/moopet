"""把 8 个品种的**主图**拼成一张对比图，用来逐个确认体型口径。

为什么要看这张而不是靠印象：8 只狗的体型差得很远
（萨摩耶圆滚滚 / 哈士奇细高 / 柯基低矮 / 德牧高大），
用一套通用的"头大而圆、腿短而粗"去描述所有狗，会把哈士奇描述成萨摩耶。
"""
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.normpath(os.path.join(HERE, '..'))
PIC = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'pic'))
SHOTS = os.path.join(WEB, 'tests', 'shots')

ORDER = [('萨摩耶', 'samoyed'), ('哈士奇', 'husky'), ('边牧', 'border_collie'),
         ('德牧', 'german_shepherd'), ('金毛', 'golden'), ('柴犬', 'shiba'),
         ('柯基', 'corgi'), ('比熊', 'bichon')]

CELL_W, CELL_H = 300, 400
PAD = 8
LABEL = 26


def main():
    cols = 4
    rows = 2
    W = cols * (CELL_W + PAD) + PAD
    H = rows * (CELL_H + LABEL + PAD) + PAD + 24
    sheet = Image.new('RGB', (W, H), (248, 245, 238))
    d = ImageDraw.Draw(sheet)
    d.text((PAD, 8), '八只狗的主图对比 · 逐个确认体型口径（头身比 / 口鼻长 / 腿长 / 体态）',
           fill=(40, 38, 34))

    for i, (cn, code) in enumerate(ORDER):
        r, c = divmod(i, cols)
        x = PAD + c * (CELL_W + PAD)
        y = 28 + r * (CELL_H + LABEL + PAD)
        d.rectangle([x, y, x + CELL_W, y + CELL_H], fill=(255, 255, 255),
                    outline=(210, 204, 192))
        p = os.path.join(PIC, cn, '主图.png')
        if not os.path.isfile(p):
            p = os.path.join(PIC, cn, '主视图.png')
        im = Image.open(p).convert('RGBA')
        # 画一条水平参考线 + 三等分线，方便肉眼估头身比
        for k in (1, 2, 3):
            yy = y + CELL_H * k // 4
            d.line([(x, yy), (x + CELL_W, yy)], fill=(226, 120, 110), width=1)
        im.thumbnail((CELL_W - 12, CELL_H - 12), Image.LANCZOS)
        sheet.paste(im, (x + (CELL_W - im.width) // 2,
                         y + CELL_H - im.height - 6), im)
        d.text((x + 6, y + CELL_H + 4), f'{cn}  ({code})', fill=(40, 38, 34))

    os.makedirs(SHOTS, exist_ok=True)
    out = os.path.join(SHOTS, '99-mains.png')
    sheet.save(out)
    print('已写出', out, sheet.size)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
