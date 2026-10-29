/* 极简 DOM 工具：够用就好，不引框架。
   之所以不用框架：这个前端 90% 是"渲染一张纸 + 几个交互"，
   引入运行时反而让牛浩然接手时要先学一套东西。 */

/**
 * 建元素：h('div', {class:'card', onclick: fn}, child1, child2)
 * 支持：属性、dataset（data-*）、style 对象、事件（on*）、文本/节点/数组子项。
 */
export function h(tag, props = null, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class' || k === 'className') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

export function append(parent, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return parent;
}

/**
 * 和原生 `Element.replaceChildren` 一样，但**先清空、再过滤着挂**。
 *
 * ⚠️ 为什么需要它：原生 `replaceChildren(null)` 会把 `null` 当成**文本**插进去，
 *    页面上就出现一个字面的 "null"。而"这一块可有可无"是很自然的写法
 *    （首页那张"最近来过"的卡就是 `visits.length ? 卡片 : null`）——
 *    一没访客，页面上就印出一个 null。
 *    `h()` 走的是 append()，本来是过滤的，所以只有**原生调用**会漏。
 *    写 `replaceChildren(box, a, b, maybeNull)` 就不会再有这个坑。
 */
export function replaceChildren(parent, ...children) {
  parent.replaceChildren();
  return append(parent, children);
}

/** SVG 元素（命名空间不同，必须单独造） */
export function s(tag, props = null, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function mount(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** 把 HTML 字符串变成节点（形象包 SVG 用） */
export function fromHTML(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** 按钮的忙碌态包装：防重复点击 + 视觉反馈 */
export async function withBusy(btn, fn) {
  if (!btn) return fn();
  if (btn.classList.contains('is-busy')) return undefined;
  const label = btn.textContent;
  btn.classList.add('is-busy');
  btn.disabled = true;
  btn.textContent = '处理中…';
  try {
    return await fn();
  } finally {
    btn.classList.remove('is-busy');
    btn.disabled = false;
    btn.textContent = label;
  }
}

export function fmtTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch {
    return iso;
  }
}
