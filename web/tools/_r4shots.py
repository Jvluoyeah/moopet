"""截关键帧：确认 5 张图、四人四色结尾、金色歌词。"""
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

SHOTS = [(1.4, '门打开'), (3.0, '走向登记处'), (9.0, '记录员黑白影'),
         (13.4, '翻页'), (17.0, '狗接飞盘'), (18.4, '记录员夜墨蓝'),
         (26.0, '★记录员卡+金歌词'), (37.8, '秦素灰'), (50.9, '韩柏旧铜'),
         (64.6, '周朗苔绿'), (74.0, '四人四色+标题')]

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={'width': 1280, 'height': 720}).new_page()
    pg.goto('http://127.0.0.1:8099/pv2/', wait_until='networkidle')
    pg.wait_for_function("() => !document.getElementById('play').disabled", timeout=120000)
    for at, nm in SHOTS:
        pg.evaluate(f"() => window.__seek({at})")
        pg.wait_for_timeout(150)
        pg.screenshot(path=f'tests/shots/R4-{nm}.png')
    b.close()

fs = [f'tests/shots/R4-{nm}.png' for _, nm in SHOTS]
COLS, CW, CH, PAD = 4, 320, 180, 5
rows = (len(fs) + COLS - 1) // COLS
sheet = Image.new('RGB', (COLS * (CW + PAD) + PAD, rows * (CH + 19) + PAD + 16), (16, 16, 16))
d = ImageDraw.Draw(sheet)
d.text((6, 3), 'pv2 · 75s · 图只剩 5 张 · 动画 10 段 · 金色歌词', fill=(230, 226, 216))
for i, (fp, (_, nm)) in enumerate(zip(fs, SHOTS)):
    rr, cc = divmod(i, COLS)
    x, y = PAD + cc * (CW + PAD), 16 + rr * (CH + 19)
    im = Image.open(fp).convert('RGB'); im.thumbnail((CW, CH), Image.LANCZOS)
    sheet.paste(im, (x, y))
    d.text((x + 2, y + CH + 2), nm, fill=(205, 200, 190))
sheet.save('tests/shots/R4-sheet.png')
print('总览:', sheet.size)
