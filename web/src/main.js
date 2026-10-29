/* 应用入口：装配样式、顶栏、路由与启动流程。 */

import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
// 战斗 HUD 的新增部分（防御条 / 气条 / 状态标记 / 必杀钮）。
// 单独一个文件是为了让"移植版引擎暴露出来的东西"集中在一处，
// 好和老的 components.css 分开看。
import './styles/battle-hud.css';
import './styles/touch.css';
// 响应式放最后：它要能压过前面的布局规则（窄屏收成一栏）
import './styles/responsive.css';
// 演出动画（抽签/盖章/日记）：放最末，只加 keyframes 与独立类名，不参与布局竞争
import './styles/anim.css';

import { h, mount } from './lib/dom.js';
import { api, isLoggedIn, token } from './lib/api.js';
import { get, set, applyTheme } from './lib/store.js';
import * as router from './lib/router.js';
import { topbar } from './components/layout.js';
import { preloadBreedArt } from './lib/breedAssets.js';
import { ensureFonts } from './lib/fonts.js';

import { homePage } from './pages/home.js';
import { loginPage } from './pages/login.js';
import { adoptPage } from './pages/adopt.js';
import { worldPage } from './pages/world.js';
import { cardPage } from './pages/card.js';
import { accountPage } from './pages/account.js';
import { leaderboardPage } from './pages/leaderboard.js';
import { towerPage } from './pages/tower.js';
import { quizPage } from './pages/quiz.js';
import { duelPage } from './pages/duel.js';
import { arenaPage } from './pages/arena.js';
import { trainingPage } from './pages/training.js';
import { dojoPage } from './pages/dojo.js';

const app = document.getElementById('app');
applyTheme(get().theme);

/* 顶栏 + 路由出口。顶栏在切页时重绘（登录状态会变）。 */
const shellEl = h('div', { class: 'site-frame' },
  h('div', { id: 'topbar-slot' }),
  h('div', { id: 'route-slot' }));

function renderTopbar() {
  // 传当前路径：顶栏导航要把对应那一项标成选中态（八项都要能认出来）。
  // ⚠️ currentRoute() 在首次导航完成前是 null，别直接取 .path。
  const cur = router.currentRoute();
  mount(document.getElementById('topbar-slot'), topbar((cur && cur.path) || '/'));
}

/* ---------------- 路由表 ---------------- */
router.define('/', () => { renderTopbar(); return homePage(); });
router.define('/login', () => { renderTopbar(); return loginPage(); });
router.define('/adopt', () => { renderTopbar(); return adoptPage(); });
router.define('/world', () => { renderTopbar(); return worldPage(); });
router.define('/arena', () => { renderTopbar(); return arenaPage(); });
router.define('/dojo', () => { renderTopbar(); return dojoPage(); });
router.define('/training', () => { renderTopbar(); return trainingPage(); });
router.define('/card', () => { renderTopbar(); return cardPage(); });
// 账号设置（昵称/改密码/登录设备/注销）。**不在 OPEN 里** —— 必须登录才能进。
router.define('/account', () => { renderTopbar(); return accountPage(); });
router.define('/leaderboard', () => { renderTopbar(); return leaderboardPage(); });
// 月塔端口：盖章 / 摸签 / 册子上的日记。世界里那个端口进来也是这一页。
router.define('/tower', () => { renderTopbar(); return towerPage(); });
// 月塔问询：它问一句你答一句。答对给经验、答错不惩罚，智力越高等提示越短。
router.define('/quiz', () => { renderTopbar(); return quizPage(); });
// 同问（好友对战）：同一道题、两个人同时答、谁先答对归谁。
// 智力高的狗提示解锁得更早 —— 那一两秒就是它的先手。
router.define('/duel', () => { renderTopbar(); return duelPage(); });

/* 未登录时：只放行首页/登录/设计系统/世界（世界与排行是公开数据） */
const OPEN = ['/', '/login', '/world', '/leaderboard', '/card'];
router.beforeEach((matched, params, p) => {
  if (isLoggedIn()) return null;
  if (OPEN.includes(matched?.pattern)) return null;
  return '/login';
});

document.addEventListener('theme:changed', renderTopbar);
// 改完昵称要重画顶栏 —— account.js 会发这个事件。
// 之前只监听 theme:changed，结果"改完昵称顶栏还显示旧名字"。
document.addEventListener('account:changed', renderTopbar);

/* ---------------- 启动 ---------------- */
async function boot() {
  // 真实狗形象要在**第一次渲染之前**预载好：
  // 品种卡、档案卡、HUD 头像都是同步取图的（取不到就退回 SVG 占位），
  // 晚一步加载就会出现"先看到占位图、几秒后突然换脸"的闪烁。
  // 加载失败不阻断启动，全站退回程序生成的木刻 SVG。
  const artJob = preloadBreedArt().catch((e) => {
    console.warn('[boot] 品种形象预载失败，使用占位形象：', e?.message || e);
  });
  // 字体也要在第一次渲染前等出来：世界里的招牌/名牌是 canvas 画完就定死的，
  // 晚到一步就永远停在回退字体上（见 lib/fonts.js）
  const fontJob = ensureFonts().catch(() => false);
  try {
    const breeds = await api.breeds();
    set({ breeds, online: true });
  } catch (e) {
    set({ online: false });
    console.warn('[boot] 品种加载失败：', e.message);
  }
  await Promise.all([artJob, fontJob]);
  if (isLoggedIn()) {
    try {
      const [me, dogs] = await Promise.all([api.me(), api.myDogs()]);
      set({ account: me, dog: dogs[0] || null });
    } catch (e) {
      console.warn('[boot] 会话失效：', e.message);
      token.clear();
      set({ account: null, dog: null });
    }
  }
  mount(app, shellEl);
  router.start(document.getElementById('route-slot'));
}

window.addEventListener('error', (e) => console.error('[window error]', e.message));
window.addEventListener('unhandledrejection', (e) => console.error('[unhandled]', e.reason));

boot();

/* 给自动化测试/排障用的小把手（只读） */
window.__moopet = {
  state: get,
  api,
  version: '0.1.0',
  routes: () => document.getElementById('route-slot')?.firstChild?.className || null,
};
