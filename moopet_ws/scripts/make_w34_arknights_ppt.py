#!/usr/bin/env python3
"""W3+W4 合并工作汇报 · 明日方舟风格（内容聚焦 + 真实方舟视觉语言）。

视觉规范取自 ak-ui（unofficial Arknights tokens，MIT）：
  - 配色：招牌橙 #ff5e19 / 近黑 #111315 / 青蓝 #05a7dc / 金 #ffd802 / 危险 #e33b3b / 达标 #46c47c
  - 文字：标题=Noto Serif SC（900 衬线）/ 正文=Noto Sans SC（无衬线）/ 数据=等宽
  - 图形：切角面板、左/顶强调条、等级环、信号条、角标括号、等宽 eyebrow 标签、轻网格

内容策略：每页先给一句结论（大字），再给极少支撑；居中页对比「会答题 → 懂感情」。

用法：
  python scripts/make_w34_arknights_ppt.py    # 输出 W3-W4工作汇报_李文扬_明日方舟版.pptx
"""
import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'W3-W4工作汇报_李文扬_明日方舟版.pptx')

# ---------------- 方舟 token 配色 ----------------
BG = RGBColor(0x11, 0x13, 0x15)        # 近黑底
BG2 = RGBColor(0x17, 0x19, 0x1B)       # 面板暗
PANEL = RGBColor(0x1D, 0x20, 0x23)     # 面板
PANEL2 = RGBColor(0x23, 0x27, 0x2A)    # 亮一档
GRID = RGBColor(0x1A, 0x1C, 0x1E)      # 网格线
LINE = RGBColor(0x35, 0x39, 0x3D)      # 描边
LINE_D = RGBColor(0x26, 0x29, 0x2C)
ORANGE = RGBColor(0xFF, 0x5E, 0x19)    # 招牌橙
CYAN = RGBColor(0x05, 0xA7, 0xDC)      # 青蓝
GOLD = RGBColor(0xFF, 0xD8, 0x02)      # 金(高级)
PAPER = RGBColor(0xFD, 0xFD, 0xFB)     # 硫酸纸(明)
DANGER = RGBColor(0xE3, 0x3B, 0x3B)    # 危险
OK = RGBColor(0x46, 0xC4, 0x7C)        # 达标
LOW = RGBColor(0x9C, 0x9C, 0x9C)       # 禁用/次要
TEXT = RGBColor(0xF7, 0xF7, 0xF4)      # 主文字
MUTED = RGBColor(0xB9, 0xBE, 0xC3)     # 次文字
DIM = RGBColor(0x8B, 0x91, 0x96)       # 弱文字

DISPLAY = 'Noto Serif SC'      # 标题/卡头/表头（900 衬线）
HEAVY = 'Noto Serif SC Black'  # 封面超大标题
BODY = 'Noto Sans SC'          # 正文（无衬线）
MONO = 'Consolas'              # 数据/eyebrow/页码

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]
TOTAL = 11


# ---------------- 基础 ----------------
def _set_ea(run, name=BODY):
    rPr = run._r.get_or_add_rPr()
    ea = rPr.find(qn('a:ea'))
    if ea is None:
        ea = rPr.makeelement(qn('a:ea'), {})
        rPr.append(ea)
    ea.set('typeface', name)


def _spc(run, val=150):
    rPr = run._r.get_or_add_rPr()
    rPr.set('spc', str(val))


def run_style(run, size, bold=False, color=TEXT, name=BODY, spacing=0):
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.name = name
    run.font.color.rgb = color
    _set_ea(run, name)
    if spacing:
        _spc(run, spacing)


def _has_cjk(text):
    return any('\u4e00' <= ch <= '\u9fff' or '\u3000' <= ch <= '\u303f' for ch in text)


def text_box(slide, x, y, w, h, lines, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
             space_after=4):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    for i, it in enumerate(lines):
        text, size, bold, color = it[0], it[1], it[2], it[3]
        sa = it[4] if len(it) > 4 else space_after
        sp = it[5] if len(it) > 5 else 0
        fname = it[6] if len(it) > 6 else BODY
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.space_after = Pt(sa)
        r = p.add_run()
        r.text = text
        run_style(r, size, bold, color, name=fname, spacing=sp)
    return tb


def shape(slide, shp_type, x, y, w, h, fill=None, line=None, line_w=1.0):
    shp = slide.shapes.add_shape(shp_type, Inches(x), Inches(y), Inches(w), Inches(h))
    if fill is None:
        shp.fill.background()
    else:
        shp.fill.solid()
        shp.fill.fore_color.rgb = fill
    if line is None:
        shp.line.fill.background()
    else:
        shp.line.color.rgb = line
        shp.line.width = Pt(line_w)
    shp.shadow.inherit = False
    return shp


