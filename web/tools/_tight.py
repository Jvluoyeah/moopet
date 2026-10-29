"""① 去掉「登记处·内」那张图
   ② 整体压紧：30s → 26s。A 段从每句 4.0s 收到 3.3s，后段每句也各收 0.2~0.4s
"""
import io
import re

p = 'public/pv2/flash/index.html'
t = io.open(p, encoding='utf-8').read()
o = len(t)

i = t.index('const BEATS=[')
j = t.index('const TOTAL=')
NEW = """const BEATS=[
  /* ── A 冷：3.3 秒一句（原来 4.0，收紧） ─────────────────── */
  {t:0.0, d:3.3, cn:'在这个连呼吸都会结冰的世界。',
   en:'In a world where even breath turns to ice.',
   shots:[['img','scene/tower_out',0,3.3]]},

  {t:3.3, d:3.3, cn:'你只是个握着档案册的绝望者。',
   en:'You are just a desperate soul clutching a dossier.',
   shots:[['sil',{figs:[{src:REC,h:70,x:0}]},0,3.3]]},

  /* ── B 转折：继续加速 ─────────────────────────────────── */
  {t:6.6, d:1.4, cn:'直到，', en:'Until,',
   shots:[['img','scene/door_light',0,1.4]]},

  {t:8.0, d:2.2, cn:'你签下了那个名字。', en:'You signed that name.',
   shots:[['img','scene/desk_top',0,2.2]]},

  {t:10.2, d:2.6, cn:'唤醒了一堆残破的废铁。',
   en:'And awakened a pile of broken scrap metal.', gl:1,
   shots:[['sil',{figs:[{src:pup(CODES[3]),h:56,x:-24}]},0,0.65],
          ['sil',{figs:[{src:pup(CODES[1]),h:56,x:-8}]},0.65,0.65],
          ['sil',{figs:[{src:pup(CODES[5]),h:56,x:8}]},1.3,0.65],
          ['sil',{figs:[{src:pup(CODES[0]),h:58,x:24}]},1.95,0.65]]},

  /* ── C 快闪：全部切成 0.5 秒一刀 ───────────────────────── */
  {t:12.8, d:2.0, cn:'它为你流不出血。', en:'It cannot bleed for you.',
   shots:[['fx','hurt',0,0.5],['fx','claw',0.5,0.5],
          ['fx','eye',1.0,0.5],
          ['sil',{figs:[{src:pup(CODES[2]),h:58,x:6}]},1.5,0.5]]},

  {t:14.8, d:2.0, cn:'它为你学不会疼。', en:'It cannot feel pain for you.',
   shots:[['fx','eye',0,0.5],['fx','hurt',0.5,0.5],
          ['fx','crack',1.0,0.5],
          ['sil',{figs:[{src:REC,h:60,x:-8}]},1.5,0.5]]},

  {t:16.8, d:2.0, cn:'它只会用僵硬的金属腿，',
   en:'It only knows how to drag its stiff metal legs,',
   shots:[['fx','claw',0,0.5],
          ['sil',{figs:[{src:pup(CODES[0]),h:56,x:-20}]},0.5,0.5],
          ['fx','crack',1.0,0.5],
          ['sil',{figs:[{src:pup(CODES[3]),h:56,x:20}]},1.5,0.5]]},

  {t:18.8, d:2.2, cn:'笨拙地走向你。', en:'To clumsily walk toward you.',
   shots:[['approach',CODES[0],0,2.2]]},

  /* ── D 落点：全黑，重音砸下 ───────────────────────────── */
  {t:21.0, d:2.6, cn:'只要你还肯推开那扇门。',
   en:'As long as you still open that door.',
   shots:[['doorapproach',null,0,1.8],['black',null,1.8,0.8]]},

  {t:23.6, d:2.4, cn:'它就永远在。', en:'It will always be there.', red:1, gl:1,
   shots:[['black',null,0,1.2],
          ['sil',{figs:[{src:REC,h:58,x:-14},{src:pup(CODES[0]),h:24,x:14,dy:4}]},1.2,1.2]]},
];
"""
t = t[:i] + NEW + t[j:]
t = t.replace('const TOTAL=30.0;', 'const TOTAL=26.0;')

io.open(p, 'w', encoding='utf-8').write(t)
print('改动', len(t) - o)
print('TOTAL:', re.search(r'const TOTAL=[\d.]+', t).group(0))
print('登记处内残留:', t.count('registry_in'))
print('句数:', len(re.findall(r"\{t:[\d.]+, d:", NEW)))
# 时间连续性
rows = re.findall(r"\{t:([\d.]+), d:([\d.]+),", NEW)
prev = 0.0
bad = []
for a, b in rows:
    a, b = float(a), float(b)
    if abs(a - prev) > 0.01: bad.append((round(prev, 2), a))
    prev = a + b
print('结束:', prev, '｜接缝问题:', bad if bad else '无')
