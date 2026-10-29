/* 全屏：大世界与对战都要能全屏
   ------------------------------------------------------------
   浏览器全屏有几个坑，这里一次处理好：
     * 不同浏览器前缀不同（标准 / webkit）
     * 全屏的是**容器元素**而不是 canvas，退出后要还原尺寸
     * 全屏切换会改变元素尺寸，必须通知渲染器 resize，否则画面被拉伸
     * 用户按 Esc 退出不走我们的按钮，所以只能监听 fullscreenchange
   */

function fsElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

export function isFullscreen() {
  return Boolean(fsElement());
}

export function isFullscreenSupported() {
  const el = document.documentElement;
  return Boolean(el.requestFullscreen || el.webkitRequestFullscreen);
}

export async function enterFullscreen(el) {
  const target = el || document.documentElement;
  const fn = target.requestFullscreen || target.webkitRequestFullscreen;
  if (!fn) return false;
  try {
    await fn.call(target, { navigationUI: 'hide' });
    return true;
  } catch (e) {
    console.warn('[fullscreen] 进入全屏失败：', e?.message || e);
    return false;
  }
}

export async function exitFullscreen() {
  const fn = document.exitFullscreen || document.webkitExitFullscreen;
  if (!fn) return false;
  try {
    await fn.call(document);
    return true;
  } catch {
    return false;
  }
}

export async function toggleFullscreen(el) {
  return isFullscreen() ? exitFullscreen() : enterFullscreen(el);
}

/** 监听全屏状态变化；返回取消订阅函数。 */
export function onFullscreenChange(cb) {
  const handler = () => cb(isFullscreen());
  document.addEventListener('fullscreenchange', handler);
  document.addEventListener('webkitfullscreenchange', handler);
  return () => {
    document.removeEventListener('fullscreenchange', handler);
    document.removeEventListener('webkitfullscreenchange', handler);
  };
}

/**
 * 给一个"游戏容器"接上全屏能力：
 *   * 按钮点击 / F 键 / 双击 都能切
 *   * 全屏变化后自动 resize（并等一帧，等布局落定）
 * 返回 { toggle, dispose }。
 */
export function attachFullscreen(container, { onResize, hotkey = 'f' } = {}) {
  const resizeSoon = () => {
    // 全屏切换后布局要一帧才稳定，直接量尺寸会拿到旧值
    requestAnimationFrame(() => requestAnimationFrame(() => onResize?.()));
  };
  const off = onFullscreenChange(() => resizeSoon());
  const onKey = (e) => {
    const key = e.key.toLowerCase();
    // Esc 退出：真实浏览器自己会处理，这里补一道兜底（无头/嵌入环境不一定）
    if (key === 'escape' && isFullscreen()) { exitFullscreen(); return; }
    if (key !== hotkey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    toggleFullscreen(container);
  };
  const onDblClick = () => toggleFullscreen(container);
  window.addEventListener('keydown', onKey);
  container.addEventListener('dblclick', onDblClick);
  window.addEventListener('resize', resizeSoon);
  return {
    toggle: () => toggleFullscreen(container),
    dispose() {
      off();
      window.removeEventListener('keydown', onKey);
      container.removeEventListener('dblclick', onDblClick);
      window.removeEventListener('resize', resizeSoon);
      if (isFullscreen()) exitFullscreen();
    },
  };
}
