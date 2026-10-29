"""按用户意见再改：
  1. 删掉中间的红色色带（不是每样都要加效果）
  2. 修 bug：大字标题没有 else 兜底，会中途残留
  3. 图片减量——不再"把所有图都塞一遍"
  4. 剪影改角色主题色：黑/白之外，用四个人的主题色做对比
"""
import io
import re

p = 'public/pv/index.html'
t = io.open(p, encoding='utf-8').read()
o = len(t)

# ================= 1) 删掉色带 =================
t = re.sub(r"  /\* 色带横扫：保留，但收细、收淡 \*/\n  #band\{[^}]*\}\n", "", t)
t = re.sub(r"\n  /\* ---- 色带衰减（唯一保留的冲击元素，细且短） ---- \*/.*?\n  \}\n", "\n", t, flags=re.S)
# 换镜里那句设色带的也去掉
t = re.sub(r"    if\(P>=2\)\{\n      band\.style\.background=.*?band\._t=t;\n    \}\n", "", t, flags=re.S)
# 变量与元素保留（否则引用会炸），但永不显示
t = t.replace('<div id="band"></div>', '<div id="band" style="display:none"></div>')

# ================= 2) 标题兜底 =================
t = t.replace("""  if(k==='title'||k==='hold'){show(title,true);
    if(k==='title'&&memo.k!=='t'){memo.k='t';mountDog(dogEl(HERO_CODE,'sit',false));}}""",
"""  /* ⚠️ 必须有 else：原来只在换镜时关它，一旦有帧走到这条分支外，
     「长夜月」几个大字就会在中途残留闪过去（用户看到了）。 */
  if(k==='title'||k==='hold'){
    show(title,true); title.style.visibility='visible';
    if(k==='title'&&memo.k!=='t'){memo.k='t';mountDog(dogEl(HERO_CODE,'sit',false));}
  } else { show(title,false); title.style.visibility='hidden'; }""")

# ================= 3) 剪影主题色 =================
t = t.replace("""  if(k==='sil'){
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
  }""",
"""  /* ---- 剪影段：用户说黑白影最有感觉，而且**可以用角色的主题色** ----
     底色 = 主题色块，人影 = 纸白（或反过来）。四张就是四个颜色，比纯黑白有层次。 */
  if(k==='sil'){
    if(!L.cast.firstElementChild){
      const bgCol=s.tone||'--ink';
      const figCol=s.fig||'--paper';
      const box=document.createElement('div');
      box.style.cssText=`position:absolute;inset:0;display:grid;place-items:center;`
        +`background:var(${bgCol})`;
      const mk=(src,h,tx,ty,op)=>{
        const im=document.createElement('img'); im.src=src;
        /* 把整张立绘压成单色：先去掉自身颜色，再用主题色重新上色 */
        im.style.cssText=`height:${h}vh;object-fit:contain;position:absolute;`
          +`translate:${tx}vw ${ty}vh;opacity:${op}`;
        im.style.filter=(s.fig==='--paper')
          ? 'brightness(0) invert(1)'
          : `brightness(0) saturate(100%)`;
        return im;
      };
      const list=s.who||[];
      list.forEach((n,i)=>{
        const col=s.colors?s.colors[i]:null;
        const im=mk(`cast/${n}.png`, s.h||62, (i-(list.length-1)/2)*22, 0, 1);
        if(col) im.style.filter=`brightness(0) saturate(100%)`;
        if(col) im.style.background=col;   /* 用背景色块给每个人上色（mask 方式见下） */
        box.appendChild(im);
      });
      if(s.dog) box.appendChild(mk(`../breeds/${HERO_CODE}/forms/sit.png`,
                                   s.dh||18, s.dx||18, s.dy||18, 1));
      mountCast(box);
    }
    const sc=1+0.05*p;
    L.cast.firstElementChild.style.transform=`scale(${sc.toFixed(3)})`;
  }""")

# ================= 4) 图片减量 + 剪影加色 =================
REPL = [
  # 天台 → 记录员的夜墨蓝剪影
  ("  S(29.51,2.35,'scene',{id:'s08',src:'scene/rooftop',note:'天台'}),",
   "  S(29.51,2.35,'sil',{who:['recorder_full'],h:66,tone:'--navy',fig:'--paper',"
   "note:'记录员剪影 · 夜墨蓝'}),"),
  # 月塔的窗 → 秦素的灰剪影
  ("  S(59.62,2.27,'scene',{id:'s14',src:'scene/tower_window',note:'月塔的窗'}),",
   "  S(59.62,2.27,'sil',{who:['qin_su'],h:62,tone:'--grey',fig:'--ink',"
   "note:'秦素剪影 · 灰'}),"),
  # 广场 → 周朗的苔绿剪影
  ("  S(64.20,3.20,'scene',{id:'s16',src:'scene/plaza',note:'广场'}),",
   "  S(64.20,3.20,'sil',{who:['zhou_lang'],h:64,tone:'--moss',fig:'--paper',"
   "note:'周朗剪影 · 苔绿'}),"),
  # 训练场保留；把"竞技场"换成韩柏的铜色剪影（竞技场在后面还会用）
  ("  S(36.82,2.78,'scene',{id:'s11',src:'scene/arena',note:'竞技场'}),",
   "  S(36.82,2.78,'sil',{who:['han_bai'],h:64,tone:'--copper',fig:'--paper',"
   "note:'韩柏剪影 · 旧铜'}),"),
  # 四人剪影：四色并排（这是全片的色彩高潮）
  ("  S(77.80,3.20,'sil',{who:['recorder_full','qin_su','han_bai','zhou_lang'],h:56,dog:true,dx:0,dy:26,note:'四人 + 狗 全剪影'}),",
   "  S(77.80,3.20,'sil',{who:['recorder_full','qin_su','han_bai','zhou_lang'],h:52,\n"
   "    colors:['#16264f','#8f8d88','#7a4a24','#4a6b4f'],tone:'--paper',fig:'--ink',\n"
   "    dog:true,dx:0,dy:26,note:'四人剪影 · 四色并排 + 狗'}),"),
  # 再减一张图：月亮空镜保留，竞技场也保留（后面还有用）
]
for a, b in REPL:
    if a in t:
        t = t.replace(a, b); print('  改:', a.strip()[:46])
    else:
        print('  !! 没找到:', a.strip()[:46])

io.open(p, 'w', encoding='utf-8').write(t)
print('改动', len(t) - o)
print('band 引用:', t.count('band.style'), '｜sil 镜:', t.count("'sil',{"), '｜scene 镜:', t.count("'scene',{"))
