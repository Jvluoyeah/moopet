"""修四人剪影：给 <img> 设 background 会变成色块（剪影被压在底下看不见）。
必须用 CSS mask —— 拿立绘当遮罩，把主题色"灌"进剪影形状里。"""
import io

p = 'public/pv/index.html'
t = io.open(p, encoding='utf-8').read()
o = len(t)

old = """      const mk=(src,h,tx,ty,op)=>{
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
                                   s.dh||18, s.dx||18, s.dy||18, 1));"""

new = """      /* ⚠️ 想给剪影上主题色，**不能用 <img> + background**——
         那样只是给图片盒子刷了个底色，剪影本身还是黑的（四人那镜就是这么崩成一排黑方块的）。
         正确做法：用一个 div，**拿立绘当 mask，把颜色灌进剪影的形状里**。 */
      const mk=(src,h,tx,ty,col)=>{
        if(col){
          const d=document.createElement('div');
          d.style.cssText=`height:${h}vh;aspect-ratio:2/3;position:absolute;`
            +`translate:${tx}vw ${ty}vh;background:${col};`
            +`-webkit-mask:url("${src}") center/contain no-repeat;`
            +`mask:url("${src}") center/contain no-repeat`;
          return d;
        }
        const im=document.createElement('img'); im.src=src;
        im.style.cssText=`height:${h}vh;object-fit:contain;position:absolute;`
          +`translate:${tx}vw ${ty}vh`;
        im.style.filter=(s.fig==='--paper')?'brightness(0) invert(1)':'brightness(0)';
        return im;
      };
      const list=s.who||[];
      list.forEach((n,i)=>{
        const col=s.colors?s.colors[i]:null;
        box.appendChild(mk(`cast/${n}.png`, s.h||62, (i-(list.length-1)/2)*22, 0, col));
      });
      if(s.dog) box.appendChild(mk(`../breeds/${HERO_CODE}/forms/sit.png`,
                                   s.dh||18, s.dx||18, s.dy||18, null));"""

assert old in t, '找不到剪影那段'
t = t.replace(old, new)
io.open(p, 'w', encoding='utf-8').write(t)
print('改动', len(t) - o)
print('mask 上色:', t.count('-webkit-mask:url'))
