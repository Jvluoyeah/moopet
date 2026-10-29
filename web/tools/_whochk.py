"""验收人物介绍：四个立绘位是否都显示、是否和卡片文字/歌词重叠。"""
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={'width': 1280, 'height': 720}).new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append('ERR ' + str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto('http://127.0.0.1:8099/pv2/', wait_until='networkidle')
    pg.wait_for_function("() => !document.getElementById('play').disabled", timeout=120000)

    print('四个立绘位上的人物介绍：')
    for r in pg.evaluate("""() => P.filter(x=>x.type==='cast').map(x=>{
        const at=x.t+x.l*0.75;
        SEEK=true; render(at);
        const w=document.getElementById('who'), cs=getComputedStyle(w);
        const L=document.getElementById('lyric');
        const a=w.getBoundingClientRect();
        const lb=L.querySelector('.ln').getBoundingClientRect();
        const hit=!(a.right<lb.left||lb.right<a.left||a.bottom<lb.top||lb.bottom<a.top);
        return {who:x.who, t:x.t, op:cs.opacity,
                cn:w.querySelector('.cn').textContent,
                en:w.querySelector('.en').textContent,
                line:w.querySelector('.line').textContent.slice(0,26),
                box:[Math.round(a.x),Math.round(a.y),Math.round(a.width),Math.round(a.height)],
                与歌词重叠:hit};
    })"""):
        print(f"  {r['who']:10s} @{r['t']:>5}s  op={r['op']}  "
              f"[{r['box'][0]},{r['box'][1]} {r['box'][2]}x{r['box'][3]}]")
        print(f"      {r['cn']} / {r['en']}")
        print(f"      {r['line']}…   与歌词重叠={r['与歌词重叠']}")

    for at, nm in [(24.2, '记录员'), (43.0, '秦素'), (58.0, '韩柏'), (71.0, '周朗')]:
        pg.evaluate(f"() => window.__seek({at})")
        pg.wait_for_timeout(160)
        pg.screenshot(path=f'tests/shots/W-{nm}.png')
    print('JS 错误:', errs[:3] if errs else '无')
    b.close()

fs = [f'tests/shots/W-{nm}.png' for nm in ['记录员', '秦素', '韩柏', '周朗']]
COLS, CW, CH, PAD = 2, 620, 349, 6
sheet = Image.new('RGB', (COLS * (CW + PAD) + PAD, 2 * (CH + 20) + PAD + 16), (16, 16, 16))
d = ImageDraw.Draw(sheet)
d.text((6, 3), 'pv2 · 四个立绘位的人物介绍（左上角）', fill=(230, 226, 216))
for i, (fp, nm) in enumerate(zip(fs, ['记录员', '秦素', '韩柏', '周朗'])):
    rr, cc = divmod(i, COLS)
    x, y = PAD + cc * (CW + PAD), 16 + rr * (CH + 20)
    im = Image.open(fp).convert('RGB'); im.thumbnail((CW, CH), Image.LANCZOS)
    sheet.paste(im, (x, y))
    d.text((x + 3, y + CH + 3), nm, fill=(205, 200, 190))
sheet.save('tests/shots/W-sheet.png')
print('总览:', sheet.size)
