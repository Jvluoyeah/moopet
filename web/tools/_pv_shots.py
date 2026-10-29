"""截 PV Demo 的关键帧。render(t) 是纯函数，可以离线驱动，不用真等 52 秒。"""
import sys

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8099/pv/'
MARKS = [
    (1.0, '00-门牌'), (3.2, '01-门开'), (4.4, '02-墨落'), (5.6, '03-墨扩散'),
    (7.0, '04-册子'), (8.8, '05-字卡A'), (10.8, '06-红笔页码'), (13.9, '07-女人'),
    (16.2, '08-盖章'), (18.5, '09-老记录员'), (20.7, '10-年轻人'), (24.0, '11-八原型'),
    (25.6, '12-原型2'), (28.0, '13-选中'), (30.0, '14-项圈色'), (33.2, '15-跑动'),
    (35.8, '16-对拍'), (38.4, '17-石环'), (40.8, '18-毛线'), (45.0, '19-背影'),
    (49.5, '20-标题'),
]

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_context(viewport={'width': 1280, 'height': 720}).new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None)
    pg.goto(URL, wait_until='networkidle')
    pg.wait_for_timeout(700)
    pg.evaluate("""async () => {
        const cs=['samoyed','husky','border_collie','german_shepherd','golden','shiba','corgi','bichon'];
        const us=[];
        for(const c of cs){
            us.push(`../breeds/${c}/forms/sit.png`);
            us.push(`../breeds/${c}/forms/back_01.png`);
            for(let i=1;i<=4;i++) us.push(`../breeds/${c}/actions/run_0${i}.png`);
            us.push(`../breeds/${c}/actions/back_01.png`);
        }
        await Promise.all(us.map(u=>new Promise(r=>{const i=new Image();i.onload=r;i.onerror=r;i.src=u;})));
    }""")
    for t, name in MARKS:
        pg.evaluate(f'() => {{ playing=false; memo={{}}; render({t}); }}')
        pg.wait_for_timeout(130)
        pg.screenshot(path=f'tests/shots/PV-{name}.png')
    print('页面错误:', errs[:5] if errs else '无')
    b.close()
print('已截', len(MARKS), '帧')
