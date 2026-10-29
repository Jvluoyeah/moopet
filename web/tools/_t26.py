"""验收 26 秒版：11 句的起止 / 用到的图 / 截帧。"""
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

URL = 'http://127.0.0.1:8099/pv2/flash/'
PICK = [(1.6, '1-呼吸结冰'), (5.0, '2-绝望者'), (7.3, '3-直到'),
        (9.1, '4-签下名字'), (11.5, '5-残破的废铁'), (13.1, '6-受击'),
        (14.0, '6-铁爪'), (15.4, '7-红光眼'), (17.6, '8-铁爪'),
        (19.8, '9-走向你'), (22.2, '10-推开门'), (24.8, '11-永远在')]

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={'width': 1280, 'height': 720}).new_page()
    errs, bad = [], []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('response', lambda r: bad.append(r.url.split('/')[-1]) if r.status >= 400 else None)
    pg.goto(URL, wait_until='networkidle')
    pg.wait_for_timeout(2200)
    print('总时长:', pg.evaluate('() => window.__total()'))
    print('用到的图:', pg.evaluate("""() => [...new Set(
        BEATS.flatMap(x=>x.shots).filter(s=>s[0]==='img').map(s=>s[1]))]"""))
    print('\n11 句的时间轴：')
    for r in pg.evaluate("""() => BEATS.map(b=>({t:b.t, d:b.d,
        end:+(b.t+b.d).toFixed(2), cn:b.cn}))"""):
        print(f"  {r['t']:>5.1f} → {r['end']:>5.1f}s  ({r['d']}s)  {r['cn']}")
    for t, nm in PICK:
        pg.evaluate('(a) => window.__seek(a)', t)
        pg.wait_for_timeout(130)
        pg.screenshot(path=f'tests/shots/T26-{nm}.png')
    print('\n404:', sorted(set(bad)) if bad else '无', '｜JS 错误:', errs[:2] if errs else '无')
    b.close()

COLS, CW, CH, PAD = 4, 320, 180, 5
rows = (len(PICK) + COLS - 1) // COLS
sheet = Image.new('RGB', (COLS * (CW + PAD) + PAD, rows * (CH + 19) + PAD + 16), (14, 14, 14))
d = ImageDraw.Draw(sheet)
d.text((6, 3), '长夜月 · 快闪 PV · 26s（收紧后）', fill=(230, 226, 216))
for i, (t, nm) in enumerate(PICK):
    rr, cc = divmod(i, COLS)
    x, y = PAD + cc * (CW + PAD), 16 + rr * (CH + 19)
    im = Image.open(f'tests/shots/T26-{nm}.png').convert('RGB')
    im.thumbnail((CW, CH), Image.LANCZOS)
    sheet.paste(im, (x, y))
    d.text((x + 2, y + CH + 2), f'{nm} {t}s', fill=(205, 200, 190))
sheet.save('tests/shots/T26-sheet.png')
print('总览:', sheet.size)
