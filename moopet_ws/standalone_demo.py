#!/usr/bin/env python3
"""养成系机械狗 · 无 ROS 独立演示（Windows / Ubuntu 均可直接跑）。

只依赖 Python 标准库，模拟 W2 全套 demo 的「感知 → 加点 → 升级 → 成就」闭环，
完全复现 start_demo.sh 的事件时间轴，可脱离 ROS2 环境演示。

用法：
  python standalone_demo.py            # 自动演示（脚本时间轴）
  python standalone_demo.py --auto     # 同上
  python standalone_demo.py --fast     # 加速（验证/演示彩排用）
  python standalone_demo.py --interactive   # 互动模式：按键触发事件养狗
  python standalone_demo.py --keep-db  # 数据落盘到 ~/.moopet/demo.db（默认临时库）
"""
import os
import random
import sys
import tempfile
import time
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                'src', 'moopet_dog'))
from moopet_dog.exp_engine import ExpEngine, SOURCES  # noqa: E402

# ---------- 控制台输出 ----------
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

os.system('')  # Windows 启用 ANSI 转义

COLOR = {'off': '\033[0m', 'bold': '\033[1m', 'dim': '\033[2m',
         'red': '\033[31m', 'green': '\033[32m', 'yellow': '\033[33m',
         'cyan': '\033[36m', 'magenta': '\033[35m'}


def c(s, *kinds):
    return ''.join(COLOR[k] for k in kinds) + str(s) + COLOR['off']


def banner(t):
    print(c('=' * 62, 'cyan'))
    print(c(t.center(62), 'cyan', 'bold'))
    print(c('=' * 62, 'cyan'))


def dog_art(level):
    if level >= 15:
        a = (r"""    (^o^)        LV.%s  我已经长大啦！汪！
    (   )(   )__
     (   )   \__ """ )
    elif level >= 8:
        a = r"""    (^_^)        LV.%s  长大中的小狗
    (   )(   )__
    """
    else:
        a = r"""    (>_<)        LV.%s  小奶狗一只，求摸头
    (   )(   )
    """
    return c(a % level, 'green')


def event(node, text, color='yellow'):
    print(c(f'  [{node:9s}] ', 'dim') + c(text, color))


def settle_print(r):
    if r is None:
        return
    if r['exp_gained'] > 0:
        line = c(f'  +{r["exp_gained"]} 经验', 'green', 'bold') + c(' | ', 'dim') + \
            c(f'LV.{r["level"]}', 'cyan')
        if r['leveled_up']:
            line += c(f'  ⬆ 升级 {r["old_level"]} → {r["level"]}！', 'magenta', 'bold')
        print(line)
        for name in r.get('unlocked', []):
            print(c(f'  ★ 成就解锁：{name}！', 'magenta', 'bold'))
    elif r.get('capped'):
        print(c(f'  - {r["source"]} 本周已达上限，本次不加点', 'red'))


