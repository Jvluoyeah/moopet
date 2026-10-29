#!/usr/bin/env python3
"""用 PIL + 微软雅黑精确检测 PPT 文本框/表格单元格文字是否溢出。

原理：按 python-pptx 读出的 shape 尺寸(run 字号/加粗) + 微软雅黑字宽，
模拟自动换行后需要的行数与总高度，与 shape 高度对比。
注意：是近似（PowerPoint 行高约 1.2*字号 + 段落间距），用于抓明显的溢出。
"""
import os
import sys
from PIL import ImageFont
from pptx import Presentation
from pptx.util import Emu

PPT = r'E:\SVLearing\competition\w5\moopet_ws\W5工作汇报_李文扬.pptx'
FONT = r'C:\Windows\Fonts\msyh.ttc'
SW, SH = 13.333 * 914400, 7.5 * 914400   # 页面 EMU


def load_font(size_pt, bold):
    try:
        idx = 1 if bold else 0
        return ImageFont.truetype(FONT, max(1, int(size_pt * 4)), index=idx)
    except Exception:
        return ImageFont.truetype(FONT, max(1, int(size_pt * 4)))


def measure_lines(text, size_pt, bold, width_emu, indent_emu=0):
    """返回渲染该文本需要的总高度(EMU)与行数。width_emu 为可用宽度(EMU)。"""
    if not text:
        return 0, 0
    font = load_font(size_pt, bold)
    # 字体按 size_pt*4 缩放加载 → getlength 返回"4x px"。
    # 可用宽度(EMU) → 4x px：EMU/12700 = pt，pt*4 = 4x px
    avail = max(1, int(width_emu / 12700.0 * 4))
    lines = 0
    for raw in text.split('\n'):
        seg = raw
        if not seg:
            lines += 1
            continue
        # 逐字断行（中文按字符）
        cur = ''
        for ch in seg:
            if font.getlength(cur + ch) <= avail:
                cur += ch
            else:
                lines += 1
                cur = ch
        if cur:
            lines += 1
    line_h = size_pt * 1.25 * 12700     # EMU ≈ 字号pt*1.25*12700
    return line_h * lines, lines


def main():
    prs = Presentation(PPT)
    issues = []
    for idx, slide in enumerate(prs.slides, 1):
        for shp in slide.shapes:
            try:
                left, top, w, h = shp.left, shp.top, shp.width, shp.height
            except Exception:
                continue
            # 越界页面
            if left + w > SW + 1000 or top + h > SH + 1000:
                issues.append((idx, shp.shape_type, '越界页面',
                               f'{Emu(left+w).inches:.2f}x{Emu(top+h).inches:.2f}'))
            if not shp.has_text_frame:
                continue
            tf = shp.text_frame
            if not tf.text.strip():
                continue
            ml = tf.margin_left or 0
            mr = tf.margin_right or 0
            mt = tf.margin_top or 0
            mb = tf.margin_bottom or 0
            avail_w = w - ml - mr
            avail_h = h - mt - mb
            total_h = 0
            for p in tf.paragraphs:
                text = ''.join(r.text for r in p.runs)
                if not text:
                    total_h += 0  # 空段略
                    continue
                # 取该段最大的字号/加粗
                size = 0
                bold = False
                for r in p.runs:
                    if r.font.size:
                        size = max(size, r.font.size.pt)
                    if r.font.bold:
                        bold = True
                line_h, n = measure_lines(text, size, bold, avail_w)
                total_h += line_h
                if p.space_after:
                    total_h += p.space_after.pt * 12700
            if total_h > avail_h + 1000:
                txt = tf.text.replace('\n', ' / ')[:60]
                issues.append((idx, shp.shape_type, '文字可能溢出',
                               f'need={Emu(total_h).inches:.2f}in box={Emu(avail_h).inches:.2f}in "{txt}"'))
            # 表格单元格
            if shp.has_table:
                for ri, row in enumerate(shp.table.rows):
                    for ci, cell in enumerate(row.cells):
                        if not cell.text.strip():
                            continue
                        cw = cell.width - (cell.margin_left or 0) - (cell.margin_right or 0)
                        ch = cell.height - (cell.margin_top or 0) - (cell.margin_bottom or 0)
                        size = 0
                        bold = False
                        for p in cell.text_frame.paragraphs:
                            for r in p.runs:
                                if r.font.size:
                                    size = max(size, r.font.size.pt)
                                if r.font.bold:
                                    bold = True
                        th, n = measure_lines(cell.text, size, bold, cw)
                        # 表格行高可增长，只有远大于才报
                        if th > ch + ch + 2000:
                            issues.append((idx, 'table', f'cell({ri},{ci}) 溢出',
                                           f'need={Emu(th).inches:.2f}in row={Emu(ch).inches:.2f}in "{cell.text[:30]}"'))
    if not issues:
        print('OK: 无明显文字溢出/越界')
    else:
        for it in issues:
            print(f'  slide {it[0]} type={it[1]} issue={it[2]} :: {it[3]}')


if __name__ == '__main__':
    main()
