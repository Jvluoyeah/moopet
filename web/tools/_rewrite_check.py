"""重写版验收 —— 重点查用户报的两个 bug：
  1. 剪影是不是整镜都在（不是只闪几帧）
  2. 「长夜月」大字有没有在中途出现
"""
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

    # ---- 逐帧扫全片，检查每一层的残留 ----
    scan = pg.evaluate("""() => {
        const bad={title:[],sil_missing:[],quote_stale:[]};
        let curSil=null;
        for(let t=0;t<TOTAL;t+=0.1){
            SEEK=true;
            render(t);
            const s=shotAt(t);
            const gt=+getComputedStyle(document.getElementById('title')).opacity;
            const gs=+getComputedStyle(document.getElementById('sil')).opacity;
            // 标题只允许在 title/hold 两镜出现
            if(gt>0.02 && s.k!=='title' && s.k!=='hold') bad.title.push(+t.toFixed(1));
            // 剪影镜必须整镜可见
            if(s.k==='sil' && gs<0.99) bad.sil_missing.push(+t.toFixed(1));
        }
        return bad; }""")
    print('标题中途出现:', len(scan['title']), '帧', scan['title'][:8])
    print('剪影缺失:', len(scan['sil_missing']), '帧', scan['sil_missing'][:8])

    # ---- 剪影镜逐帧采样：确认整镜都有 ----
    for st, nm in [(9.97, '记录员-黑白'), (29.51, '记录员-夜墨蓝'), (36.82, '韩柏-旧铜'),
                   (59.62, '秦素-灰'), (64.20, '周朗-苔绿'), (77.80, '四人-四色')]:
        s = pg.evaluate(f"() => {{ const s=shotAt({st}); return {{t:s.t,l:s.l,who:s.who||[]}}; }}")
        rows = []
        for i in range(6):
            tt = s['t'] + s['l'] * (i + .5) / 6
            o = pg.evaluate(f"() => {{ render({tt}); return +getComputedStyle(document.getElementById('sil')).opacity; }}")
            rows.append(round(o, 2))
        print(f"  {nm:14s} {s['t']}s+{s['l']}s  可见度采样 {rows}")

    for at, nm in [(1.6, '门打开'), (30.6, '记录员-夜墨蓝'), (38.2, '韩柏-旧铜'),
                   (60.7, '秦素-灰'), (65.8, '周朗-苔绿'), (79.4, '四人-四色')]:
        pg.evaluate(f"() => window.__seek({at})")
        pg.wait_for_timeout(140)
        pg.screenshot(path=f"{D}/RW-{nm}.png")
    print('JS 错误:', errs[:3] if errs else '无')
    b.close()

fs = sorted(glob.glob(os.path.join(D, 'RW-*.png')))
COLS, CW, CH, PAD = 3, 400, 225, 6
rows = (len(fs) + COLS - 1) // COLS
sheet = Image.new('RGB', (COLS * (CW + PAD) + PAD, rows * (CH + 20) + PAD + 16), (18, 18, 18))
d = ImageDraw.Draw(sheet)
d.text((6, 3), '长夜月 · 90s PV · 重写版', fill=(230, 226, 216))
for i, fp in enumerate(fs):
    rr, cc = divmod(i, COLS)
    x, y = PAD + cc * (CW + PAD), 16 + rr * (CH + 20)
    im = Image.open(fp).convert('RGB'); im.thumbnail((CW, CH), Image.LANCZOS)
    sheet.paste(im, (x, y))
    d.text((x + 3, y + CH + 3), os.path.basename(fp).replace('RW-', '').replace('.png', ''),
           fill=(200, 195, 185))
sheet.save(os.path.join(D, 'RW-sheet.png'))
print('总览:', sheet.size)
