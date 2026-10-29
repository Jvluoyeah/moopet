"""最终验收：语法 / 镜头构成 / 转场 / 三套动画能不能跑 / 截帧。"""
import glob
import os
import re
import subprocess
import tempfile

from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

t = open('public/pv/index.html', encoding='utf-8').read()
m = re.search(r"<script>(.*?)</script>", t, re.S)
f = os.path.join(tempfile.gettempdir(), 'pvchk.js')
open(f, 'w', encoding='utf-8').write(m.group(1))
r = subprocess.run(['node', '--check', f], capture_output=True, text=True)
print('node --check:', '通过' if r.returncode == 0 else '失败')
if r.returncode:
    print(r.stderr[:800]); raise SystemExit(1)

D = 'tests/shots'
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={'width': 1280, 'height': 720}).new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append('ERR ' + str(e)))
    pg.on('console', lambda mm: errs.append(mm.text) if mm.type == 'error' else None)
    pg.goto('http://127.0.0.1:8099/pv/', wait_until='networkidle')
    pg.wait_for_function("() => !document.getElementById('play').disabled", timeout=60000)

    print('时长:', pg.evaluate('() => TOTAL'), '｜镜头:', pg.evaluate('() => SHOTS.length'))
    print('构成:', pg.evaluate("""() => { const g={};
        SHOTS.forEach(s=>g[s.k]=(g[s.k]||0)+1);
        return Object.entries(g).map(([k,v])=>k+'×'+v).join('  ');}"""))
    print('动画段:', pg.evaluate("""() => SHOTS.filter(s=>s.k==='anim').map(s=>s.t+'s '+s.anim)"""))
    print('剪影段:', pg.evaluate("""() => SHOTS.filter(s=>s.k==='sil').map(s=>s.t+'s '+(s.who||[]).length+'人')"""))

    # 三套动画各截一帧
    for at, name in [(1.6, 'door-门打开'), (33.5, 'tower-去月塔'), (63.2, 'walkby-剪影走过'),
                     (11.0, 'sil-记录员剪影'), (79.0, 'sil-四人')]:
        pg.evaluate(f"() => {{ playing=false; lastB=null; memo={{}}; render({at-0.5}); }}")
        pg.evaluate(f"() => {{ render({at}); }}")
        pg.evaluate("() => { dip.style.opacity=0; fxT=0; fxPow=0; band._t=null; band.style.opacity=0; }")
        pg.wait_for_timeout(140)
        pg.screenshot(path=f"{D}/AN-{name}.png")
        st = pg.evaluate("""() => { const a=document.getElementById('anim');
            return {kind:a.dataset.kind||'(无)', on:a.style.opacity,
                    子元素:a.children.length+(a.firstElementChild?a.firstElementChild.children.length:0)}; }""")
        print(f'  {name}: {st}')
    print('JS 错误:', errs[:3] if errs else '无')
    b.close()

fs = sorted(glob.glob(os.path.join(D, 'AN-*.png')))
COLS, CW, CH, PAD = 3, 420, 236, 6
rows = (len(fs) + COLS - 1) // COLS
sheet = Image.new('RGB', (COLS * (CW + PAD) + PAD, rows * (CH + 20) + PAD + 16), (16, 16, 16))
d = ImageDraw.Draw(sheet)
d.text((6, 3), '长夜月 · 90s PV · 动画段 + 剪影段（黑场转场）', fill=(230, 226, 216))
for i, fp in enumerate(fs):
    rr, cc = divmod(i, COLS)
    x, y = PAD + cc * (CW + PAD), 16 + rr * (CH + 20)
    im = Image.open(fp).convert('RGB'); im.thumbnail((CW, CH), Image.LANCZOS)
    sheet.paste(im, (x, y))
    d.text((x + 3, y + CH + 3), os.path.basename(fp).replace('AN-', '').replace('.png', ''),
           fill=(200, 195, 185))
sheet.save(os.path.join(D, 'AN-sheet.png'))
print('总览:', sheet.size)
