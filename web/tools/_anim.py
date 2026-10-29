"""按用户意见重做：
  1. 转场：交叉溶解也不行 → 改成**穿过黑场**（黑闪），跟剪影的高对比是一套语言
  2. 加**真正的动画**（不是图片）：门打开 / 去月塔（视差）/ 剪影走过
  3. **黑白剪影提上来当主角**——用户说这才有感觉
"""
import io
import re

p = 'public/pv/index.html'
t = io.open(p, encoding='utf-8').read()
o = len(t)

# ============================================================
# 1) CSS：黑闪层 + 三套动画
# ============================================================
if '#dip{' not in t:
    t = t.replace("  /* 呼吸层：", """  /* ---- 转场：穿过黑场 ----
     白闪太费眼、交叉溶解又太平。跟"黑白剪影"这套语言配的，是**从黑里过**：
     切开那一瞬画面沉到全黑再浮上来，干净、有劲、绝对不刺眼。 */
  #dip{position:absolute;inset:0;z-index:14;background:#000;opacity:0;pointer-events:none}

  /* ================= 三套真动画（不是图片） ================= */
  #anim{position:absolute;inset:0;z-index:4;opacity:0;pointer-events:none;overflow:hidden}

  /* ① 门打开：门板绕铰链转开，门缝那条光先宽后涌 */
  .doorstage{position:absolute;left:50%;top:50%;translate:-50% -50%;
    width:34vh;height:62vh;perspective:1100px}
  .doorstage .jam{position:absolute;inset:0;border:2px solid rgba(245,241,232,.22);
    background:#07070a}
  .doorstage .leaf{position:absolute;inset:1.5%;background:linear-gradient(180deg,#15151a,#0b0b0e);
    transform-origin:left center;box-shadow:inset -18px 0 30px rgba(0,0,0,.7)}
  .doorstage .gap{position:absolute;left:1.5%;top:1.5%;bottom:1.5%;width:0%;
    background:linear-gradient(90deg,#fff,rgba(255,255,255,.15));
    filter:blur(1px)}
  .doorstage .ring{position:absolute;right:14%;top:48%;width:2.6vh;height:2.6vh;
    border:3px solid rgba(245,241,232,.5);border-radius:50%}
  .doorstage .pool{position:absolute;left:-40%;right:-40%;bottom:-26%;height:30%;
    background:radial-gradient(ellipse at 50% 0,rgba(255,246,228,.55),rgba(255,246,228,0) 70%)}

  /* ② 去月塔：三层剪影视差 + 塔由远及近 */
  .towerwalk{position:absolute;inset:0;background:#07070a}
  .towerwalk .far,.towerwalk .mid,.towerwalk .near{position:absolute;bottom:0;left:-60%;width:220%;
    height:46%;background-repeat:repeat-x;background-position:0 100%}
  .towerwalk .far{bottom:38%;height:30%;opacity:.4;
    background-image:linear-gradient(180deg,transparent 55%,#0f0f14 55%);
    background-size:14vw 100%}
  .towerwalk .mid{bottom:14%;height:34%;opacity:.7;
    background-image:linear-gradient(180deg,transparent 42%,#141419 42%);
    background-size:22vw 100%}
  .towerwalk .near{bottom:0;height:26%;opacity:1;
    background-image:linear-gradient(180deg,transparent 30%,#000 30%);
    background-size:36vw 100%}
  .towerwalk .tow{position:absolute;left:50%;bottom:20%;translate:-50% 0;
    width:11vh;height:58vh;background:#000;
    clip-path:polygon(50% 0,74% 9%,74% 100%,26% 100%,26% 9%)}
  .towerwalk .tow:after{content:"";position:absolute;left:50%;top:16%;translate:-50% 0;
    width:9vh;height:9vh;border:1.4vh solid #000;border-radius:50%}
  .towerwalk .twin{position:absolute;left:50%;bottom:52%;translate:-50% 0;
    width:2.4vh;height:3vh;background:#ffe6b0;filter:blur(.5px)}
  .towerwalk .mo{position:absolute;right:14%;top:12%;width:7vh;height:7vh;border-radius:50%;
    background:#f2f0ea;box-shadow:0 0 8vh 2vh rgba(242,240,234,.22)}

  /* ③ 剪影走过：人物从画外走进来，狗跟着 */
  .walkby{position:absolute;inset:0}
  .walkby img{position:absolute;bottom:16vh;object-fit:contain;
    filter:brightness(0) invert(1)}

  /* 呼吸层：""")

# HTML：黑闪 + 动画层
if 'id="dip"' not in t:
    t = t.replace('<div id="white"></div>', '<div id="white"></div>\n  <div id="dip"></div>')
if 'id="anim"' not in t:
    t = t.replace('<div id="lDog"></div>', '<div id="lDog"></div>\n  <div id="anim"></div>')

# 变量
t = t.replace("wipe=$('wipe')", "wipe=$('wipe'),dip=$('dip'),anim=$('anim')")
if "dip=$('dip')" not in t:
    t = t.replace("accent=$('accent')", "accent=$('accent'),dip=$('dip'),anim=$('anim')")