# ---------- 自动演示（脚本时间轴，对齐 start_demo.sh） ----------
def run_auto(fast=False):
    gap = 0.18 if fast else 0.9
    banner('养成系机械狗 · W2 模拟感知层 独立演示（无 ROS）')
    print(c('  环境：Python 标准库 · 免安装 · 模拟数据驱动完整闭环', 'dim'))
    time.sleep(gap)

    db_path = None
    with tempfile.TemporaryDirectory() as tmp:
        eng = ExpEngine(os.path.join(tmp, 'demo.db'))

        # 启动背包节点
        banner('一、背包盒子启动（仿真感知节点）')
        for n, d in [('heartbeat', '5s 心跳'), ('audio', '语音命令'), ('vision', '表情/动作识别'),
                     ('env', '空气质量'), ('touch', '触摸分区')]:
            print(c(f'  [启动] backpack_{n}  {d}', 'green'))
            time.sleep(gap * 0.5)
        print(c('  狗本体启动：odom / exp_engine / state_mgr', 'green'))
        time.sleep(gap)

        # 事件时间轴（与 start_demo.sh 的 --demo 序列一致）
        banner('二、感知事件 → 加点 → 升级（自动回放）')

        event('audio', '完成使用指引全套流程（一次性 +100）')
        r = eng.gain('guide')
        settle_print(r)
        time.sleep(gap)

        for i in range(5):
            z = ['头部', '背部'][i % 2]
            event('touch', f'主人抚摸我的{z}（+10）')
            settle_print(eng.gain('pet', note=f'抚摸 {z}'))
            time.sleep(gap * 0.6)

        event('audio', '呼唤："我叫你你都不理我，叫我一声！"（+10）')
        settle_print(eng.gain('call', note='呼唤'))
        time.sleep(gap)

        event('vision', '识别到握手动作（+10）')
        settle_print(eng.gain('handshake', note='视觉识别握手'))
        time.sleep(gap)

        event('env', '室内空气质量变差 → 主人通风完成（+10）')
        settle_print(eng.gain('ventilate', note='通风完成'))
        time.sleep(gap)

        banner('三、外出散步（里程 10Hz · 每 50 米 +10）')
        walked = 0
        for i in range(4):
            seg = 60.0
            event('odom', f'第{i + 1}段遛狗，累计里程 {walked + seg:.0f}m')
            for rr in eng.add_walk_distance(seg):
                settle_print(rr)
            walked += seg
            time.sleep(gap * 0.7)

        banner('四、动作服务 /dog/action')
        for act in ['projector', 'communication', 'handshake']:
            event('dog', f'执行动作 {act}（+10）')
            settle_print(eng.gain(act, note=f'/dog/action {act}'))
            time.sleep(gap * 0.6)

        # 最终状态
        banner('五、狗狗状态卡')
        st = eng.get_state()
        print(c(f'  等级    : LV.{st["level"]}', 'cyan', 'bold'))
        print(c(f'  累计经验: {st["total_exp"]}', 'cyan'))
        print(c(f'  本周经验: {st["week_exp"]}/2000', 'cyan'))
        print(c(f'  连续天数: {st["streak_days"]} 天（火花 {st["streak_level"]} 档）', 'cyan'))
        print(c(f'  心情    : {st["emotion"]}', 'cyan'))
        print(dog_art(st['level']))
        banner('演示结束 · 谢谢观看')
        print(c('  提示：试试 --interactive 互动养狗', 'dim'))
        eng.close()


# ---------- 互动模式 ----------
def run_interactive():
    banner('养成系机械狗 · 互动养狗模式（无 ROS）')
    print(c('  输入数字触发事件，观察加点/升级/成就，q 退出', 'dim'))

    db_path = None
    with tempfile.TemporaryDirectory() as tmp:
        eng = ExpEngine(os.path.join(tmp, 'demo.db'))

        def show():
            st = eng.get_state()
            print(c(f'\n  LV.{st["level"]} | 总经验 {st["total_exp"]} | '
                    f'本周 {st["week_exp"]}/2000 | 心情 {st["emotion"]} | '
                    f'连续 {st["streak_days"]} 天', 'cyan', 'bold'))
            print(dog_art(st['level']))

        show()
        menu = {
            '1': ('抚摸', lambda: eng.gain('pet')),
            '2': ('握手', lambda: eng.gain('handshake')),
            '3': ('呼唤', lambda: eng.gain('call')),
            '4': ('投影', lambda: eng.gain('projector')),
            '5': ('通讯', lambda: eng.gain('communication')),
            '6': ('通风', lambda: eng.gain('ventilate')),
            '7': ('遛狗', lambda: (eng.add_walk_distance(50) or [None])[-1]),
            '8': ('使用指引', lambda: eng.gain('guide')),
            '9': ('随机摸头(发呆)', lambda: eng.gain('pet') if random.random() < 0.5 else None),
        }
        while True:
            print('\n' + '  |  '.join(f'{k}:{v[0]}' for k, v in menu.items()) + '  |  q:退出')
            try:
                key = input('>>> ').strip().lower()
            except (EOFError, KeyboardInterrupt):
                break
            if key == 'q':
                break
            if key in menu:
                settle_print(menu[key][1]())
                show()
            else:
                print(c('  未知指令', 'red'))
        eng.close()


def main():
    args = [a for a in sys.argv[1:]]
    if '--interactive' in args:
        run_interactive()
    else:
        run_auto(fast=('--fast' in args))


if __name__ == '__main__':
    main()
