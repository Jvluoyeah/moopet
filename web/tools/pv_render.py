#!/usr/bin/env python3
"""《长夜月》开场 PV · 离线逐帧导出 → 2K / 60fps MP4
=================================================================
为什么不用录屏：录屏会掉帧、会抖。
这里用窗口自带的 __seek(t) 逐帧定位——render(t) 是纯函数
（运镜由 t 算出来、CSS 动画用负延迟对齐），所以**每一帧都是确定的**，
拼出来是帧帧精确的片子。

帧不落盘：逐帧截图直接**管道喂给 ffmpeg**。
2K/60fps 的 75 秒是 4500 帧，落盘 PNG 要 9 GB 左右，管道方式一个字节都不留。

用法
----
    python tools/pv_render.py                  # 先出前 10 秒试片（推荐先跑这个）
    python tools/pv_render.py --all            # 全片 75 秒
    python tools/pv_render.py --all --gpu      # 有 N 卡用硬件编码，快很多
    python tools/pv_render.py --w 1920 --h 1080 --fps 30    # 要小一点自己指定
    python tools/pv_render.py --keep-frames    # 想把帧留下来再加（很占盘）

先决条件：本地有个静态服务器在跑，例如
    python -m http.server 8099 --directory public
"""
import argparse
import io as _io
import os
import shutil
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

DEFAULT_URL = 'http://127.0.0.1:8099/pv2/?still=1'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default=DEFAULT_URL, help='带 ?still=1 的页面地址')
    ap.add_argument('--w', type=int, default=2560, help='宽度（默认 2K）')
    ap.add_argument('--h', type=int, default=1440, help='高度（默认 2K）')
    ap.add_argument('--fps', type=int, default=60, help='帧率（默认 60）')
    ap.add_argument('--all', action='store_true', help='渲染全片（默认只出前 10 秒试片）')
    ap.add_argument('--gpu', action='store_true', help='用 h264_nvenc 硬件编码（需要 N 卡）')
    ap.add_argument('--crf', default='15', help='画质，越小越好（libx264）')
    ap.add_argument('--bitrate', default='60M', help='硬件编码时的码率')
    ap.add_argument('--out', default=None, help='输出文件名')
    ap.add_argument('--keep-frames', action='store_true',
                    help='把帧留在 render/frames/（2K60 的 75 秒约 9 GB）')
    args = ap.parse_args()

    if not shutil.which('ffmpeg'):
        print('找不到 ffmpeg，请先装好并加进 PATH'); sys.exit(1)

    out = args.out or f'render/changyeyue_pv_{args.w}x{args.h}_{args.fps}fps.mp4'
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    frames_dir = 'render/frames'
    if args.keep_frames:
        if os.path.isdir(frames_dir):
            shutil.rmtree(frames_dir)
        os.makedirs(frames_dir, exist_ok=True)

    # ── ffmpeg：从管道读原始帧 ──
    enc = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
           '-f', 'rawvideo', '-pix_fmt', 'rgb24',
           '-s', f'{args.w}x{args.h}', '-r', str(args.fps), '-i', '-',
           '-an',
           '-c:v', 'h264_nvenc' if args.gpu else 'libx264']
    if args.gpu:
        enc += ['-preset', 'p5', '-rc', 'vbr', '-cq', '19', '-b:v', args.bitrate]
    else:
        enc += ['-preset', 'slow', '-crf', args.crf]
    enc += ['-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]
    print('编码命令：', ' '.join(enc))
    proc = subprocess.Popen(enc, stdin=subprocess.PIPE)

    t0 = time.time()
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch(args=[
                '--force-device-scale-factor=1', '--hide-scrollbars',
                '--autoplay-policy=no-user-gesture-required'])
            pg = b.new_context(viewport={'width': args.w, 'height': args.h},
                               device_scale_factor=1).new_page()
            pg.goto(args.url, wait_until='networkidle')
            pg.wait_for_function(
                "() => !document.getElementById('play').disabled", timeout=180000)
            # 隐藏播放器界面（导出成片里不该有按钮和进度条）
            pg.evaluate("""() => { for(const id of ['hud','dbg','prog']){
                const e=document.getElementById(id); if(e) e.style.display='none'; } }""")
            total = pg.evaluate('() => window.__total()')
            n_all = int(round(total * args.fps))
            n = n_all if args.all else min(n_all, 10 * args.fps)
            est = n / args.fps
            print(f'总时长 {total}s ｜ {args.w}×{args.h} @ {args.fps}fps ｜ '
                  f'本次渲染 {n} 帧（{est:.1f} 秒片子）'
                  f'{"  【全片】" if args.all else "  【试片 10 秒】"}')

            for i in range(n):
                pg.evaluate(f'() => window.__seek({i / args.fps!r})')
                # 页面里有视频（盖章那段），必须等它 seek 完再截图，
                # 否则会截到视频的上一帧——Playwright 会自动 await 这个 Promise
                pg.evaluate('() => window.__ready()')
                shot = pg.screenshot(type='png')
                if args.keep_frames:
                    with open(os.path.join(frames_dir, f'{i:05d}.png'), 'wb') as f:
                        f.write(shot)
                from PIL import Image
                im = Image.open(_io.BytesIO(shot)).convert('RGB')
                proc.stdin.write(im.tobytes())
                if i % max(1, args.fps * 5) == 0:
                    el = time.time() - t0
                    done = i / args.fps
                    eta = (el / max(done, 0.01)) * (est - done)
                    print(f'  {done:6.1f}s / {est:.0f}s   已用 {el:6.1f}s   '
                          f'预计还要 {eta:6.1f}s', flush=True)
            b.close()
    finally:
        proc.stdin.close()
        rc = proc.wait()

    if rc != 0:
        print('ffmpeg 失败，返回码', rc); sys.exit(1)
    mb = os.path.getsize(out) / 1048576
    print(f'\n完成 → {out}   {mb:.1f} MB   '
          f'{args.w}×{args.h} @ {args.fps}fps   用时 {time.time()-t0:.0f}s')
    if args.keep_frames:
        print('帧留在', frames_dir)


if __name__ == '__main__':
    main()
