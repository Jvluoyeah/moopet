"""link_lab 的路径引导：把 w6 的四个 src 包挂进 sys.path。

这样测试台可以**脱离 ROS**直接跑（和 moopet_core/moopet_link 的单测同一套路数）。
"""
import os
import sys

WS = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(WS, 'src')

PACKAGES = ('moopet_core', 'moopet_link', 'moopet_hal', 'moopet_deploy')


def bootstrap():
    added = []
    for name in PACKAGES:
        p = os.path.join(SRC, name)
        if os.path.isdir(p) and p not in sys.path:
            sys.path.insert(0, p)
            added.append(name)
    return added


bootstrap()
