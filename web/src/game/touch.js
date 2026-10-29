/* 移动端触控
   ============================================================
   设计原则：**走同一条输入路径**。
   触控层不自己造一套输入，而是往页面的 `keys` 集合里写、
   调同一个 pressSkill()。于是键盘和触摸在引擎看来完全一样，
   规则层一行都不用改，也不会出现"手机上某招放不出来"这种分叉。

   ⚠️ 最小闩锁（MIN_LATCH_MS）——这是必须的，不是保险。
      之前测出来：一次"按下立刻抬起"如果短于一帧（128Hz = 7.8ms），
      引擎根本采样不到，表现是"点一下没反应"。
      手指点屏幕通常 50~120ms，大部分时候够，但快速连点很容易踩到。
      所以触摸按下时**至少按住 MIN_LATCH_MS**，让引擎一定采得到。

   布局：
     左下  移动（左/右）+ 跳
     右下  六个招式钮（复用 HUD 那六个，位置更靠上、更大）
     安全区  用 env(safe-area-inset-*) 避开刘海/小白条
*/

const MIN_LATCH_MS = 90;

/** 是不是触屏设备。用 pointer:coarse 而不是 UA 判断 —— UA 字符串越来越不可靠 */
export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
    || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
}

/**
 * @param {object} host   往哪个元素上挂
 * @param {object} opts
 *   onKey(key, down)   按下/抬起一个"键"（和键盘的 e.key 同一套名字）
 *   onSkill(i)         放第 i 招
 *   skillCount         几个招式钮（六招制就是 6）
 *   skillKeys          钮上显示的键位标签
 */
export function createTouchPad(host, opts = {}) {
  const onKey = opts.onKey || (() => {});
  const onSkill = opts.onSkill || (() => {});
  const n = opts.skillCount || 6;
  const labels = opts.skillKeys || ['J', 'K', 'U', 'I', 'O', 'L'];

  /** 每个触摸点记一个"闩锁到期时间"，到点自动抬起 */
  const held = new Map();
  const timers = new Map();

  const press = (key, el) => {
    onKey(key, true);
    el?.classList.add('is-down');
    const t = setTimeout(() => {
      onKey(key, false);
      el?.classList.remove('is-down');
      timers.delete(key);
    }, MIN_LATCH_MS);
    // 上一根手指还没松（快速连点）就把它接上，不要两个定时器打架
    clearTimeout(timers.get(key));
    timers.set(key, t);
    held.set(key, true);
  };
  const release = (key, el) => {
    clearTimeout(timers.get(key));
    timers.delete(key);
    held.delete(key);
    onKey(key, false);
    el?.classList.remove('is-down');
  };

  const mkBtn = (label, cls, key) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `tp-btn ${cls}`;
    b.textContent = label;
    // 用 pointerdown/up 而不是 touchstart：能同时覆盖触摸、笔、鼠标，
    // 而且在桌面浏览器上也能点（方便调试和 e2e）
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      // ⚠️ setPointerCapture 会抛（比如 pointerId 不是活的指针）。
      //    不加保护的话它一抛，**整个处理函数就断了** —— press() 根本执行不到，
      //    表现是"按钮点了没反应"，而且只在控制台留一行错。
      try { b.setPointerCapture?.(e.pointerId); } catch { /* 捕不住就算了，不影响按键 */ }
      press(key, b);
    });
    const up = (e) => { e.preventDefault(); release(key, b); };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    // 上下文菜单/长按选中会打断操作
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  };

  const root = document.createElement('div');
  // ⚠️ 必须带 is-on：CSS 里 .tp 默认 display:none，只有 .tp.is-on 才显示。
  //    第一版漏了这个类 —— 按钮全在 DOM 里、数量也对（10 个），但一个都看不见。
  root.className = 'tp is-on';
  root.id = 'touch-pad';

  // ---- 左下：移动 + 跳 ----
  const padL = document.createElement('div');
  padL.className = 'tp-pad tp-left';
  padL.append(
    mkBtn('◀', 'tp-move', 'a'),
    mkBtn('▶', 'tp-move', 'd'),
    mkBtn('跳', 'tp-jump', 'w'),
  );

  // ---- 右下：六个招式 ----
  const padR = document.createElement('div');
  padR.className = 'tp-pad tp-right';
  const skillBtns = [];
  for (let i = 0; i < n; i += 1) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tp-btn tp-skill' + (i === n - 1 ? ' tp-super' : '');
    b.textContent = labels[i] || String(i + 1);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      // ⚠️ setPointerCapture 会抛（比如 pointerId 不是活的指针）。
      //    不加保护的话它一抛，**整个处理函数就断了** —— press() 根本执行不到，
      //    表现是"按钮点了没反应"，而且只在控制台留一行错。
      try { b.setPointerCapture?.(e.pointerId); } catch { /* 捕不住就算了，不影响按键 */ }
      b.classList.add('is-down');
      // 招式走 pressSkill（和键盘数字键同一个入口），闩锁由页面那边管
      onSkill(i);
    });
    const up = (e) => { e.preventDefault(); b.classList.remove('is-down'); };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    skillBtns.push(b);
    padR.appendChild(b);
  }

  // ---- 中间下：防御（拇指够得着） ----
  const guard = mkBtn('防', 'tp-guard', 'l');
  padR.appendChild(guard);

  root.append(padL, padR);
  host.appendChild(root);

  return {
    root,
    skillBtns,
    dispose() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      for (const k of held.keys()) onKey(k, false);
      held.clear();
      root.remove();
    },
  };
}

