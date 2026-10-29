"""插入动画段 + 剪影段，把"图片流水账"打破。"""
import io
import re

p = 'public/pv/index.html'
t = io.open(p, encoding='utf-8').read()
o = len(t)

# --- 加一个"剪影"镜头类型 ---
if "k==='sil'" not in t:
    t = t.replace("  /* ---------- 动画段（不是图片） ---------- */",
"""  /* ---------- 剪影段：用户说黑白影对比最有感觉，那就把它当主角 ---------- */
  if(k==='sil'){
    if(!L.cast.firstElementChild){
      const box=document.createElement('div');
      box.style.cssText='position:absolute;inset:0;display:grid;place-items:center';
      (s.who||[]).forEach((n,i)=>{
        const im=document.createElement('img');
        im.src=`cast/${n}.png`;
        im.style.cssText=`height:${s.h||62}vh;object-fit:contain;filter:brightness(0) invert(1);`
          +`position:absolute;translate:${(i-(s.who.length-1)/2)*22}vw 0`;
        box.appendChild(im);
      });
      if(s.dog){
        const d=document.createElement('img');
        d.src=`../breeds/${HERO_CODE}/forms/sit.png`;
        d.style.cssText=`height:${s.dh||20}vh;object-fit:contain;filter:brightness(0) invert(1);`
          +`position:absolute;translate:${s.dx||18}vw ${s.dy||16}vh`;
        box.appendChild(d);
      }
      mountCast(box);
    }
    const sc=1+0.05*p;
    L.cast.firstElementChild.style.transform=`scale(${sc.toFixed(3)})`;
  }

  /* ---------- 动画段（不是图片） ---------- */""")

# --- 插动画段 / 剪影段 ---
REPL = [
  # 开场：墨 → 门打开（动画）→ 登记处外
  ("  S(0.86,1.38,'scene',{id:'s00',src:'scene/park',note:'月亮空镜'}),",
   "  S(0.86,1.38,'anim',{anim:'door',note:'门打开（CSS 动画，不是图片）'}),"),
  # 世界段：把"柜台台面"换成一镜剪影（记录员）
  ("  S(9.97,2.16,'scene',{id:'s04',src:'scene/desk_top',note:'柜台台面'}),",
   "  S(9.97,2.16,'sil',{who:['recorder_full'],h:64,note:'记录员剪影'}),"),
  # 出发段：把"公园"换成去月塔的视差动画
  ("  S(31.86,2.62,'scene',{id:'s09',src:'scene/park',note:'公园'}),",
   "  S(31.86,2.62,'anim',{anim:'tower',note:'去月塔（视差动画，不是图片）'}),"),
  # 桥段：加一镜"人 + 狗"剪影走过
  ("  S(61.89,2.31,'scene',{id:'s15',src:'scene/park',note:'公园 · 空镜'}),",
   "  S(61.89,2.31,'anim',{anim:'walkby',note:'剪影走过（动画）'}),"),
  # 尾声：四人改成大剪影
  ("  S(77.80,3.20,'troupe',{note:'四人并排'}),",
   "  S(77.80,3.20,'sil',{who:['recorder_full','qin_su','han_bai','zhou_lang'],h:56,dog:true,dx:0,dy:26,note:'四人 + 狗 全剪影'}),"),
]

# 找到 troupe 那一镜的实际写法
for a, b in REPL:
    if a in t:
        t = t.replace(a, b); print('替换:', a.strip()[:52])
    else:
        # 宽松匹配
        key = re.search(r"S\([\d.]+,([\d.]+),'" + re.search(r"'(\w+)'", a).group(1) + r"'", a)
        print('  !! 没找到:', a.strip()[:52])

io.open(p, 'w', encoding='utf-8').write(t)
print('改动', len(t) - o)
print('anim 镜:', len(re.findall(r"k:'anim'|'anim',\{anim", t)) , '｜sil 镜:', t.count("'sil',{"))
