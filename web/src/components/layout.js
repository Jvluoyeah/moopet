/* 档案册布局：顶栏 + 册页目录 + 纸页 + 便签栏 */

import { h } from '../lib/dom.js';
import { go } from '../lib/router.js';
import {
  get, toggleTheme, setUiMode, breedOf, setUiScale, setChildPref,
} from '../lib/store.js';
import {
  UI_MODES, UI_SCALES, navCopyFor, galCopyFor, bottomNavFor,
} from '../lib/uiMode.js';
import { requireParent, lockParent } from '../lib/parentGate.js';
import { api, logout } from '../lib/api.js';
import { dogPortrait, textNode, confirmDialog } from './ui.js';
// 彩蛋：连点页头的「犬」字标 7 下 → 开一段录像（见文件里的说明）
import { attachEasterEgg } from '../lib/easterEgg.js';
import { tierOf } from '../lib/breedArt.js';

/** 剧情模式（gal）的入口地址。
 *  它是**独立应用**（Vite/WebGL，284 MB 资源），由服务端反向代理挂在 /gal/ 下 ——
 *  所以这里必须是**整页跳转**的真实路径，不能写成 `#/xxx` 那种 hash 路由。
 *  服务端那侧见 `server/app/factory.py` 的 `_mount_gal_proxy`。 */
export const GAL_HREF = '/gal/web/index.html';

/* 目录。七项的名字和小说版**逐字一致**（小说序章里那本空册子的页脚目录：
   【总览】【开放世界】【竞技场】【训练记录】【狗狗档案】【排行榜】），
   所以 label 不能动。
   右边的 hint 是窄栏里的一行注脚 —— 按小说那版的口吻写成"册页上的小字"，
   不再是"状态 / 广场 / 对战"这种功能标签。
   `short` 是**顶栏**用的短名：顶栏在手机上只有一行，放不下全称
   （"开放世界"会折成两行、"狗狗档案"会挤掉别人）。 */
const PAGES = [
  { path: '/', label: '总览', hint: '封面', short: '首页' },
  { path: '/world', label: '开放世界', hint: '月下', short: '世界' },
  { path: '/arena', label: '竞技场', hint: '对拍', short: '竞技场' },
  { path: '/training', label: '训练记录', hint: '四关', short: '关卡' },
  { path: '/dojo', label: '训练场', hint: '免伤', short: '训练场' },
  { path: '/card', label: '狗狗档案', hint: '骑缝章', short: '档案' },
  // 月塔端口：盖章 / 摸签 / 册子上的日记（世界里那个端口进来也是这一页）
  { path: '/tower', label: '月塔端口', hint: '盖章', short: '端口' },
  // 月塔问询：出题。答对给经验，智力越高等提示越短（世界里那台终端也能进）
  { path: '/quiz', label: '月塔问询', hint: '出题', short: '问询' },
  // 同问：同一道题，两个人同时答，看谁快（提醒入口在问询页顶上）
  { path: '/duel', label: '好友同问', hint: '抢答', short: '同问' },
  { path: '/leaderboard', label: '排行榜', hint: '三榜', short: '排行' },
];

/** 老人模式的字号档：只在老人档显示，点一下在默认/特大之间切换。 */
function scaleOption(st) {
  const cur = UI_SCALES.find((s) => s.id === st.uiScale) || UI_SCALES[0];
  return h('button', {
    type: 'button', class: 'mode-option mode-option-extra', id: 'mode-scale-option',
    onclick: () => setUiScale(cur.id === 'large' ? 'normal' : 'large'),
  },
    h('strong', null, `字号：${cur.label}`),
    h('span', { class: 'mode-option-desc' },
      cur.id === 'large' ? '已经是特大字，点一下恢复默认大字。' : '点一下再大一号。'));
}

function prefSwitch(label, checked, onChange) {
  return h('label', { class: 'mode-pref' },
    h('input', {
      type: 'checkbox', checked: checked ? '' : null,
      onchange: (e) => onChange(e.target.checked),
    }),
    h('span', null, label));
}

/** 幼稚模式的两项反馈开关：点击音效、按钮动画。 */
function childPrefsBlock(st) {
  const p = st.childPrefs || {};
  return h('div', { class: 'mode-prefs', id: 'child-prefs' },
    h('div', { class: 'mode-prefs-title' }, '幼稚模式反馈'),
    prefSwitch('点击音效', p.sound, (v) => setChildPref('sound', v)),
    prefSwitch('按钮动画', p.motion, (v) => setChildPref('motion', v)),
    h('div', { class: 'mode-option-desc' }, '都可以随时关掉。'));
}

/** 顶栏的界面模式菜单。
 *  用 <details> 而不是 <select>：收起时只占两个字的位置（手机上顶栏很挤），
 *  展开后能在同一处看到三档的用途。选项只影响本机显示，见 lib/uiMode.js。 */
