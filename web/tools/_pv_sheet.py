"""把 PV 的关键帧拼成一张对照图（省得一张张看）。"""
import glob
import os

from PIL import Image, ImageDraw

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'shots')
fs = sorted(glob.glob(os.path.join(D, 'PV-*.png')))
COLS = 4
CW, CH = 400, 232
PAD = 6
rows = (len(fs) + COLS - 1) // COLS
sheet = Image.new('RGB', (COLS * (CW + PAD) + PAD, rows * (CH + 22) + PAD + 20), (30, 30, 30))
d = ImageDraw.Draw(sheet)
d.text((6, 4), f'长夜月 · 开场 PV Demo · {len(fs)} 个关键帧', fill=(230, 226, 216))
for i, f in enumerate(fs):
    r, c = divmod(i, COLS)
    x = PAD + c * (CW + PAD)
    y = 20 + r * (CH + 22)
    im = Image.open(f).convert('RGB')
    im.thumbnail((CW, CH), Image.LANCZOS)
    sheet.paste(im, (x, y))
    d.text((x + 3, y + CH + 3), os.path.basename(f).replace('PV-', '').replace('.png', ''),
           fill=(200, 195, 185))
out = os.path.join(D, 'PV-sheet.png')
sheet.save(out)
print('已写出', out, sheet.size)
