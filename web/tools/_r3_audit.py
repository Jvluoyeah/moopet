"""验收：语法 / 页构成 / 转场是否每刀都全黑 / 新动画 / 全片逐帧扫残留。"""
import os
import re
import subprocess
import tempfile

from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

src = open('public/pv2/index.html', encoding='utf-8').read()
m = re.search(r"<script>(.*?)</script>", src, re.S)
f = os.path.join(tempfile.gettempdir(), 'pv2chk.js')
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
    pg.goto('http://127.0.0.1:8099/pv2/', wait_until='networkidle')
    pg.wait_for_function("() => !document.getElementById('play').disabled", timeout=120000)

    print('时长:', pg.evaluate('() => TOTAL'), '｜页数:', pg.evaluate('() => P.length'))
    print('页型:', pg.evaluate("""() => { const g={};
        P.forEach(x=>g[x.type]=(g[x.type]||0)+1);
        return Object.entries(g).map(([k,v])=>k+'×'+v).join('  ');}"""))
    print('动画页:', pg.evaluate("""() => P.filter(x=>x.type==='ink'&&x.ink).map(x=>x.t+'s '+x.ink)"""))

    # 每一刀是否都压到过全黑
    chk = pg.evaluate("""() => {
        const cuts = P.map(x=>x.t).filter(x=>x>0);
        const bad=[];
        for(const c of cuts){
            let peak=0;
            for(let d=0; d<0.30; d+=0.02){
                SEEK=true; render(c+d);
                peak=Math.max(peak, +getComputedStyle(document.getElementById('flip')).opacity);
            }
            if(peak < 0.99) bad.push([+c.toFixed(2), +peak.toFixed(2)]);
        }
        return bad; }""")
    print('没压到全黑的切点:', len(chk), chk[:6] if chk else '')

    # 逐帧扫：img 层在非图页时必须没有 src
    leak = pg.evaluate("""() => { const bad=[];
        for(let t=0;t<TOTAL;t+=0.05){ SEEK=true; render(t);
            const p=pageAt(t);
            const hasSrc=!!document.getElementById('imgEl').getAttribute('src');
            if(p.type!=='img' && hasSrc) bad.push(+t.toFixed(2));
            if(p.type==='img' && !hasSrc) bad.push(-t.toFixed(2));
        }
        return bad; }""")
    print('img 残留/缺失:', len(leak), leak[:6])
    tt = pg.evaluate("""() => { const o=[];
        for(let t=0;t<TOTAL;t+=0.1){ SEEK=true; render(t);
            const p=pageAt(t);
            if(+getComputedStyle(document.getElementById('title')).opacity>0.02 && p.type!=='end' && !p.titleOn)
                o.push(+t.toFixed(1)); }
        return o; }""")
    print('标题中途出现:', len(tt), '帧')

    SHOTS = [(1.4,'墨-门打开'),(3.0,'墨-走向登记处'),(15.6,'墨-翻页'),(18.3,'墨-刻编号'),
             (30.6,'影-纪录员夜墨蓝'),(38.3,'影-秦素灰'),(52.0,'墨-盖章'),
             (73.2,'墨-合上册子'),(82.4,'墨-狗接飞盘'),(79.0,'影-四人四色')]
    for at, nm in SHOTS:
        pg.evaluate(f"() => window.__seek({at})")
        pg.wait_for_timeout(140)
        pg.screenshot(path=f"{D}/R3-{nm}.png")
    print('JS 错误:', errs[:3] if errs else '无')
    b.close()

fs = [f"{D}/R3-{nm}.png" for _, nm in SHOTS]
COLS, CW, CH, PAD = 5, 300, 169, 5
rows = (len(fs) + COLS - 1) // COLS
sheet = Image.new('RGB', (COLS * (CW + PAD) + PAD, rows * (CH + 19) + PAD + 16), (16, 16, 16))
d = ImageDraw.Draw(sheet)
d.text((6, 3), 'pv2 · 无音乐 · 全黑转场 · 两套新动画', fill=(230, 226, 216))
for i, (fp, (_, nm)) in enumerate(zip(fs, SHOTS)):
    rr, cc = divmod(i, COLS)
    x, y = PAD + cc * (CW + PAD), 16 + rr * (CH + 19)
    im = Image.open(fp).convert('RGB'); im.thumbnail((CW, CH), Image.LANCZOS)
    sheet.paste(im, (x, y))
    d.text((x + 2, y + CH + 2), nm, fill=(205, 200, 190))
sheet.save(f'{D}/R3-sheet.png')
print('总览:', sheet.size)