function uiModeMenu(st) {
  const current = UI_MODES.find((m) => m.id === st.uiMode) || UI_MODES[0];
  const details = h('details', { class: 'mode-menu', id: 'ui-mode-menu' },
    h('summary', {
      class: 'btn btn-ghost btn-sm mode-menu-btn',
      title: `界面模式：${current.label}（点这里换）`,
      'aria-label': `界面模式：${current.label}，点击切换`,
    },
      h('span', null, current.short),
      h('span', { class: 'mode-menu-caret', 'aria-hidden': 'true' }, '▾')),
    h('div', { class: 'mode-menu-panel', role: 'menu' },
      ...UI_MODES.map((m) => h('button', {
        type: 'button',
        class: 'mode-option' + (m.id === current.id ? ' is-current' : ''),
        role: 'menuitemradio',
        'aria-checked': m.id === current.id ? 'true' : 'false',
        onclick: async () => {
          /* 从幼稚模式离开 = 退出儿童区，要家长确认。
             从标准/老人进幼稚模式不拦（这是家长自己设置的方向）。 */
          if (current.id === 'child' && m.id !== 'child') {
            const ok = await requireParent('离开幼稚模式');
            if (!ok) return;
          }
          details.open = false;
          setUiMode(m.id);
          /* 离开儿童区就收回家长会话；下次再想离开要重新输密码。
             进入儿童区也清一次，避免上一次留下的解锁状态被沿用到新的儿童会话。 */
          if (m.id === 'child' || current.id === 'child') lockParent();
        },
      },
        h('strong', null, m.label),
        h('span', { class: 'mode-option-desc' }, m.desc))),
      current.id === 'elder' ? scaleOption(st) : null,
      current.id === 'child' ? childPrefsBlock(st) : null));
  return details;
}

/** 幼稚模式顶部那只明确的家长入口。它不放在儿童可点的底部导航里。 */
function parentEntry() {
  return h('button', {
    class: 'btn btn-ghost btn-sm parent-entry', id: 'parent-entry',
    title: '家长入口：需要 4 位家长密码',
    onclick: async () => {
      const ok = await requireParent('打开家长设置');
      if (ok) go('/account');
    },
  },
    h('span', { class: 'parent-entry-long' }, '家长入口'),
    h('span', { class: 'parent-entry-short' }, '家长'));
}

/** 顶栏。`current` 是当前路径 —— 用来把对应那一项标成选中态。
 *  ⚠️ 必须显式声明这个参数：我改导航时直接引用了没声明的 `current`，
 *     那就是 `stage.js` 里 `opts is not defined` 的同一类错（一渲染就抛）。
 *     调用方在 main.js 的 renderTopbar() 里传 router.currentRoute()。 */
