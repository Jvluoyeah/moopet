#!/usr/bin/env python3
"""验招式钮的冷却真的在动，且界面上没有底层说明。

用户报的两个问题：
  ① 截图里 "0.5" 压在 "K" 上（数字和键位字母都往中心挤）
  ② "技能倒计时不会动"

② 的根因是 unitView.cd 用了 slice(0, 4)：旧引擎 4 招没问题，
   六招制下第 5、6 个钮（O 飞弹 / L 必杀）永远拿到 undefined。
"""
import os
import sys
from datetime import datetime

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080').rstrip('/')
SHOTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')

passed = 0
failures = []


def check(label, ok, detail=''):
    global passed
    if ok:
        passed += 1
        print(f'OK    {label}' + (f'  — {detail}' if detail else ''))
    else:
        failures.append(label)
        print(f'FAIL  {label}  {detail}')


READ = """() => [...document.querySelectorAll('#dojo-hud .bh-skill')].map(b => ({
    k: b.querySelector('.bh-skill-k').textContent,
    cd: b.querySelector('.bh-cd').textContent,
    cooling: b.classList.contains('is-cooling'),
    frac: b.style.getPropertyValue('--cd'),
}))"""


def main():
    stamp = datetime.now().strftime('%H%M%S')
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_context(viewport={'width': 1440, 'height': 950}).new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        pg.on('console', lambda m: errs.append(m.type + ': ' + m.text[:160])
               if m.type == 'error' else None)

        pg.goto(BASE + '/#/login', wait_until='networkidle')
        pg.click('#mode-switch')
        pg.fill('#username', 'cd_' + stamp)
        pg.fill('#password', 'pass1234')
        pg.click('#submit')
        pg.wait_for_selector('.breed-card', timeout=25000)
        pg.locator('.breed-card').first.click()
        pg.fill('#dog-name', '冷却汪')
        pg.click('#adopt-submit')
        pg.wait_for_selector('text=我的机械狗', timeout=25000)

        pg.goto(BASE + '/#/dojo', wait_until='networkidle')
        pg.wait_for_selector('#dojo-stage canvas', timeout=25000)
        pg.wait_for_timeout(3000)

        # 放一招带冷却的（U = 突进，cd 4.2 秒），看它是不是真的在倒数
        pg.keyboard.press('3')
        pg.wait_for_timeout(260)
        a = pg.evaluate(READ)
        pg.wait_for_timeout(900)
        c = pg.evaluate(READ)
        print('  放招后 :', [(x['k'], x['cd'], x['frac']) for x in a])
        print('  0.9 秒后:', [(x['k'], x['cd'], x['frac']) for x in c])

        # 找出哪个钮在冷却
        idx = [i for i, x in enumerate(a) if x['cooling']]
        check('放招后有钮进入冷却', len(idx) >= 1,
              str([a[i]['k'] for i in idx]) if idx else '一个都没冷却')

        if idx:
            i = idx[0]
            check('冷却秒数会**往下走**（不是卡住）',
                  a[i]['cd'] != c[i]['cd'] and float(c[i]['cd'] or 0) < float(a[i]['cd'] or 0),
                  f"{a[i]['k']}: {a[i]['cd']} → {c[i]['cd']}")
            check('冷却环的 --cd 比例也在往下走',
                  float(c[i]['frac'] or 0) < float(a[i]['frac'] or 0),
                  f"{a[i]['frac']} → {c[i]['frac']}")

        # 六招都要有冷却通道（O / L 原来是死的）
        check('六个钮都有键位', [x['k'] for x in a] == ['J', 'K', 'U', 'I', 'O', 'L'],
              ''.join(x['k'] for x in a))
        cdlen = pg.evaluate(
            "() => window.__dojo.st.units[0].cd ? window.__dojo.st.units[0].cd.length : -1")
        check('引擎给的冷却数组是 6 个（不是 4 个）', cdlen == 6, f'长度 {cdlen}')

        # 全放一遍，确认每个钮都能进冷却（含 O 飞弹）
        pg.evaluate("""() => {
            const f = window.__dojo.st.units[0];
            // 强制把 6 招的冷却都点着，看钮会不会都亮冷却环
            for (let i = 0; i < 6; i += 1) f.cooldowns[i] = 120;
        }""")
        pg.wait_for_timeout(400)
        d = pg.evaluate(READ)
        cooling = [x['k'] for x in d if x['cooling']]
        check('六招全在冷却时，六个钮都显示冷却环', len(cooling) == 6,
              ''.join(cooling))

        # 界面上不该出现底层说明
        body = pg.evaluate("() => document.body.innerText")
        bad = [w for w in ('定点', '128Hz', '锁步', 'simAB', 'sim.js', '引擎') if w in body]
        check('对战界面上没有底层说明', not bad, f'残留：{bad}' if bad else '干净')

        pg.screenshot(path=os.path.join(SHOTS, '96-dojo-hud.png'), full_page=True)
        check('全程没有 console 报错', not errs, str(errs[:2]))
        b.close()

    print(f'\n{passed}/{passed + len(failures)} 项检查通过')
    if failures:
        print('问题：')
        for f in failures:
            print('  - ' + f)
        sys.exit(1)
    print('冷却与文案验收通过 ✅')
    return 0


if __name__ == '__main__':
    sys.exit(main())
