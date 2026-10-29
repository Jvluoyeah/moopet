"""最后一刀：删净色带代码 + 广场改周朗苔绿剪影。"""
import io

p = 'public/pv/index.html'
t = io.open(p, encoding='utf-8').read()
o = len(t)

# 旧的色带触发（换镜里）
dead1 = """    band.style.background=col; band.style.top='46%';
    band.style.height='0px'; band.style.opacity=1; band._t=t;
"""
if dead1 in t:
    t = t.replace(dead1, ""); print('删掉色带触发')

# 旧的色带衰减
dead2 = """  if(band._t!=null){const d=t-band._t;
    if(d<0.30){ band.style.height=Math.round(6+ (1-d/0.30)*0 )+'vh'; band.style.opacity=1-Math.abs(d/0.30-0.5)*1.4; }
    else band.style.opacity=0;
  }
"""
if dead2 in t:
    t = t.replace(dead2, ""); print('删掉色带衰减')

# 广场 → 周朗苔绿剪影（上次因为多了个 loc 字段没匹配上）
a = "  S(64.20,3.20,'scene',{id:'s16',src:'scene/plaza',loc:['广场','THE PLAZA'],note:'广场'}),"
b = ("  S(64.20,3.20,'sil',{who:['zhou_lang'],h:64,tone:'--moss',fig:'--paper',"
     "note:'周朗剪影 · 苔绿'}),")
if a in t:
    t = t.replace(a, b); print('广场 → 周朗苔绿剪影')

io.open(p, 'w', encoding='utf-8').write(t)
print('改动', len(t) - o)
import re
left = [l.strip() for l in t.split('\n') if 'band.' in l]
print('残留 band. 代码:', left if left else '无')
print('sil 镜:', t.count("'sil',{"), '｜scene 镜:', t.count("'scene',{"))
