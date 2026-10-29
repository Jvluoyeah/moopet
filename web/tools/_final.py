"""最终验收：语法 / 时长 / 构成 / 标题残留 / 剪影颜色 / 截帧。"""
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
    print(r.stderr[:700]); raise SystemExit(1)

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
    print('剪影配色:', pg.evaluate("""() => SHOTS.filter(s=>s.k==='sil').map(s=>
        s.t+'s '+(s.colors?'四色并排':(s.tone||'')+'底')+' '+((s.who||[]).join('+')))"""))

    # 标题残留检查：全片扫一遍，看有多少帧标题是可见的
    bad = pg.evaluate("""() => { const out=[];
        for(let t=0;t<TOTAL;t+=0.25){
            render(t);
            const v=getComputedStyle(document.getElementById('title')).visibility;
            const o=+getComputedStyle(document.getElementById('title')).opacity;
            if(v!=='hidden'&&o>0.05) out.push(+t.toFixed(2));
        }
        return out; }""")
    print('标题可见的时刻:', f'{len(bad)} 帧', bad[:6], '...' if len(bad) > 6 else '')
    print('（应当只在 86.5s 之后出现）')

    for at, name in [(30.6, 'sil-记录员-夜墨蓝'), (38.2, 'sil-韩柏-旧铜'),
                     (60.7, 'sil-秦素-灰'), (65.8, 'sil-周朗-苔绿'),
                     (79.4, 'sil-四色并排'), (1.6, 'anim-门打开')]:
        pg.evaluate(f"() => {{ playing=false; lastB=null; memo={{}}; render({at-0.5}); }}")
        pg.evaluate(f"() => {{ render({at}); }}")
        pg.evaluate("() => { dip.style.opacity=0; fxT=0; fxPow=0; }")
        pg.wait_for_timeout(140)
        pg.screenshot(path=f"{D}/FN-{name}.png")
    print('JS 错误:', errs[:2] if errs else '无')
    b.close()

fs = sorted(glob.glob(os.path.join(D, 'FN-*.png')))
COLS, CW, CH, PAD = 3, 400, 225, 6
rows = (len(fs) + COLS - 1) // COLS
sheet = Image.new('RGB', (COLS * (CW + PAD) + PAD, rows * (CH + 20) + PAD + 16), (18, 18, 18))
d = ImageDraw.Draw(sheet)
d.text((6, 3), '长夜月 · 90s PV · 剪影改用角色主题色', fill=(230, 226, 216))
for i, fp in enumerate(fs):
    rr, cc = divmod(i, COLS)
    x, y = PAD + cc * (CW + PAD), 16 + rr * (CH + 20)
    im = Image.open(fp).convert('RGB'); im.thumbnail((CW, CH), Image.LANCZOS)
    sheet.paste(im, (x, y))
    d.text((x + 3, y + CH + 3), os.path.basename(fp).replace('FN-', '').replace('.png', ''),
           fill=(200, 195, 185))
sheet.save(os.path.join(D, 'FN-sheet.png'))
print('总览:', sheet.size)
