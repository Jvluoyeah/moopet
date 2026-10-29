"""语法自检 + 90s 版验收 + 截帧。"""
import glob
import os
import re
import subprocess
import tempfile

from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

# --- 先做语法检查，免得又白跑一轮 ---
t = open('public/pv/index.html', encoding='utf-8').read()
m = re.search(r"<script>(.*?)</script>", t, re.S)
f = os.path.join(tempfile.gettempdir(), 'pvchk.js')
open(f, 'w', encoding='utf-8').write(m.group(1))
r = subprocess.run(['node', '--check', f], capture_output=True, text=True)
print('node --check:', '通过' if r.returncode == 0 else '失败')
if r.returncode != 0:
    print(r.stderr[:900])
    raise SystemExit(1)

D = 'tests/shots'
with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    pg = b.new_context(viewport={'width': 1280, 'height': 720}).new_page()
    errs, bad = [], []
    pg.on('pageerror', lambda e: errs.append('ERR ' + str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('response', lambda r: bad.append(r.url.split('/')[-1]) if r.status >= 400 else None)
    pg.goto('http://127.0.0.1:8099/pv/', wait_until='networkidle')
    pg.wait_for_function("() => !document.getElementById('play').disabled", timeout=60000)

    print('时长:', pg.evaluate('() => TOTAL'), '｜镜头:', pg.evaluate('() => SHOTS.length'))
    print('运镜+调色+呼吸 覆盖:', pg.evaluate("""() => {
        const ids=[...new Set(SHOTS.filter(s=>s.id).map(s=>MAP[s.id].replace('scene/','')))];
        const miss=ids.filter(k=>!MOVE[k]||!GRADE[k]||!ACC[k]);
        return ids.length+' 张场景，缺配置的：'+(miss.length?miss.join(','):'无');}"""))
    print('刺眼元素:', pg.evaluate("""() => {
        const g=id=>{const e=document.getElementById(id);return e?getComputedStyle(e).display:'(无)';};
        return {白闪:g('flash'),擦除条:g('wipe'),撕裂条:g('slices'),漏光:g('glow')};}"""))
    pg.evaluate("""() => { window.__ft=[]; let l=performance.now();
        const tk=()=>{const n=performance.now(); window.__ft.push(n-l); l=n;
          if(window.__ft.length<700) requestAnimationFrame(tk);}; requestAnimationFrame(tk); }""")
    pg.click('#play')
    pg.wait_for_timeout(13000)
    print('帧时间:', pg.evaluate("""() => { const a=window.__ft.filter(x=>x<500).sort((x,y)=>x-y);
        return {中位:+a[a.length>>1].toFixed(1), p95:+a[Math.floor(a.length*.95)].toFixed(1),
                长帧:a.filter(x=>x>50).length}; }"""))
    print('失败请求:', sorted(set(bad))[:4] if bad else '无', '｜JS 错误:', errs[:2] if errs else '无')

    marks = pg.evaluate("""() => SHOTS.map((s,i)=>({t:(s.t+s.t+s.l)/2,i,k:s.k}))""")
    for mm in marks:
        pg.evaluate(f"() => {{ playing=false; lastB=null; memo={{}}; render({mm['t']-0.5}); }}")
        pg.evaluate(f"() => {{ render({mm['t']}); }}")
        pg.evaluate("""() => { fxT=0; fxPow=0; band._t=null; band.style.opacity=0;
            lines._t=null; lines.style.opacity=0; }""")
        pg.wait_for_timeout(120)
        pg.screenshot(path=f"{D}/A90-{mm['i']:02d}-{mm['k']}.png")
    b.close()

fs = sorted(glob.glob(os.path.join(D, 'A90-*.png')))
COLS, CW, CH, PAD = 6, 256, 144, 4
rows = (len(fs) + COLS - 1) // COLS
sheet = Image.new('RGB', (COLS * (CW + PAD) + PAD, rows * (CH + 17) + PAD + 16), (20, 20, 20))
d = ImageDraw.Draw(sheet)
d.text((6, 3), f'长夜月 · 90s PV · {len(fs)} 镜 · 按图设计的运镜/调色/呼吸', fill=(230, 226, 216))
for i, fp in enumerate(fs):
    rr, cc = divmod(i, COLS)
    x, y = PAD + cc * (CW + PAD), 16 + rr * (CH + 17)
    im = Image.open(fp).convert('RGB')
    im.thumbnail((CW, CH), Image.LANCZOS)
    sheet.paste(im, (x, y))
    d.text((x + 2, y + CH + 1), os.path.basename(fp).replace('A90-', '').replace('.png', ''),
           fill=(190, 185, 175))
sheet.save(os.path.join(D, 'A90-sheet.png'))
print('总览:', sheet.size)
