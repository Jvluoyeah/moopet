#!/usr/bin/env python3
"""把"生成图片"里的散图按用途归位、改成规范文件名
   ============================================================
   出图平台（即梦）给的文件名是"jimeng-日期-序号-一大段提示词_0.png"，
   既看不出是哪个动作，也没法按帧排序。这一步做两件事：

     1) 按**时间戳序号**认人（配置里写 1343 就匹配 jimeng-…-1343-…）
     2) 复制成 pic/<中文名>/actions/<动作>_<序号>.png
        （然后是现有的 tools/slice_actions.py 去切，不重复造轮子）

   为什么用"时间戳序号"而不是看图自动分类：这个序号是出图时就定死的，
   稳定、可追溯；而自动分类（按长宽比猜跑/跳/趴）在只有二十来张图、
   而且姿势本来就是主观判断的情况下，不如我直接看一眼定下来可靠。
   影射表就是"我看过之后的结论"，改动作只要改这张表。

   配置：tools/actions/<code>.json
     { "source": "pic/萨摩耶/生成图片", "map": { "run_01": "1343", ... } }

   用法：python tools/triage_actions.py samoyed [--dry]
"""
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.normpath(os.path.join(HERE, '..'))
ROOT = os.path.normpath(os.path.join(WEB, '..', '..'))
PIC = os.path.join(ROOT, 'pic')
CONF = os.path.join(HERE, 'actions')


def main():
    code = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else 'samoyed'
    dry = '--dry' in sys.argv

    cfg_path = os.path.join(CONF, f'{code}.json')
    if not os.path.isfile(cfg_path):
        raise SystemExit(f'缺少配置：{cfg_path}')
    with open(cfg_path, encoding='utf-8') as f:
        cfg = json.load(f)

    src = os.path.join(ROOT, cfg['source'])
    if not os.path.isdir(src):
        raise SystemExit(f'找不到源目录：{src}')
    cn = cfg['cn']
    outdir = os.path.join(PIC, cn, 'actions')
    os.makedirs(outdir, exist_ok=True)

    files = [f for f in os.listdir(src) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    used = set()
    made = 0
    print(f'[{code}] {src} → {outdir}')
    for action, needle in cfg['map'].items():
        hits = [f for f in files if needle in f and f not in used]
        if not hits:
            print(f'  ! {action:14s} 找不到匹配 "{needle}" 的图')
            continue
        if len(hits) > 1:
            print(f'  ! {action:14s} 匹配到 {len(hits)} 张，取第一张')
        fn = sorted(hits)[0]
        used.add(fn)
        dst = os.path.join(outdir, f'{action}.png')
        if not dry:
            # 目标可能已存在且是只读的（手工放进去的第一张试切图就是只读），
            # 直接复制会 PermissionError——先摘掉只读位再覆盖
            if os.path.exists(dst):
                try:
                    os.chmod(dst, 0o666)
                except OSError:
                    pass
            shutil.copy2(os.path.join(src, fn), dst)
            try:
                os.chmod(dst, 0o644)
            except OSError:
                pass
        print(f'  {action:14s} ← {fn[:52]}')
        made += 1

    left = [f for f in files if f not in used]
    if left:
        print(f'  · 还有 {len(left)} 张没归位（备用/表情，先留在原处）：')
        for f in sorted(left)[:8]:
            print(f'      {f[:70]}')
    print(f'\n{"[dry] " if dry else ""}归位 {made} 张 → {outdir}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
