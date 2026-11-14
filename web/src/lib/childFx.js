/* 幼稚模式的点击反馈：一声很轻的"叮"，可在模式菜单里关掉。
   ------------------------------------------------------------
   不用音频文件：Web Audio 画两个短音就够了，省一次请求，也不依赖静态资源。
   浏览器要求音频必须由用户手势触发 —— 这里本来就挂在 pointerdown 上，
   所以在 iOS/Android 上也能出声。

   ⚠️ 只在幼稚模式且 sound 偏好为开时响；老人/标准模式完全静音。 */

import { get } from './store.js';
import { childSoundEnabled, readChildPrefs } from './uiMode.js';

let ctx = null;

function audioContext() {
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try { ctx = new Ctor(); } catch (e) { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** 播放一次两音上行的小提示音。没有 Web Audio 的环境静默跳过。 */
export function playChildClick() {
  const audio = audioContext();
  if (!audio) return;
  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(740, now);
  osc.frequency.exponentialRampToValueAtTime(1180, now + 0.07);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + 0.15);
}

/** 可点击元素的统一判定：只给"真的按到了按钮"的点击配声。 */
function clickable(target) {
  if (!target || typeof target.closest !== 'function') return null;
  return target.closest(
    '.btn, .tab, .mode-tab, .mode-option, .bottom-item, .breed-card, .quiz-opt, .lv-node');
}

/**
 * 在 document 上挂一次全局监听；返回解绑函数（测试/热更新用）。
 * 声不响只看当前模式与偏好，不缓存启动时的状态。
 */
export function installChildFeedback(doc = globalThis.document) {
  if (!doc?.addEventListener) return () => {};
  const onDown = (e) => {
    const el = clickable(e.target);
    if (!el || el.disabled || el.classList.contains('is-busy')) return;
    if (!childSoundEnabled(get().uiMode, readChildPrefs())) return;
    playChildClick();
  };
  doc.addEventListener('pointerdown', onDown, { passive: true });
  return () => doc.removeEventListener('pointerdown', onDown);
}