export function topbar(current = '/') {
  const st = get();
  const gal = galCopyFor(st.uiMode);
  const childMode = st.uiMode === 'child';
  /* ★ 彩蛋挂在这个「犬」字标上：连点 7 下开一段录像（见 lib/easterEgg.js）。
     老人/幼稚模式**不挂**：老人档要少手势，幼稚档不该有离开站点的隐藏入口。
     这两个档里它就是一个普通回首页链接。
     ⚠️ 它是个 <a href="#/">，连点会一直跳首页 —— 钩子里从第二下起
        preventDefault，单击照常回首页。
     ⚠️⚠️ 先把元素建出来再挂：`attachEasterEgg(el)` 返回的是**解绑函数**，
        直接把它当子节点塞进去的话，那个标根本渲染不出来
        （我第一版就是这么写的，e2e 报"等不到 #brand-mark"）。 */
  const easterEgg = st.uiMode === 'standard';
  const brandMark = h('span', {
    class: 'brand-mark', id: 'brand-mark',
    title: easterEgg
      ? '连按七下 —— 里面藏着一段录像。'
      : '回首页',
  }, '犬');
  // 单击该干的事（回首页）交给钩子延后执行；连点才开彩蛋。见 lib/easterEgg.js。
  if (easterEgg) attachEasterEgg(brandMark, { onSingle: () => go('/') });

  return h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#/' },
      brandMark,
      h('span', null,
        h('div', null, '长夜月 · 机械狗'),
        h('div', { class: 'brand-small' }, 'MOOPET DOSSIER'))),
    h('div', { class: 'spacer' }),
    /* ★ 顶栏导航**从 PAGES 生成**，不能再手写几项。
       ⚠️ 原来这里是写死的四个链接（首页/世界/竞技场/训练记录）——
          而站点有八个页面，手机上目录又是隐藏的（窄屏放不下），
          于是**训练场 / 狗狗档案 / 月塔端口 / 排行榜在手机上进不去**。
          用户在真机上直接截图指出"标签不全"。 */
    h('nav', { class: 'row-tight', id: 'top-nav' },
      ...PAGES.map((pg) => {
        const copy = navCopyFor(st.uiMode, pg);
        return h('a', {
          class: 'tab' + (isCurrent(current, pg.path) ? ' is-current' : ''),
          href: '#' + pg.path,
          title: copy.label,
          style: { border: 'none', width: 'auto', padding: '10px 12px' },
        }, copy.short);
      }),
      /* ★ 剧情模式也要在**顶栏**有一席（用户要求）——
         和目录里那条一样：整页跳转，不走 hash 路由。 */
      h('a', {
        class: 'tab', href: GAL_HREF, id: 'top-gal', title: gal.label,
        style: { border: 'none', width: 'auto', padding: '10px 12px' },
      }, gal.short)),
    h('button', {
      class: 'btn btn-ghost btn-sm', id: 'theme-toggle', title: '切换 白天/夜读 纸色',
      onclick: () => { toggleTheme(); document.dispatchEvent(new CustomEvent('theme:changed')); },
    }, st.theme === 'night' ? '日间纸' : '夜读纸'),
    uiModeMenu(st),
    childMode
      /* 幼稚模式：账号入口与登出都收起来，只留这只明确的家长入口。
         账号页本身还有一道路由守卫（main.js），直接改 hash 也进不去。 */
      ? parentEntry()
      : st.account
        ? h('div', { class: 'row-tight' },
            /* 显示的是**昵称**（没起过就回退成登录名）——
               登录名不能改，昵称可以在 #/account 改。
               点它直接进账号设置页。 */
            h('a', {
              class: 'tab', href: '#/account', id: 'account-link',
              style: { border: 'none', width: 'auto', padding: '8px 10px' },
              title: '账号设置',
            }, `主人 ${st.account.nickname || st.account.username || '未登录'}`),
            h('button', {
              class: 'btn btn-ghost btn-sm',
              /* ⚠️ 两个 logout 别搞混：
                   `logout()`（本文件导入的）只清**本地**凭证，是同步的；
                   `api.logout()` 才会**通知服务端**撤销这一台会话。
                 只调前者的话，这一台在「登录着的设备」列表里会一直挂着。 */
              onclick: async () => {
                if (st.uiMode !== 'standard') {
                  const ok = await confirmDialog({
                    title: '退出登录',
                    body: '退出以后，要重新输入账号和密码才能看到你的狗。',
                    confirmText: '退出登录',
                  });
                  if (!ok) return;
                }
                try { await api.logout(); } catch (e) { /* 网络不通也要让本地退出 */ }
                logout();
                go('/login');
              },
            }, '登出'))
        : h('a', { class: 'btn btn-sm', href: '#/login' }, '登录 / 注册'));
}

/* 幼稚模式底部导航的图标：用单字/符号，不依赖 emoji 字体。
   老人模式那一条不用图标表，直接写"← / ⌂ / A+"。 */
const BOTTOM_ICON = { '/': '⌂', '/world': '☾', '/arena': '⚔', '/card': '犬' };

/** 老人/幼稚模式的固定底部导航。
 *  页面底部已经有虚拟摇杆的对战/世界页不画（见 uiMode.bottomNavFor），
 *  其余册页给一排大按钮：老人档是返回/首页/字号，幼稚档是四个主入口。
 *  返回 null 表示这一页不该有底部栏。 */
export function bottomBar(current = '/') {
  const st = get();
  const items = bottomNavFor(st.uiMode, current);
  if (!items) return null;
  const largeScale = st.uiScale === 'large';
  return h('nav', {
    class: `bottom-bar is-${st.uiMode}`, id: 'bottom-bar',
    'aria-label': st.uiMode === 'child' ? '小朋友的四个入口' : '快捷导航',
  },
    ...items.map((it) => {
      if (it.kind === 'back') {
        return h('button', {
          class: 'bottom-item', type: 'button',
          onclick: () => {
            if ((globalThis.history?.length || 0) > 1) globalThis.history.back();
            else go('/');
          },
        },
          h('span', { class: 'bottom-icon', 'aria-hidden': 'true' }, '←'),
          h('span', null, it.label));
      }
      if (it.kind === 'scale') {
        return h('button', {
          class: 'bottom-item', type: 'button', id: 'bottom-scale',
          'aria-pressed': largeScale ? 'true' : 'false',
          onclick: () => setUiScale(largeScale ? 'normal' : 'large'),
        },
          h('span', { class: 'bottom-icon', 'aria-hidden': 'true' }, 'A+'),
          h('span', null, largeScale ? '还原字号' : '字更大'));
      }
      return h('a', {
        class: 'bottom-item' + (it.current ? ' is-current' : ''),
        href: '#' + it.path,
        'aria-current': it.current ? 'page' : null,
      },
        h('span', { class: 'bottom-icon', 'aria-hidden': 'true' },
          BOTTOM_ICON[it.path] || '·'),
        h('span', null, it.label));
    }));
}