# ============================================================
# 2) JS：黑闪转场取代交叉溶解
# ============================================================
t = t.replace("""      if(bgimg.dataset.k){                       /* 上一张留在溶解层上淡出 */
        bgimg2.src=bgimg.src; bgimg2.style.opacity=1; memo.diss=t;
      }""",
"""      /* 转场＝穿过黑场（黑闪），不再交叉溶解 */
      memo.dipT=t;""")
t = t.replace("""  /* 交叉溶解：溶解层淡出（柔，不闪） */
  if(memo.diss!=null){
    const d=t-memo.diss, D=0.30;
    if(d<D) bgimg2.style.opacity=(1-d/D).toFixed(3);
    else { bgimg2.style.opacity=0; memo.diss=null; }
  }""",
"""  /* ---- 转场：穿过黑场 ----
     强度跟冲击等级挂钩：最强的拍沉到全黑 0.10s，慢段只是轻轻压一下。
     绝对不刺眼（黑闪对眼睛最友好），而且和"黑白剪影"是同一套语言。 */
  if(memo.dipT!=null){
    const d=t-memo.dipT, D=memo.dipD||0.22;
    if(d<D){
      const x=d/D, w=1-Math.abs(x*2-1);          /* 0→1→0 */
      dip.style.opacity=(w*(memo.dipA||0.85)).toFixed(3);
    } else { dip.style.opacity=0; memo.dipT=null; }
  }""")
# 在换镜块里设定黑闪强度
t = t.replace("    const P=HARD(s.t);\n    fxT=t; fxPow=P/3;",
              "    const P=HARD(s.t);\n    fxT=t; fxPow=P/3;\n"
              "    memo.dipT=t; memo.dipA=(P>=3?1:P>=2?.82:.5); memo.dipD=(P>=3?.20:.24);")

# ============================================================
# 3) 三套动画的渲染
# ============================================================
if 'function setAnim' not in t:
    t = t.replace("let memo={},lastB=null,flashT=0",
"""/* ===== 三套真动画（用 CSS/DOM 搭，不是贴图） ===== */
function setAnim(kind,p){
  if(anim.dataset.kind===kind){ animUpdate(kind,p); return; }
  anim.dataset.kind=kind; anim.innerHTML='';
  if(kind==='door'){
    anim.innerHTML=`<div class="doorstage">
      <div class="jam"></div><div class="gap"></div><div class="leaf"></div>
      <div class="ring"></div><div class="pool"></div></div>`;
  }else if(kind==='tower'){
    anim.innerHTML=`<div class="towerwalk">
      <div class="mo"></div><div class="far"></div><div class="mid"></div>
      <div class="tow"><div class="twin"></div></div><div class="near"></div></div>`;
  }else if(kind==='walkby'){
    anim.innerHTML=`<div class="walkby">
      <img src="cast/recorder_full.png" style="height:52vh;left:-30vw">
      <img src="../breeds/${HERO_CODE}/forms/sit.png" style="height:16vh;left:-20vw"></div>`;
  }
  animUpdate(kind,p);
}
function animUpdate(kind,p){
  const e=1-Math.pow(1-p,2.2);
  if(kind==='door'){
    const leaf=anim.querySelector('.leaf'), gap=anim.querySelector('.gap'),
          pool=anim.querySelector('.pool');
    const open=Math.min(1,Math.max(0,(p-0.18)/0.62));
    leaf.style.transform=`rotateY(${(-78*open).toFixed(1)}deg)`;
    gap.style.width=(2+open*92)+'%';
    gap.style.opacity=(0.25+open*0.75).toFixed(2);
    pool.style.opacity=Math.min(1,open*1.5).toFixed(2);
    pool.style.transform=`scaleX(${(0.4+open*1.1).toFixed(2)})`;
  }else if(kind==='tower'){
    const d=e*100;
    anim.querySelector('.far').style.transform=`translateX(${-d*1.6}%)`;
    anim.querySelector('.mid').style.transform=`translateX(${-d*3.4}%)`;
    anim.querySelector('.near').style.transform=`translateX(${-d*7}%)`;
    anim.querySelector('.tow').style.transform=`scale(${(0.45+e*0.75).toFixed(3)}) translateY(${(1-e)*10}%)`;
  }else if(kind==='walkby'){
    anim.querySelectorAll('img').forEach((im,i)=>{
      im.style.transform=`translateX(${e*(i?120:108)}vw) translateY(${Math.sin(p*22+i)*0.6}vh)`;
    });
  }
}
let memo={},lastB=null,flashT=0""")

# 在 render 里调动画
t = t.replace("  /* ---------- 文字三套 ---------- */",
"""  /* ---------- 动画段（不是图片） ---------- */
  if(k==='anim'){
    anim.style.opacity=1; setAnim(s.anim,p);
    accent.style.opacity=0;
  } else { anim.style.opacity=0; }

  /* ---------- 文字三套 ---------- */""")

io.open(p, 'w', encoding='utf-8').write(t)
print('改动', len(t) - o)
for k in ['#dip{', 'id="anim"', 'function setAnim', 'towerwalk', 'doorstage', 'walkby']:
    print(f'  {k:18s} {t.count(k)}')
