/* 档案册布局：顶栏 + 册页目录 + 纸页 + 便签栏 */

import { h } from '../lib/dom.js';
import { go } from '../lib/router.js';
import { get, toggleTheme } from '../lib/store.js';
import { api, logout } from '../lib/api.js';
import { dogPortrait } from './ui.js';
import { breedOf } from '../lib/store.js';
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

/** 顶栏。`current` 是当前路径 —— 用来把对应那一项标成选中态。
 *  ⚠️ 必须显式声明这个参数：我改导航时直接引用了没声明的 `current`，
 *     那就是 `stage.js` 里 `opts is not defined` 的同一类错（一渲染就抛）。
 *     调用方在 main.js 的 renderTopbar() 里传 router.currentRoute()。 */
export function topbar(current = '/') {
  const st = get();
  const who = st.account?.username || '未登录';
  /* ★ 彩蛋挂在这个「犬」字标上：连点 7 下开一段录像（见 lib/easterEgg.js）。
     ⚠️ 它是个 <a href="#/">，连点会一直跳首页 —— 钩子里从第二下起
        preventDefault，单击照常回首页。
     ⚠️⚠️ 先把元素建出来再挂：`attachEasterEgg(el)` 返回的是**解绑函数**，
        直接把它当子节点塞进去的话，那个标根本渲染不出来
        （我第一版就是这么写的，e2e 报"等不到 #brand-mark"）。 */
  const brandMark = h('span', {
    class: 'brand-mark', id: 'brand-mark',
    /* ★ 彩蛋提示（说白版）：直接把数字写在悬停提示里。
       原来是三层递进（只说"按过很多次"→"多按几下"→公告板才给数字），
       用户看了说"再明显一点"，于是三层收敛成一层：哪儿都写清楚。 */
    title: '连按七下 —— 里面藏着一段录像。',
  }, '犬');
  // 单击该干的事（回首页）交给钩子延后执行；连点才开彩蛋。见 lib/easterEgg.js。
  attachEasterEgg(brandMark, { onSingle: () => go('/') });

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
      ...PAGES.map((pg) => h('a', {
        class: 'tab' + (isCurrent(current, pg.path) ? ' is-current' : ''),
        href: '#' + pg.path,
        title: pg.label,
        style: { border: 'none', width: 'auto', padding: '10px 12px' },
      }, pg.short || pg.label)),
      /* ★ 剧情模式也要在**顶栏**有一席（用户要求）——
         和目录里那条一样：整页跳转，不走 hash 路由。 */
      h('a', {
        class: 'tab', href: GAL_HREF, id: 'top-gal', title: '剧情模式',
        style: { border: 'none', width: 'auto', padding: '10px 12px' },
      }, '剧情')),
    h('button', {
      class: 'btn btn-ghost btn-sm', id: 'theme-toggle', title: '切换 白天/夜读 纸色',
      onclick: () => { toggleTheme(); document.dispatchEvent(new CustomEvent('theme:changed')); },
    }, st.theme === 'night' ? '日间纸' : '夜读纸'),
    st.account
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
              try { await api.logout(); } catch (e) { /* 网络不通也要让本地退出 */ }
              logout();
              go('/login');
            },
          }, '登出'))
      : h('a', { class: 'btn btn-sm', href: '#/login' }, '登录 / 注册'));
}

export function catalogue(current = '/') {
  return h('aside', { class: 'catalogue' },
    h('div', { class: 'tabs', id: 'catalogue' },
      ...PAGES.map((p, i) => h('a', {
        class: `tab${isCurrent(current, p.path) ? ' is-current' : ''}`,
        href: '#' + p.path,
        'data-path': p.path,
      },
        h('span', { class: 'tab-idx' }, String(i + 1).padStart(2, '0')),
        h('span', null, p.label),
        h('span', { class: 'tab-hint' }, p.hint))),
      /* ★ 剧情模式（gal）另起一条 —— 它是**独立应用**，不能走 hash 路由，
         所以用整页跳转（href 是真实路径，没有 #）。
         路径 `/gal/web/index.html` 由服务端的反向代理转给本机 18080
         （见 server/app/factory.py 的 _mount_gal_proxy）。 */
      h('a', { class: 'tab', href: GAL_HREF, id: 'to-gal' },
        h('span', { class: 'tab-idx' }, String(PAGES.length + 1).padStart(2, '0')),
        h('span', null, '剧情模式'),
        h('span', { class: 'tab-hint' }, '档案册'))),
    h('div', { style: { marginTop: '14px' } },
      h('div', { class: 'note-paper small' },
        h('div', { class: 'hand', style: { fontSize: '15px', marginBottom: '4px' } }, '这本册子'),
        '左边是目录，中间是纸页，右边是便签。所有页面都是同一套羊皮纸。',
        /* ★ 彩蛋提示（说白版）：原来只写"多按几下"，用户说"再明显一点"，
           现在把数字和"有东西"都写出来。口吻仍是册子。 */
        h('div', { style: { marginTop: '6px' } },
          '扉页那枚印是按得动的 —— 连按七下，有人留了东西在里面。'))));
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
          h('div', { class: 'hand', style: { fontSize: '15px' } }, '还没有狗'),
          '去「领养」选一个品种，就会自动加入公开社群。'),
    tips.length
      ? h('div', { class: 'note-paper small' },
          h('div', { class: 'hand', style: { fontSize: '15px', marginBottom: '4px' } }, '这一页能做什么'),
          h('ul', { style: { margin: 0, paddingLeft: '18px' } },
            ...tips.map((t) => h('li', null, t))))
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
