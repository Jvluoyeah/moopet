# -*- coding: utf-8 -*-
"""验"提示条不再被 HUD 压住"。

用户截图：新加的那条键位提示左边被狗头像和一条状态栏压住。
根因：`.battle-hud { position:absolute; inset:0 }` 铺满的是 **`.battle-wrap`**，
而提示条原来塞在 wrap **里面** → wrap 变高 → HUD 跟着盖到提示条上。

所以判据不能是"提示条的文字在不在"（那当然在），而是**几何**：
提示条的矩形和 HUD 里那些元素的矩形**不能相交**。
"""
import os
import sys
import time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8080'
SHOTS = 'tests/shots'
os.makedirs(SHOTS, exist_ok=True)
FAILS = []


def check(label, ok, detail=''):
    print('  %s %s%s' % ('OK  ' if ok else 'FAIL', label, ('  — ' + str(detail)) if detail else ''))
    if not ok:
        FAILS.append(label)


def overlap(a, b):
    """两个矩形是否相交（留 1px 容差）"""
    return not (a['right'] <= b['left'] + 1 or b['right'] <= a['left'] + 1
                or a['bottom'] <= b['top'] + 1 or b['bottom'] <= a['top'] + 1)


with sync_playwright() as pw:
    br = pw.chromium.launch()
    p = br.new_page(viewport={'width': 1280, 'height': 900})
    s = time.strftime('%H%M%S')
    p.goto(URL + '/#/login', wait_until='networkidle')
    p.click('#mode-switch')
    p.fill('#username', 'ov_' + s)
    p.fill('#password', 'pass1234')
    p.click('#submit')
    p.wait_for_selector('.breed-card', timeout=25000)
    p.locator('.breed-card').first.click()
    p.fill('#dog-name', '重合汪')
    p.click('#adopt-submit')
    p.wait_for_selector('text=我的机械狗', timeout=25000)

    p.goto(URL + '/#/training', wait_until='networkidle')
    p.wait_for_timeout(1400)
    p.evaluate("() => window.__training.startLevel('L1')")
    p.wait_for_timeout(1200)

    boxes = p.evaluate("""() => {
        const rect = (el) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            if (!r.width && !r.height) return null;
            return { top: r.top, bottom: r.bottom, left: r.left, right: r.right,
                     w: Math.round(r.width), h: Math.round(r.height) };
        };
        const hud = document.querySelector('#training-hud');
        const out = { hint: rect(document.querySelector('#training-hint')) };
        // HUD 里所有可见的、有尺寸的子元素都算 —— 不能只查我猜到的那两个
        out.hudBits = [];
        if (hud) {
            for (const el of hud.querySelectorAll('*')) {
                const b = rect(el);
                if (b && b.w > 8 && b.h > 8) {
                    out.hudBits.push({ cls: el.className || el.tagName,
                                       id: el.id || '', ...b });
                }
            }
        }
        return out;
    }""")

    hint = boxes.get('hint')
    check('提示条可见且有尺寸', bool(hint) and hint['h'] > 10, hint)
    if hint:
        hits = [b for b in boxes['hudBits'] if overlap(hint, b)]
        check('提示条和 HUD 的任何元素都不相交', not hits,
              '；'.join('%s%s' % (b['id'] or b['cls'], (b['top'], b['left']))
                        for b in hits[:3]) if hits else '没有相交')
        # 而且要在舞台**下面**（不是盖在舞台上）
        stage = p.evaluate("""() => {
            const r = document.querySelector('.battle-stage').getBoundingClientRect();
            return { bottom: r.bottom };
        }""")
        check('提示条在舞台下方（不侵占画面）', hint['top'] >= stage['bottom'] - 2,
              '提示 top=%d / 舞台 bottom=%d' % (hint['top'], stage['bottom']))
    p.screenshot(path=os.path.join(SHOTS, 'training-hint.png'))
    br.close()

print('\n%s' % ('全部通过 ✓' if not FAILS else '失败: %s' % FAILS))
sys.exit(1 if FAILS else 0)