def cut_panel(slide, x, y, w, h, fill=PANEL, line=LINE, lw=1.0):
    """方舟切角面板：右上角斜切（clip-path 呼应的 SNIP_1）。"""
    return shape(slide, MSO_SHAPE.SNIP_1_RECTANGLE, x, y, w, h, fill=fill, line=line,
                 line_w=lw)


def rect(slide, x, y, w, h, fill, line=None, lw=1.0):
    return shape(slide, MSO_SHAPE.RECTANGLE, x, y, w, h, fill=fill, line=line, line_w=lw)


def line_conn(slide, x1, y1, x2, y2, color=LINE, w=1.0):
    c = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT,
                                   Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    c.line.color.rgb = color
    c.line.width = Pt(w)
    return c


def bracket(slide, x, y, w, h, color=ORANGE, arm=0.14, lw=1.1):
    for cx, cy, dx, dy in ((x, y, 1, 1), (x + w, y, -1, 1),
                           (x, y + h, 1, -1), (x + w, y + h, -1, -1)):
        line_conn(slide, cx, cy, cx + dx * arm, cy, color, lw)
        line_conn(slide, cx, cy, cx, cy + dy * arm, color, lw)


def accent_left(slide, x, y, h, color=ORANGE, w=0.09):
    rect(slide, x, y, w, h, color)


def accent_top(slide, x, y, w, color=ORANGE, h=0.05):
    rect(slide, x, y, w, h, color)


def chip(slide, x, y, w, h, text, fill=ORANGE, color=RGBColor(0x18, 0x18, 0x18),
         tsize=11.5, bold=True, line=None, mono=True):
    shp = shape(slide, MSO_SHAPE.SNIP_1_RECTANGLE, x, y, w, h, fill=fill, line=line)
    tf = shp.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0.05)
    tf.margin_right = Inches(0.05)
    tf.margin_top = Inches(0.01)
    tf.margin_bottom = Inches(0.01)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = text
    run_style(r, tsize, bold, color, name=MONO if mono else DISPLAY, spacing=60)
    return shp


def eyebrow(slide, x, y, text, color=DIM, size=9.5, spac=200, width=4.0):
    f = MONO if not _has_cjk(text) else DISPLAY
    return text_box(slide, x, y, width, 0.28,
                    [(text.upper(), size, False, color, 0, spac, f)])


def head(slide, num, text, sub=''):
    """页眉：编号块 + 大字标题 + 副题 + 分割。"""
    line_conn(slide, 0.0, 1.02, 13.333, 1.02, LINE_D, 0.75)
    chip(slide, 0.55, 0.24, 0.66, 0.54, f'{num:02d}', fill=ORANGE,
         color=RGBColor(0x18, 0x18, 0x18), tsize=15, mono=False)
    text_box(slide, 1.4, 0.18, 10.8, 0.7, [(text, 23, True, TEXT, 0, 20, DISPLAY)])
    eyebrow(slide, 9.3, 0.30, 'MOOPET', DIM, 9.5, 260)
    if sub:
        text_box(slide, 1.4, 0.9, 11.0, 0.4, [(sub, 12, False, MUTED)])
    line_conn(slide, 1.4, 1.24, 2.4, 1.24, ORANGE, 2.0)


def foot(slide, idx):
    text_box(slide, 11.0, 7.05, 2.1, 0.26,
             [(f'{idx:02d} / {TOTAL:02d}', 10, False, DIM, 0, 120, MONO)],
             align=PP_ALIGN.RIGHT)


def grid_bg(slide):
    """近黑底 + 轻网格纹理。"""
    rect(slide, 0, 0, 13.333, 7.5, BG)
    for x in [1.6, 3.2, 4.8, 6.4, 8.0, 9.6, 11.2, 12.8]:
        line_conn(slide, x, 0.0, x, 7.5, GRID, 0.5)
    for y in [1.5, 3.0, 4.5, 6.0]:
        line_conn(slide, 0.0, y, 13.333, y, GRID, 0.5)
    line_conn(slide, 0.0, 7.30, 13.333, 7.30, ORANGE, 1.5)