export function catalogue(current = '/') {
  const st = get();
  const gal = galCopyFor(st.uiMode);
  return h('aside', { class: 'catalogue' },
    h('div', { class: 'tabs', id: 'catalogue' },
      ...PAGES.map((p, i) => {
        const copy = navCopyFor(st.uiMode, p);
        return h('a', {
          class: `tab${isCurrent(current, p.path) ? ' is-current' : ''}`,
          href: '#' + p.path,
          'data-path': p.path,
        },
          h('span', { class: 'tab-idx' }, String(i + 1).padStart(2, '0')),
          h('span', null, copy.label),
          h('span', { class: 'tab-hint' }, copy.hint));
      }),
      /* ★ 剧情模式（gal）另起一条 —— 它是**独立应用**，不能走 hash 路由，
         所以用整页跳转（href 是真实路径，没有 #）。
         路径 `/gal/web/index.html` 由服务端的反向代理转给本机 18080
         （见 server/app/factory.py 的 _mount_gal_proxy）。 */
      h('a', { class: 'tab', href: GAL_HREF, id: 'to-gal' },
        h('span', { class: 'tab-idx' }, String(PAGES.length + 1).padStart(2, '0')),
        h('span', null, gal.label),
        h('span', { class: 'tab-hint' }, gal.hint))),
    h('div', { style: { marginTop: '14px' } },
      h('div', { class: 'note-paper small' },
        h('div', { class: 'hand', style: { fontSize: '15px', marginBottom: '4px' } }, textNode('这本册子')),
        textNode('左边是目录，中间是纸页，右边是便签。所有页面都是同一套羊皮纸。'),
        /* ★ 彩蛋提示（说白版）：原来只写"多按几下"，用户说"再明显一点"，
           现在把数字和"有东西"都写出来。口吻仍是册子。 */
        h('div', { style: { marginTop: '6px' } },
          textNode('扉页那枚印是按得动的 —— 连按七下，有人留了东西在里面。')))));
}

function isCurrent(cur, path) {
  if (path === '/') return cur === '/' || cur === '';
  return cur === path || cur.startsWith(path + '/');
}

/** 右栏便签：狗的速览 + 当前页提示 */
export function aside(tips = []) {
  const st = get();
  const dog = st.dog;
  const breed = dog ? breedOf(dog.breed_code) : null;
  const card = st.card;
  return h('aside', { class: 'aside' },
    dog
      ? h('div', { class: 'card' },
          h('div', { class: 'card-title' },
            h('span', { class: 'kicker' }, '我的狗')),
          h('div', { style: { display: 'grid', placeItems: 'center' } },
            dogPortrait(breed || { code: dog.breed_code }, dog.level)),
          h('div', { class: 'center', style: { marginTop: '6px' } },
            h('div', { style: { fontWeight: 750 } }, dog.name),
            h('div', { class: 'tiny muted' }, `${dog.breed_name} · LV.${dog.level}`)),
          h('div', { class: 'row-tight', style: { justifyContent: 'center', marginTop: '8px' } },
            h('span', { class: 'badge' }, tierOf(dog.level).label),
            h('span', { class: 'badge' }, dog.personality || '独立型')),
          card?.community
            ? h('div', { class: 'tiny muted center', style: { marginTop: '8px' } },
                `社群：${card.community.name}`)
            : null)
      : h('div', { class: 'note-paper small' },
          h('div', { class: 'hand', style: { fontSize: '15px' } }, textNode('还没有狗')),
          textNode('去「领养」选一个品种，就会自动加入公开社群。')),
    tips.length
      ? h('div', { class: 'note-paper small' },
          h('div', { class: 'hand', style: { fontSize: '15px', marginBottom: '4px' } }, textNode('这一页能做什么')),
          h('ul', { style: { margin: 0, paddingLeft: '18px' } },
            ...tips.map((t) => h('li', null, textNode(t)))))
      : null);
}

/** 页面骨架：中栏本身就是一张纸（.sheet），页面往里塞内容即可。
 *  统一走这里，页面之间才不会"有的有纸页、有的没有"。 */
export function pageShell({ current = '/', tips = [], withAside = true, full = false } = {}) {
  const pageEl = h('main', { class: 'sheet fade-in page-slot' });
  const cls = full ? 'shell full' : (withAside ? 'shell' : 'shell no-aside');
  const shell = h('div', { class: cls },
    catalogue(current),
    pageEl,
    withAside ? aside(tips) : null);
  return { shell, pageEl };
}