export { MIN_LATCH_MS };

/* ================= 开放世界的触控层 =================
   和对战那套不一样：大世界要的是"**按住一直走**"（四方向）+ 几个单次动作，
   不是"点一下放一招"。所以这里不做闩锁，按下发 keydown、抬起发 keyup ——
   和键盘完全一样的语义。

   ⚠️ 键名必须和 world.js 读的**一模一样**（`e.key.toLowerCase()`）：
       移动 w/a/s/d、跑 shift、跳是空格（它走"单次动作"那条路）、
       交互 e。差一个字母就是"按了没反应"，而且不报错。
   入口也刻意走**真实键盘事件**：不碰 world 的私有方法，
   键盘和触控共用一个入口，行为不会分叉。 */
function sendKey(key, down) {
  if (typeof window === 'undefined') return;
  const ev = new KeyboardEvent(down ? 'keydown' : 'keyup', {
    key, bubbles: true, cancelable: true,
  });
  window.dispatchEvent(ev);
}

export function createWorldPad(host) {
  const root = document.createElement('div');
  root.className = 'tp tp-world';
  root.id = 'world-touch';

  /** 按住类按键（w/a/s/d/shift）：按下 keydown、抬起 keyup */
  const holdBtn = (label, cls, key, parent) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `tp-btn ${cls}`;
    b.textContent = label;
    let down = false;
    const on = (e) => {
      e.preventDefault();
      if (down) return;                       // 多指/重复按下不重发
      down = true;
      b.classList.add('is-down');
      try { b.setPointerCapture?.(e.pointerId); } catch { /* 捕不住也不影响 */ }
      sendKey(key, true);
    };
    const off = (e) => {
      if (e) e.preventDefault();
      if (!down) return;
      down = false;
      b.classList.remove('is-down');
      sendKey(key, false);
    };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('lostpointercapture', off);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    parent.appendChild(b);
    return { el: b, off };
  };

  // ---- 左下：四方向（做成十字，拇指够得着）----
  const padL = document.createElement('div');
  padL.className = 'tp-pad tp-world-move';
  const holds = [];
  holds.push(holdBtn('↑', 'tp-dir tp-up', 'w', padL));
  holds.push(holdBtn('←', 'tp-dir tp-left2', 'a', padL));
  holds.push(holdBtn('→', 'tp-dir tp-right2', 'd', padL));
  holds.push(holdBtn('↓', 'tp-dir tp-down', 's', padL));

  // ---- 右下：跳 / 跑 / 交互 ----
  const padR = document.createElement('div');
  padR.className = 'tp-pad tp-world-act';
  holds.push(holdBtn('跑', 'tp-run', 'shift', padR));
  holds.push(holdBtn('交互', 'tp-action', 'e', padR));
  // 空格是**单次动作**（world.js 里 `if (k === ' ')` 走 doAction），
  // 所以只发一次 keydown，不发 keyup —— 发 keyup 反而会被当成"没按"。
  const jump = document.createElement('button');
  jump.type = 'button';
  jump.className = 'tp-btn tp-jump2';
  jump.textContent = '跳';
  jump.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    jump.classList.add('is-down');
    sendKey(' ', true);
  });
  const jup = (e) => { if (e) e.preventDefault(); jump.classList.remove('is-down'); };
  jump.addEventListener('pointerup', jup);
  jump.addEventListener('pointercancel', jup);
  jump.addEventListener('contextmenu', (e) => e.preventDefault());
  padR.appendChild(jump);

  root.append(padL, padR);
  host.appendChild(root);

  return {
    root,
    dispose() {
      for (const h of holds) h.off();
      root.remove();
    },
  };
}
