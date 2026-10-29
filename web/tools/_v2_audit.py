"""pv2/ 验收 —— 逐帧扫全片，重点查用户报的两个 bug：
  ① 剪影和卡片配对（每个角色的颜色必须挨着他自己的卡）
  ② 地点卡和歌词错位（同一帧里两套字不能重叠）
"""
import glob
import os
import re
import subprocess
import sys
import tempfile

from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

ROOT = sys.argv[1] if len(sys.argv) > 1 else 'public/pv2'
URL = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:8099/pv2/'

src = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
m = re.search(r"<script>(.*?)</script>", src, re.S)
f = os.path.join(tempfile.gettempdir(), 'pv2chk.js')
open(f, 'w', encoding='utf-8').write(m.group(1))
r = subprocess.run(['node', '--check', f], capture_output=True, text=True)
print('node --check:', '通过' if r.returncode == 0 else '失败')
if r.returncode:
    print(r.stderr[:900]); raise SystemExit(1)

D = 'tests/shots'
os.makedirs(D, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={'width': 1280, 'height': 720}).new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append('ERR ' + str(e)))
    pg.on('console', lambda mm: errs.append(mm.text) if mm.type == 'error' else None)
    pg.goto(URL, wait_until='networkidle')
    pg.wait_for_function("() => !document.getElementById('play').disabled", timeout=60000)

    print('时长:', pg.evaluate('() => TOTAL'), '｜页数:', pg.evaluate('() => P.length'))
    print('页型:', pg.evaluate("""() => { const g={};
        P.forEach(x=>g[x.type]=(g[x.type]||0)+1);
        return Object.entries(g).map(([k,v])=>k+'×'+v).join('  ');}"""))
    print('图片页占比:', pg.evaluate(
        "() => (P.filter(x=>x.type==='img').length/P.length*100).toFixed(0)+'%'"))

    # ── bug ①：剪影与卡片配对 ──
    pair = pg.evaluate("""() => {
        const norm = s => s.replace(/_(full|bust)$/, '');      // recorder_full → recorder
        const out = [];
        P.forEach((x, i) => {
            if (x.type !== 'sil' || x.colors || (x.who || []).length > 1) return;
            const who = norm(x.who[0]);
            let back = null, backD = 0, fwd = null, fwdD = 0;
            for (let j = i - 1; j >= 0; j--) if (P[j].type === 'cast') {
                back = norm(P[j].who); backD = x.t - P[j].t; break; }
            for (let j = i + 1; j < P.length; j++) if (P[j].type === 'cast') {
                fwd = norm(P[j].who); fwdD = P[j].t - x.t; break; }
            // 取更近的那张卡，它必须是同一个人
            const useBack = back !== null && (fwd === null || backD <= fwdD);
            const nearest = useBack ? back : fwd;
            const dist = useBack ? backD : fwdD;
            out.push({at: x.t, who, nearest, dist: +dist.toFixed(2),
                      side: useBack ? '卡在后' : '卡在前',
                      ok: nearest === who});
        });
        return out; }""")
    print('\n剪影↔卡片 配对：')
    bad_pair = 0
    for q in pair:
        flag = '✅' if q['ok'] else '❌'
        if not q['ok']: bad_pair += 1
        print(f"  {flag} {q['at']:>6}s  {q['who']:10s} 最近的卡={q['nearest']:10s} "
              f"{q['side']} {q['dist']}s")
    print('  配对错误:', bad_pair, '处')

    # ── bug ②：地点卡 vs 歌词 是否重叠 ──
    ov = pg.evaluate("""() => {
        const out=[];
        for(let t=0;t<TOTAL;t+=0.1){
            SEEK=true; render(t);
            const L=document.getElementById('loco'), Y=document.getElementById('lyric');
            if(+getComputedStyle(L).opacity<0.05) continue;
            if(+getComputedStyle(Y).opacity<0.05) continue;
            const a=L.getBoundingClientRect(), b=Y.querySelector('.ln').getBoundingClientRect();
            const hit=!(a.right<b.left||b.right<a.left||a.bottom<b.top||b.bottom<a.top);
            if(hit) out.push(+t.toFixed(1));
        }
        return out; }""")
    print('\n地点卡 × 歌词 重叠帧数:', len(ov), ov[:8])

    # ── 标题残留 ──
    tt = pg.evaluate("""() => { const o=[];
        for(let t=0;t<TOTAL;t+=0.1){ SEEK=true; render(t);
            const p=pageAt(t);
            if(+getComputedStyle(document.getElementById('title')).opacity>0.02 && p.type!=='end')
                o.push(+t.toFixed(1)); }
        return o; }""")
    print('标题中途出现:', len(tt), '帧', tt[:6])

    for at, nm in [(1.6,'门打开'),(10.9,'记录员黑白'),(30.5,'记录员夜墨蓝'),
                   (38.2,'秦素灰'),(51.5,'归档处-字'),(61.5,'韩柏旧铜'),
                   (65.5,'周朗苔绿'),(79.0,'四人四色')]:
        pg.evaluate(f"() => window.__seek({at})")
        pg.wait_for_timeout(140)
        pg.screenshot(path=f"{D}/V2-{nm}.png")
    print('JS 错误:', errs[:3] if errs else '无')
    b.close()

fs = sorted(glob.glob(os.path.join(D, 'V2-*.png')))
COLS, CW, CH, PAD = 4, 320, 180, 5
rows = (len(fs)+COLS-1)//COLS
sheet = Image.new('RGB', (COLS*(CW+PAD)+PAD, rows*(CH+19)+PAD+16), (16,16,16))
d = ImageDraw.Draw(sheet)
d.text((6, 3), '长夜月 · pv2（新目录 · 重写版）', fill=(230,226,216))
for i, fp in enumerate(fs):
    rr, cc = divmod(i, COLS)
    x, y = PAD+cc*(CW+PAD), 16+rr*(CH+19)
    im = Image.open(fp).convert('RGB'); im.thumbnail((CW, CH), Image.LANCZOS)
    sheet.paste(im, (x, y))
    d.text((x+2, y+CH+2), os.path.basename(fp).replace('V2-','').replace('.png',''),
           fill=(200,195,185))
sheet.save(os.path.join(D, 'V2-sheet.png'))
print('总览:', sheet.size)
