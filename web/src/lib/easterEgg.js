/* 彩蛋：记录员留下的一盘录像带
   ============================================================
   触发方式：**连点页头那个「犬」字标 7 下**（不提示、不显眼，就是给人自己撞见的）。
   点开是一段录像 —— 用整屏的纸框盖住，按 Esc 或点右上角关掉。

   几个实现上的取舍：
   · **不预加载**：video 的 src 是点开时才写上去的。视频在外面（arrowmc），
     常驻一个 <video> 等于每次进站都去握一次手，没必要。
   · **不用 iframe、直接 <video>**：那边支持 Range（实测 206 / video/mp4），
     浏览器自己的控制条就能拖进度，比自己糊一个播放器稳。
   · **失败要有话说**：外链随时可能挂。挂了就给一句"带子受潮了"，而不是留一块黑屏。
   · 打开时锁滚动、关掉时恢复；Esc 能关（键盘用户不用去够那个小叉）。
*/
const CLICKS_NEEDED = 7;      // 七下。点三下太容易误触，点十下没人有这个耐心
const RESET_MS = 2500;        // 中间隔太久就重新数
const VIDEO_URL =
  'https://www.arrowmc.top/openlist/d/public/RELEASE1(1).mp4'
  + '?sign=v0bCNo1osJAueXRpTGYWQ5rwLVudCVR-fe5qRCuaaiA=:0';

let clickCount = 0;
let lastClick = 0;
let opened = false;

function close(overlay) {
  const v = overlay.querySelector('video');
  if (v) { try { v.pause(); } catch (e) { /* 无所谓 */ } }
  overlay.remove();
  document.documentElement.style.overflow = '';
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  opened = false;
}

function open() {
  if (opened) return;
  opened = true;
  document.documentElement.style.overflow = 'hidden';

  const video = document.createElement('video');
  video.controls = true;
  video.autoplay = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.style.cssText = 'width:100%;height:100%;display:block;background:#0c0a09;';
  video.addEventListener('error', () => {
    note.textContent = '带子受潮了 —— 这段放不出来。';
    note.style.display = '';
  });

  const note = document.createElement('div');
  note.style.cssText =
    'display:none;position:absolute;inset:0;place-items:center;color:#efe9dc;'
    + 'font-family:var(--font-serif, serif);font-size:18px;text-align:center;padding:24px;';
  note.textContent = '带子受潮了 —— 这段放不出来。';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', '关掉');
  closeBtn.style.cssText =
    'position:absolute;right:10px;top:10px;width:36px;height:36px;cursor:pointer;'
    + 'border:1.5px solid #efe9dc;background:rgba(12,10,9,.7);color:#efe9dc;'
    + 'font-size:16px;line-height:1;border-radius:2px;';
  closeBtn.onclick = () => close(overlay);

  const cap = document.createElement('div');
  cap.textContent = '记录员留下的东西 —— 别外传';
  cap.style.cssText =
    'position:absolute;left:0;right:0;bottom:10px;text-align:center;color:#efe9dc;'
    + 'font-size:12px;opacity:.7;pointer-events:none;font-family:var(--font-mono, monospace);';

  const frame = document.createElement('div');
  frame.style.cssText =
    'position:relative;width:min(96vw,1280px);height:min(86vh,720px);'
    + 'border:2px solid #efe9dc;box-shadow:0 18px 60px -20px rgba(0,0,0,.9);'
    + 'background:#0c0a09;';
  frame.append(video, note, closeBtn, cap);

  const overlay = document.createElement('div');
  overlay.id = 'easter-egg';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;'
    + 'background:rgba(8,8,10,.92);';
  overlay.appendChild(frame);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(overlay); });

  const onKey = (e) => {
    if (e.key === 'Escape') { close(overlay); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);

  document.body.appendChild(overlay);
  // src 在挂上去之后再给：这样"打开了"和"开始拉流"是同一件事
  video.src = VIDEO_URL;
  try { video.play().catch(() => { /* 自动播放被挡就让用户点 */ }); } catch (e) { /* 同上 */ }
}

/** 给一个元素装上"连点 N 下"的彩蛋。返回解绑函数（页面销毁时不用也行）。
 *
 *  ⚠️ 为什么要 `onSingle` + 延迟跳转：
 *     页头那个标是 `<a href="#/">`。**只要让第一下真的跳转，彩蛋就永远触发不了** ——
 *     页面一重载，这个模块的计数就清零了（实测：连点 7 下，每次都从 1 重新数）。
 *     所以这里一律 `preventDefault()`，把"单击该干的事"延后 260ms：
 *     期间来了第二下就取消 —— 这就是"分辨单击与连点"的常规做法，
 *     正常的"点一下回首页"照旧，只是慢了 260 毫秒。
 */
export function attachEasterEgg(el, opts = {}) {
  if (!el) return () => {};
  const onSingle = opts.onSingle || null;
  const SINGLE_DELAY_MS = 260;
  let singleTimer = null;

  const onClick = (e) => {
    e.preventDefault();                       // 绝不在这儿跳转（见上面那段）
    const now = Date.now();
    clickCount = (now - lastClick > RESET_MS) ? 1 : clickCount + 1;
    lastClick = now;
    if (singleTimer) { clearTimeout(singleTimer); singleTimer = null; }
    if (clickCount >= CLICKS_NEEDED) {
      clickCount = 0;
      /* 开完把 lastClick 也清掉：不清的话，关掉之后再连点，
         第一下会被算成"上一次连点的延续"（间隔没超过 RESET_MS），
         计数从中间某个数接着走 —— 表现就是"关掉之后有时候点不出来"。
         用户要的是"再明显一点"，那就更不能让第二次点不开。 */
      lastClick = 0;
      open();
      return;
    }
    if (onSingle) {
      singleTimer = setTimeout(() => {
        singleTimer = null;
        if (Date.now() - lastClick >= SINGLE_DELAY_MS - 20) onSingle();
      }, SINGLE_DELAY_MS);
    }
  };
  el.addEventListener('click', onClick);
  el.style.cursor = 'pointer';       // 只是让手型出现，不写任何提示
  return () => {
    if (singleTimer) clearTimeout(singleTimer);
    el.removeEventListener('click', onClick);
  };
}

export const EASTER_EGG_VIDEO = VIDEO_URL;
export const EASTER_EGG_CLICKS = CLICKS_NEEDED;