def metric_ring(slide, cx, cy, d, value, unit, color=ORANGE, label=''):
    """等级环：圆环 + 中心等宽数字 + 下方单位/标签（中文走衬线，数字走等宽）。"""
    x = cx - d / 2
    shape(slide, MSO_SHAPE.OVAL, x, cy - d / 2, d, d, fill=BG2, line=color, line_w=2.5)
    text_box(slide, x, cy - d * 0.34, d, d * 0.42, [(value, int(d * 23), True, TEXT, 0, 0, MONO)],
             align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    uf = DISPLAY if _has_cjk(unit) else MONO
    text_box(slide, x, cy + d * 0.04, d, d * 0.22, [(unit, int(d * 9), False, DIM, 0, 30, uf)],
             align=PP_ALIGN.CENTER)
    if label:
        text_box(slide, x - 0.45, cy + d * 0.5 + 0.05, d + 0.9, 0.3,
                 [(label, 11, True, TEXT, 0, 40, DISPLAY)], align=PP_ALIGN.CENTER)


def add_table(slide, rows, x, y, w, h, widths, hsize=11.5, bsize=10.5):
    ts = slide.shapes.add_table(len(rows), len(rows[0]), Inches(x), Inches(y),
                                Inches(w), Inches(h))
    tb = ts.table
    for ci, wd in enumerate(widths):
        tb.columns[ci].width = Inches(wd)
    for ri, row in enumerate(rows):
        for ci, val in enumerate(row):
            cell = tb.cell(ri, ci)
            cell.fill.solid()
            cell.fill.fore_color.rgb = BG2 if ri == 0 else (PANEL if ri % 2 else PANEL2)
            cell.margin_left = Inches(0.1)
            cell.margin_right = Inches(0.06)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            p = cell.text_frame.paragraphs[0]
            r = p.add_run()
            r.text = val
            if ri == 0:
                run_style(r, hsize, True, ORANGE, name=DISPLAY, spacing=60)
            elif ci == len(row) - 1:
                run_style(r, bsize, True, OK if val != '⏳' else DANGER, name=MONO, spacing=60)
            elif ci == 0:
                run_style(r, bsize, True, TEXT, name=DISPLAY)
            else:
                run_style(r, bsize, False, MUTED, name=BODY)


# ============================================================ 1 封面
s = prs.slides.add_slide(BLANK)
grid_bg(s)
# 背景斜切质感
line_conn(s, 9.0, 0.0, 13.333, 4.4, LINE_D, 0.75)
line_conn(s, 10.6, 0.0, 13.333, 2.7, LINE_D, 0.75)
# 顶部 eyebrow
eyebrow(s, 1.2, 0.9, 'OPERATION REPORT  //  W3 + W4', DIM, 11, 280, width=8.0)
# 大标题（限宽，避免压到右侧圆环）
text_box(s, 1.2, 1.55, 7.7, 1.4, [('养成系机械狗 · 决策引擎完稿', 38, True, TEXT, 0, 12, HEAVY)])
# 副题（重点句）
text_box(s, 1.2, 3.0, 7.7, 0.6, [('从「会答题」到「懂感情」——两周，让狗会主动开口。', 18, False, ORANGE, 0, 20, DISPLAY)])
line_conn(s, 1.2, 3.85, 3.6, 3.85, LINE, 1.0)
# meta
text_box(s, 1.2, 4.1, 7.7, 1.2, [
    ('汇报人：李文扬   /   架构 · 集成', 14, False, TEXT, 4),
    ('长夜月 · 蓝思杯赛道一：灵伴管家（智能体应用）', 12.5, False, MUTED, 4),
    ('对齐排期 W3+W4 · 上周 W3 因故未汇报，本周合并汇报', 12, False, DIM, 4),
])
# 指标环（右上，与标题错开）
metric_ring(s, 10.55, 2.55, 2.0, '47/47', '单测', ORANGE, '本地全绿')
# 底部信号条 + code
rect(s, 1.2, 5.85, 4.3, 0.12, ORANGE)
rect(s, 5.55, 5.85, 1.3, 0.12, CYAN)
rect(s, 6.9, 5.85, 1.0, 0.12, GOLD)
eyebrow(s, 1.2, 6.25, 'CODE  W4/MOOPET_WS  ·  W1-W3 PRESERVED', DIM, 10, 120, width=8.0)
foot(s, 1)

# ============================================================ 2 结论先行
s = prs.slides.add_slide(BLANK)
grid_bg(s)
head(s, 2, '结论先行', '一句话：决策引擎完稿，狗会主动开口。')
# 三个指标环
mx = [3.0, 6.5, 10.0]
for cx, val, unit, color, label in zip(mx, ['5/5', '47/47', '0'], ['排期任务', '单测通过', '新增接口'],
                                       [ORANGE, CYAN, GOLD],
                                       ['两周无延期', '本地可复现', '全部复用 W1']):
    metric_ring(s, cx, 3.5, 2.4, val, unit, color, label)
# 底部一句
cut_panel(s, 0.6, 5.55, 12.1, 1.1, fill=PANEL, line=LINE)
accent_left(s, 0.6, 5.55, 1.1, ORANGE)
text_box(s, 1.0, 5.75, 11.4, 0.8, [
    ('核心事实：W3 答题闭环 + W4 性格养成（双轴四型）、情感账户、主动关怀、纪念日、成长日记、TTS 联调，全部落地。', 12.5, False, TEXT, 2),
])
foot(s, 2)

# ============================================================ 3 核心命题：会答题 → 懂感情
s = prs.slides.add_slide(BLANK)
grid_bg(s)
head(s, 3, '本周核心：从「会答题」到「懂感情」', '两周是一条成长链，主线已打通。')
# 左：W3
cut_panel(s, 0.6, 1.6, 5.35, 3.55, fill=PANEL, line=LINE)
bracket(s, 0.6, 1.6, 5.35, 3.55, ORANGE, 0.14, 1.1)
accent_top(s, 0.6, 1.6, 5.35, ORANGE)
text_box(s, 0.9, 1.8, 4.8, 0.5, [('W3  会答题', 19, True, TEXT, 0, 20, DISPLAY)])
text_box(s, 0.9, 2.45, 4.8, 2.5, [
    ('· quiz_node：出题/判题/连击/难度', 12.5, False, MUTED, 5),
    ('· 决策引擎骨架（BT 四件套 + 入口）', 12.5, False, MUTED, 5),
    ('· 16 接口 / 28 单测 / /dog/combo', 12.5, False, MUTED, 5),
    ('定位：底层能力 + 留好插口', 11.5, False, DIM, 3),
])
# 箭头
line_conn(s, 6.2, 3.35, 7.5, 3.35, ORANGE, 3.0)
shape(s, MSO_SHAPE.ISOSCELES_TRIANGLE, 7.5, 3.1, 0.42, 0.5, fill=ORANGE)
# 右：W4
cut_panel(s, 7.95, 1.6, 4.75, 3.55, fill=BG2, line=ORANGE)
bracket(s, 7.95, 1.6, 4.75, 3.55, ORANGE, 0.14, 1.1)
accent_top(s, 7.95, 1.6, 4.75, CYAN)
text_box(s, 8.25, 1.8, 4.2, 0.5, [('W4  懂感情', 19, True, TEXT, 0, 20, DISPLAY)])
text_box(s, 8.25, 2.45, 4.2, 2.5, [
    ('· 性格演化（双轴四型）', 12.5, False, MUTED, 5),
    ('· 情感账户 + 主动关怀', 12.5, False, MUTED, 5),
    ('· 早安晚安 + 纪念日 + 成长日记', 12.5, False, MUTED, 5),
    ('· TTS 双端联调（会开口）', 12.5, False, MUTED, 5),
    ('定位：情感连接层', 11.5, False, DIM, 3),
])
# 底部主线条
cut_panel(s, 0.6, 5.4, 12.1, 1.25, fill=PANEL, line=LINE_D)
eyebrow(s, 0.9, 5.52, 'MAINLINE  //  感知 → 成长 → 答题 → 情感 → 语音', DIM, 10, 80, width=8.5)
text_box(s, 0.9, 5.85, 11.4, 0.7, [
    ('排期 9.18 前的软件主线已全部打通，剩 W5-W6 的火花计划与稳定性收尾。', 12.5, False, TEXT, 2),
])
foot(s, 3)

# ============================================================ 4 W3 快速回顾
s = prs.slides.add_slide(BLANK)
grid_bg(s)
head(s, 4, 'W3 快速回顾', '上周因故未汇报，这里一页带过——W3 是为 W4 留好插口的地基。')
rows = [
    ('W3 交付', '要点', '给 W4 留了什么'),
    ('quiz_node 答题闭环', '出题/判题/连击×5+50 ×10+100/难度降档', '作答事件持续喂决策 → 性格「表达度」来源'),
    ('决策引擎骨架', 'BT 四件套（core/conditions/actions/trees）+ 入口', 'W4 只填空：真实化空条件/动作，树不动'),
    ('接口与单测', '16 接口 / 28 单测 / /dog/combo 桥接 / LV.23 1300 经验', 'W4 零新增接口，直接叠加'),
]
add_table(s, rows, 0.6, 1.6, 12.1, 3.4, [3.0, 5.2, 3.9])
cut_panel(s, 0.6, 5.5, 12.1, 1.1, fill=PANEL, line=LINE_D)
accent_left(s, 0.6, 5.5, 1.1, CYAN)
text_box(s, 1.0, 5.7, 11.4, 0.8, [
    ('一句话：W3 的骨架是「留好插口」的骨架，W4 的性格/关怀/纪念日就是插上去的模块——同构演进，零返工。', 12.5, False, TEXT, 2),
])
foot(s, 4)

# ============================================================ 5 W4① 性格演化
s = prs.slides.add_slide(BLANK)
grid_bg(s)
head(s, 5, 'W4成果① 性格演化', '四种性格，是养出来的，不是设定的。')
# 四象限
cut_panel(s, 0.6, 1.75, 5.95, 4.45, fill=PANEL, line=LINE)
bracket(s, 0.6, 1.75, 5.95, 4.45, ORANGE, 0.14, 1.1)
cx, cy = 3.57, 3.95
line_conn(s, cx, 2.05, cx, 5.9, LINE, 1.0)
line_conn(s, 1.0, cy, 6.15, cy, LINE, 1.0)
quads = [
    (1.2, 2.2, CYAN, '安静型', '高依恋 · 低表达'),
    (3.78, 2.2, ORANGE, '粘人型', '高依恋 · 高表达'),
    (1.2, 4.3, LOW, '独立型', '低依恋 · 低表达'),
    (3.78, 4.3, OK, '话痨型', '低依恋 · 高表达'),
]
for x, y, color, hname, desc in quads:
    cut_panel(s, x, y, 2.16, 1.5, fill=PANEL2, line=LINE_D)
    text_box(s, x + 0.13, y + 0.12, 1.9, 0.4, [(hname, 13.5, True, color, 0, 20, DISPLAY)])
    text_box(s, x + 0.13, y + 0.55, 1.9, 0.5, [(desc, 10, False, DIM, 2)])
text_box(s, 0.85, 1.82, 5.0, 0.3, [('依恋度  高 ↑', 10, True, CYAN, 0, 60)])
text_box(s, 3.35, 6.05, 3.0, 0.3, [('表达度  高 →', 10, True, ORANGE, 0, 60)])
# 右：机制 + 实测
cut_panel(s, 6.95, 1.75, 5.8, 2.5, fill=PANEL, line=LINE)
accent_top(s, 6.95, 1.75, 5.8, ORANGE)
text_box(s, 7.2, 1.95, 5.35, 2.2, [
    ('机制 / 计数器 + 衰减', 13, True, TEXT, 4, 0, DISPLAY),
    ('· 陪伴行为→依恋轴，说话行为→表达轴，命中该轴 +6', 11.5, False, MUTED, 3),
    ('· 每次事件双轴自然衰减 -1；闲置一天 -3', 11.5, False, MUTED, 3),
    ('· 轴分界 55：双高=粘人 / 高表达=话痨 / 高依恋=安静 / 双低=独立', 11.5, False, MUTED, 3),
])
cut_panel(s, 6.95, 4.5, 5.8, 1.7, fill=BG2, line=ORANGE)
accent_left(s, 6.95, 4.5, 1.7, ORANGE)
text_box(s, 7.2, 4.66, 5.35, 1.5, [
    ('demo 实测 / 独立 → 安静 → 粘人', 12.5, True, TEXT, 3, 0, DISPLAY),
    ('摸头×4 变安静型，再呼唤+答题变粘人型；', 11, False, MUTED, 3),
    ('变化时狗主动说「好像…我更黏主人啦，请多指教！」', 11, False, ORANGE, 2),
])
foot(s, 5)

# ============================================================ 6 W4② 情感账户 + 主动关怀
s = prs.slides.add_slide(BLANK)
grid_bg(s)
head(s, 6, 'W4成果② 情感账户 + 主动关怀', '长期忽视会伤心；它会在你沉默时主动开口。')
text_box(s, 0.7, 1.5, 6.0, 0.4, [('情感账户  0~100  /  投入越多回应越丰富', 13, True, TEXT, 0, 20, DISPLAY)])
for x, color, label in [(0.7, DANGER, '0–30 冷淡'), (2.95, CYAN, '30–70 平衡'), (5.2, OK, '70–100 依赖')]:
    shape(s, MSO_SHAPE.SNIP_1_RECTANGLE, x, 2.2, 2.2, 0.5, fill=color)
    text_box(s, x + 0.08, 2.27, 2.04, 0.36, [(label, 11, True, BG, 0, 60)], align=PP_ALIGN.CENTER)
text_box(s, 0.7, 2.9, 6.7, 1.7, [
    ('· 正向互动 +2（摸头/握手/散步/答对…），封顶 100', 11.5, False, MUTED, 3),
    ('· 闲置一天 -5；软化期（<30）不再主动搭话', 11.5, False, MUTED, 3),
    ('· 和好机制：回来多互动，账户回温', 11.5, False, MUTED, 3),
    ('（demo：2 天冷落 64→54→20 冷淡，摸头×6 回 32）', 11, False, DIM, 2),
])
cut_panel(s, 7.35, 1.5, 5.35, 0.55, fill=BG2, line=LINE_D)
text_box(s, 7.55, 1.57, 5.0, 0.4, [('主动关怀  ·  长沉默 ≥2h 触发', 13, True, ORANGE, 0, 20, DISPLAY)])
cut_panel(s, 7.35, 2.2, 5.35, 2.3, fill=PANEL, line=LINE)
text_box(s, 7.6, 2.38, 4.9, 2.0, [
    ('· 平衡：「主人好久没理我了…有点想你」', 11.5, False, TEXT, 3),
    ('· 依赖：「你去哪啦，我等你好久啦！」', 11.5, False, TEXT, 3),
    ('· 深夜 23-6：「夜深了，早点休息哦」', 11.5, False, TEXT, 3),
    ('· 冷淡期：沉默（设计行为，非缺陷）', 11.5, False, DIM, 3),
])
cut_panel(s, 0.6, 4.85, 12.1, 1.75, fill=BG2, line=ORANGE)
accent_left(s, 0.6, 4.85, 1.75, ORANGE)
text_box(s, 0.95, 5.05, 11.5, 1.4, [
    ('demo 实测  /  冷落 → 和好', 13, True, TEXT, 4, 0, DISPLAY),
    ('2 天不互动账户下滑进冷淡区（不再主动）→ 回来摸头×6 → 回到平衡。', 12.5, False, MUTED, 3),
    ('全程数值可复现、可单测（19 项 W4 单测覆盖）。', 11.5, False, DIM, 2),
])
foot(s, 6)

# ============================================================ 7 W4③ 仪式/纪念日/日记
s = prs.slides.add_slide(BLANK)
grid_bg(s)
head(s, 7, 'W4成果③ 陪伴仪式 + 成长日记', '它记得该说早安，也记得你们的日子。')
items = [
    ('早安 / 晚安', '6-9 点 / 21-23 点窗口，每天一次不重复；按当前性格说不同的话（亮点）'),
    ('等级里程碑', 'LV.10/20/…/100 升级即庆祝：「我升到 LV.10 啦！撒花庆祝！」'),
    ('自定义纪念日', "主人可登记（如「认识主人满月」），当天主动提起，每日一次"),
    ('成长日记', '按天统计互动 → 第一人称日记 → diary 表落库（一天一条，跨日自动写）'),
]
for i, (h, d) in enumerate(items):
    y = 1.55 + i * 0.76
    chip(s, 0.6, y, 2.25, 0.6, h, fill=BG2, color=ORANGE, tsize=12, mono=False, line=LINE_D)
    cut_panel(s, 3.0, y, 9.7, 0.6, fill=PANEL, line=LINE_D)
    text_box(s, 3.2, y + 0.06, 9.3, 0.5, [(d, 11.5, False, TEXT)])
cut_panel(s, 0.6, 4.85, 5.9, 1.9, fill=BG2, line=CYAN)
accent_top(s, 0.6, 4.85, 5.9, CYAN)
text_box(s, 0.85, 5.02, 5.45, 1.6, [
    ('同一句早安，四种性格四种说法', 12.5, True, TEXT, 4, 0, DISPLAY),
    ('粘人：「主人早上好呀！等你好久啦！」', 10.5, False, MUTED, 2),
    ('独立：「早啊主人，我去晒会儿太阳。」', 10.5, False, MUTED, 2),
    ('→ 「独特性格塑造」落到每一句上', 10.5, False, DIM, 2),
])
cut_panel(s, 6.85, 4.85, 5.9, 1.9, fill=PANEL, line=LINE)
text_box(s, 7.1, 5.02, 5.45, 1.6, [
    ('日记示例  /  demo 自动生成', 12.5, True, TEXT, 4, 0, DISPLAY),
    ('「2025-08-28。今天我 LV.10，心情平静，是粘人型的小狗。', 10, False, MUTED, 2),
    ('主人叫了我 1 次…迎来了升级里程碑 1 次。」', 10, False, MUTED, 2),
    ('→ 就是前端日记页要展示的数据', 10.5, False, DIM, 2),
])
foot(s, 7)

# ============================================================ 8 W4④ TTS 双端联调
s = prs.slides.add_slide(BLANK)
grid_bg(s)
head(s, 8, 'W4成果④ 双端联调', '决策出来的，真的说出口了。')
nodes = [
    (0.6, '感知 / 答题 /\n主动检查', CYAN),
    (3.5, '决策引擎\n（狗侧）反应', OK),
    (6.4, '背包 TTS\n/tts_speak', ORANGE),
    (9.3, '语音播报 🔊', GOLD),
]
y1 = 2.15
for x, txt, color in nodes:
    cut_panel(s, x, y1, 2.5, 1.5, fill=BG2, line=color)
    text_box(s, x + 0.12, y1 + 0.16, 2.26, 1.2, [(l, 10.5, False, TEXT, 2) for l in txt.split('\n')],
             align=PP_ALIGN.CENTER)
for x1, x2 in [(3.1, 3.5), (6.0, 6.4), (8.9, 9.3)]:
    line_conn(s, x1, y1 + 0.75, x2, y1 + 0.75, ORANGE, 2.0)
cut_panel(s, 6.4, y1 + 2.3, 2.5, 1.0, fill=BG2, line=CYAN)
text_box(s, 6.52, y1 + 2.42, 2.26, 0.85, [('/dog/action\n动作执行 + 加点', 10.5, False, TEXT, 2)], align=PP_ALIGN.CENTER)
line_conn(s, 4.65, y1 + 1.5, 6.4, y1 + 2.8, CYAN, 1.75)
cut_panel(s, 9.3, 4.45, 3.4, 2.2, fill=PANEL, line=LINE)
accent_top(s, 9.3, 4.45, 3.4, ORANGE)
text_box(s, 9.5, 4.61, 3.05, 1.95, [
    ('W3 只留客户端：', 11, True, TEXT, 2, 0, DISPLAY),
    ('「TTS 未就绪记日志」', 10.5, False, DIM, 3),
    ('W4 补服务端即通：', 11, True, ORANGE, 2, 0, DISPLAY),
    ('接口 0 新增，demo 模式打印 🔊 播报', 10.5, False, MUTED, 3),
])
cut_panel(s, 0.6, 6.1, 8.4, 0.95, fill=PANEL, line=LINE_D)
text_box(s, 0.85, 6.25, 8.0, 0.7, [
    ('联调口径：goal(text/rate/pitch) → feedback(progress) → result(success/duration)；', 11, False, MUTED, 2),
    ('仿真时长=字数×0.08s，接真实 TTS 只换内部实现，两端不变。', 11, False, DIM, 2),
])
foot(s, 8)

# ============================================================ 9 质量验证
s = prs.slides.add_slide(BLANK)
grid_bg(s)
head(s, 9, '质量验证', '两周成果，本地全绿；剩下 Ubuntu 跑一遍。')
cards = [
    (0.6, '单测 47/47', 'W2 8 + W3 20 + W4 19\n纯逻辑无 ROS 可复跑', OK),
    (3.75, '接口 16 项', 'W4 零新增——全复用 W1\n行为长在旧接口上', CYAN),
    (6.9, '编译检查', '10 个 Python 文件\npy_compile 全过', GOLD),
    (10.05, '演示可复现', 'standalone_demo_w4.py\n--fast 一条时间轴', ORANGE),
]
for x, h, body, color in cards:
    cut_panel(s, x, 1.6, 2.85, 0.72, fill=color)
    text_box(s, x + 0.1, 1.68, 2.65, 0.56, [(h, 13.5, True, BG, 0, 30)], align=PP_ALIGN.CENTER)
    cut_panel(s, x, 2.42, 2.85, 2.1, fill=PANEL, line=LINE)
    text_box(s, x + 0.13, 2.56, 2.59, 1.85, [(body, 10, False, MUTED, 4)], align=PP_ALIGN.CENTER)
cut_panel(s, 0.6, 4.85, 12.1, 1.0, fill=PANEL, line=LINE_D)
accent_left(s, 0.6, 4.85, 1.0, ORANGE)
text_box(s, 0.9, 4.98, 11.6, 0.8, [
    ('W4 demo 终态：LV.10 ｜ 粘人型（独立→安静→粘人完整演化）｜ 情感账户 20→32（和好实测）｜ 日记已落库', 13, True, TEXT, 3),
    ('W3 demo 终态：LV.23 / 1300 经验 / 连击 ×5 +50、×10 +100，照旧可复现。', 11.5, False, DIM, 2),
])
cut_panel(s, 0.6, 6.05, 12.1, 0.8, fill=BG2, line=DANGER)
accent_left(s, 0.6, 6.05, 0.8, DANGER)
text_box(s, 0.9, 6.18, 11.5, 0.58, [
    ('⏳ 待验证：Ubuntu 侧编译 / TTS 联调 / start_demo 全流程 / 双机联调——两周无新增接口，风险低。', 12, True, TEXT, 0),
])
foot(s, 9)

# ============================================================ 10 小组成员进展与分工
s = prs.slides.add_slide(BLANK)
grid_bg(s)
head(s, 10, '小组成员进展与分工', '本周成员在做什么（牛浩然 / 黄鑫禹）。')
members = [
    (0.6, '牛浩然', '前端 / 后端', CYAN,
     ['W3 已：答题页 + 题库/判题 API',
      'W4 本周（排期）：',
      '· 日记 API → 前端日记页',
      '· 周报 API（按周汇总互动/答题/日记）',
      '· 心情时间序列 API + 心情曲线',
      '数据：diary 表已落库、daily_stats() 现成',
      '验收：能展示「某天日记 + 心情曲线」']),
    (6.85, '黄鑫禹', '创意 / 测试', ORANGE,
     ['W3 已：语音问答链路 + 5 场景 + 连击验证',
      'W4 本周（排期）：',
      '· 角色串联演示：表情→决策→动作→TTS 走查',
      '· 手感实测：抚摸/冷落/和好/仪式的节奏',
      '· 调参建议：性格轴增益/账户速率/关怀阈值',
      '素材：性格化话术 + TTS 仿真播报 + 一键启动',
      '验收：串联无卡点 + 一份调参建议']),
]
for x, name, tag, color, lines in members:
    cut_panel(s, x, 1.55, 5.9, 4.9, fill=PANEL, line=LINE)
    bracket(s, x, 1.55, 5.9, 4.9, color, 0.14, 1.1)
    cut_panel(s, x, 1.55, 5.9, 0.62, fill=BG2, line=LINE_D)
    text_box(s, x + 0.25, 1.62, 2.6, 0.48, [(name, 15, True, TEXT, 0, 20, DISPLAY)])
    text_box(s, x + 2.95, 1.66, 2.7, 0.44, [(tag, 11, True, color, 0, 40, DISPLAY)])
    text_box(s, x + 0.25, 2.35, 5.4, 4.0, [('· ' + l, 11, False, MUTED, 3) for l in lines])
text_box(s, 0.6, 6.6, 12.1, 0.5, [
    ('协作方式不变：任务清单已单独成文（docs/任务清单_W4_*.md），含依赖、验收标准、现在就能做的第一步。', 11.5, False, DIM),
])
foot(s, 10)

# ============================================================ 11 风险 + 下一步 + 支持
s = prs.slides.add_slide(BLANK)
grid_bg(s)
head(s, 11, '风险、下一步（W5）与需要的支持')
rows = [
    ('风险 / 待办', '影响', '应对'),
    ('Ubuntu 侧编译/联调未完成', '两周成果未在 ROS 环境回归', '首要待办；无新增接口，一次编译即可验证'),
    ('性格/情感参数为初版经验值', '节奏、话术恐与理想有偏差', '黄鑫禹手感实测 → 调参建议 → 迭代'),
    ('TTS 为仿真实现', '音色/语速非最终效果', '接口已定，后续替换 edge-tts 不动两端'),
    ('前端日记页依赖联调窗口', '日记页演示或顺延', '表与统计已就绪，一次接口对齐即可开工'),
]
add_table(s, rows, 0.6, 1.55, 12.1, 2.85, [3.4, 3.9, 4.8])
cut_panel(s, 0.6, 4.6, 5.9, 2.05, fill=PANEL, line=LINE)
accent_top(s, 0.6, 4.6, 5.9, CYAN)
text_box(s, 0.85, 4.78, 5.45, 1.8, [
    ('W5 计划  /  对齐排期', 13, True, TEXT, 3, 0, DISPLAY),
    ('① 火花计划：每日任务/打卡/奖励接入决策与结算', 11.5, False, MUTED, 3),
    ('  （streak/daily_task/daily_reward 表 W1 已预置）', 10.5, False, DIM, 2),
    ('② 综合：两端功能联演 + 演示脚本定稿', 11.5, False, MUTED, 2),
])
cut_panel(s, 6.85, 4.6, 5.9, 2.05, fill=BG2, line=ORANGE)
accent_left(s, 6.85, 4.6, 2.05, ORANGE)
text_box(s, 7.1, 4.78, 5.45, 1.8, [
    ('需要的支持  /', 13, True, TEXT, 3, 0, DISPLAY),
    ('① Ubuntu + ROS2 环境完成编译/联调验证（两周共性待办）', 11.5, False, MUTED, 3),
    ('② 与牛浩然/黄鑫禹各 30min 对齐接口与联调排期', 11.5, False, MUTED, 3),
    ('③ 如需实体机演示窗口，请提前协调（W6-W7 计划内）', 11.5, False, MUTED, 3),
])
foot(s, 11)

prs.save(OUT)

# ---------------- 边界自检 ----------------
SW, SH = 13.333, 7.5
worst_r, worst_b, bad = 0.0, 0.0, []
for idx, slide in enumerate(prs.slides, 1):
    for shp in slide.shapes:
        try:
            r = (shp.left + shp.width) / 914400.0
            b = (shp.top + shp.height) / 914400.0
        except TypeError:
            continue
        worst_r, worst_b = max(worst_r, r), max(worst_b, b)
        if r > SW + 0.01 or b > SH + 0.01:
            bad.append((idx, round(r, 2), round(b, 2)))
print(f'saved: {OUT}')
print(f'bounds: max_right={worst_r:.2f}in max_bottom={worst_b:.2f}in overflows={len(bad)}')
for b in bad:
    print('  OVERFLOW:', b)
