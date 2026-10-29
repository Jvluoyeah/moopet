/* 开放世界页面：真的能操控狗跑动的世界
   ------------------------------------------------------------
   HUD 分区参照奇迹巡展那张图：
     左上  地点横幅（场景名 + 一句描述）
     右上  在场人数 / 场景切换
     左下  体力条 + 操作提示
     底部中 附近可交互物的提示（按 E）
   世界本体在 src/world/，这里只管页面装配与外部联动。
   */

import { h, withBusy } from '../lib/dom.js';
import { api, ApiError, token as apiToken } from '../lib/api.js';
import { get, breedOf } from '../lib/store.js';
import { sheetHead, note, errorBox } from '../components/ui.js';
import { pageShell, GAL_HREF } from '../components/layout.js';
import { go, onDispose } from '../lib/router.js';
import { World } from '../world/world.js';
import { SCENE_LIST, sceneOf } from '../world/scenes/index.js';
import { attachFullscreen } from '../lib/fullscreen.js';
import { preloadModels } from '../world/models.js';
import { preloadActions, preloadBreedArt } from '../lib/breedAssets.js';
import { ensureFonts } from '../lib/fonts.js';
// 剧情句库：卡片上的文案从剧本原文里随机取（见文件头的说明）
import { pickTwo } from '../lib/lore.js';
// 移动端触控层（虚拟摇杆 + 跳/跑/交互），只在触屏设备上显示
import { createWorldPad, isTouchDevice } from '../game/touch.js';
import { WorldSession } from '../world/worldNet.js';
import { createWorldLink } from '../world/worldLink.js';
// 场景编辑器：按 F2 开关，在浏览器里直接摆模型（见文件头部的用法说明）。
// 关着的时候只有一次 keydown 监听的代价，所以不额外做环境判断。
import { attachSceneEditor } from '../world/editor.js';

/** 把所有场景里会画到招牌/名牌上的字收集起来，喂给 ensureFonts。
 *  场景名 / 店名 / 公告板 / 传送牌 / NPC 名字都算——它们全都会被画成 canvas 贴图。 */
function signTextOfAllScenes() {
  const out = [];
  for (const meta of SCENE_LIST) {
    out.push(meta.name || '', meta.desc || '');
    const s = sceneOf(meta.code);
    if (!s) continue;
    for (const b of s.blocks || []) if (b.sign?.text) out.push(b.sign.text);
    for (const l of s.locals || []) out.push(l.label || '');
    for (const p of s.portals || []) out.push(p.label || '');
    for (const n of s.npcRoutes || []) out.push(n.name || '');
  }
  return out.join('');
}

/** 跟别的狗打招呼说的话（走文本气泡，不用 emoji） */
const GREETINGS = [
  '你好呀', '一起走走？', '你也是来遛弯的？', '这地方真热闹',
  '闻起来像有好吃的', '要不要比比谁跑得快', '你的项圈真好看',
];

export async function worldPage() {
  const st = get();
  // 模型很小（全部不到 300 KB），进场前一次载完，后面就能同步取用。
  // 外部搭好的整个场景（scene.imported.url）也在这里一起预载 ——
  // buildScene 是同步的，等不到那时再去 load。
  const sceneImports = SCENE_LIST
    .map((s) => sceneOf(s.code)?.imported?.url)
    .filter(Boolean);
  try {
    await preloadModels(sceneImports);
  } catch (e) {
    console.warn('[world] 模型预载失败，退回程序生成的占位道具：', e?.message || e);
  }
  // 招牌/公告板/传送牌上的字是建场景时一次性画到 canvas 上的，字体必须已经就绪。
  // 要把**这一版会画的字**都传进去：cn-font-split 的字体按 unicode-range 分片，
  // 只 load 一个样本字就只会下到那一片，别的字仍然是回退字体。
  await ensureFonts(signTextOfAllScenes());
  // ⚠️ 动作帧必须在这里也预载一次。
  // 竞技场那边一直是好的，世界这边一直"所有狗都是同一张静止贴图"——
  // 根因就是漏了这一个调用：actors 的 pose() 里 `hasActions(code)` 查的是
  // preloadActions() 填的 actionCache，没预载过就永远返回 false，
  // 于是每次都退回到"单图 + 上下浮动"的兜底路径，看起来当然一动不动。
  await Promise.all([
    preloadBreedArt().catch(() => {}),
    preloadActions().catch(() => {}),
  ]);
  const { shell, pageEl } = pageShell({ current: '/world', withAside: false });

  const viewport = h('div', { class: 'world3d', id: 'world3d' });
  const wrap = h('div', { class: 'world3d-wrap', id: 'world3d-wrap' });
  const banner = h('div', { class: 'w3-banner', id: 'w3-banner' });
  const topRight = h('div', { class: 'w3-topright', id: 'w3-topright' });
  const bottomLeft = h('div', { class: 'w3-bottomleft', id: 'w3-bottomleft' });
  const hint = h('div', { class: 'w3-hint', id: 'w3-hint' });
  const toast = h('div', { class: 'w3-toast', id: 'w3-toast' });
  const sceneTabs = h('div', { class: 'row-tight' });

  // 注意：World 构造时就会回调 onSceneChange，那时 `world` 这个 const 还在 TDZ 里，
  // 所以这里用一个独立变量记当前场景，回调里不要直接引用 world。
  let currentScene = st.scene || 'plaza';

  let toastTimer = 0;
  function say(text, kind = '') {
    toast.textContent = text;
    toast.className = 'w3-toast is-on ' + kind;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.className = 'w3-toast'; }, 2600);
  }

  // HUD 必须先铺好，再构造 World —— 因为 World 会往同一个容器里 append canvas，
  // 反过来（先构造再 replaceChildren）会把 canvas 一起冲掉。
  viewport.replaceChildren(bottomLeft, hint, toast);
  wrap.replaceChildren(
    h('div', { class: 'world3d-bar' }, banner, topRight),
    viewport);

  /* 移动端：触屏才挂虚拟摇杆和按钮（桌面端键盘本来就好使）。
     键名和键盘**完全一致**（w/a/s/d/shift/空格/e），
     所以两条入口走的是同一段逻辑，行为不会分叉。
     ⚠️ 空格（跳）在 world.js 里是"单次动作"，触控层只发 keydown 不发 keyup。
     ⚠️⚠️ **必须挂在 `wrap.replaceChildren(...)` 之后**：
         第一版挂在前面，那句 replaceChildren 把刚挂上的摇杆整个清掉了 ——
         表现是"代码明明在跑、DOM 里却没有它"，而且**一句报错都没有**。
     ⚠️⚠️ **必须挂在 `document.body` 上，不能挂在画布里**：
         CSS 里 `position: fixed` 的元素，只要祖先带 transform 就会以那个祖先
         为包含块、而不是视口。页面外壳 `.sheet` 有入场动画留下的
         `transform: matrix(1,0,0,1,0,0)` —— 挂在画布里时摇杆被它困住，
         实测按钮落在 y=1806（屏幕只有 915 高），**拇指永远够不着**。
         挂到 body 上就没有这个祖先了。 */
  const touchPad = isTouchDevice() ? createWorldPad(document.body) : null;
  if (touchPad) touchPad.root.classList.add('is-on');

  // 「在场」徽章要在建联机之前就存在——WorldLink 连上/断开时会直接改它的文案
  const ONLINE_LABEL = {
    idle: '未连线', connecting: '连线中…', open: '联机中',
    closed: '已断开', failed: '暂时连不上，稍后重试',
  };
  const onlineBadge = h('span', { class: 'badge is-off', id: 'w3-online' }, '未连线');
  const peerCount = h('span', { class: 'tiny muted', id: 'w3-peers' }, '');

  topRight.replaceChildren(
    h('button', { class: 'btn btn-sm btn-ghost', id: 'w3-fullscreen',
                  title: '全屏（F）',
                  onclick: () => fs.toggle() }, '全屏'),
    h('button', { class: 'btn btn-sm btn-ghost', id: 'w3-recenter',
                  title: '把视角转回场景默认取景',
                  onclick: () => {
                    const cam = world.scene.camera || {};
                    world.camera.yaw = cam.yaw !== undefined ? cam.yaw : -0.31;
                    world.camera.pitch = cam.pitch !== undefined ? cam.pitch : 0.907;
                  } },
      '复位视角'),
    onlineBadge, peerCount);

  const world = new World(viewport, {
    dog: st.dog,
    // 领养时填的那句「口头禅」——空格冒泡时以它为主（见 World.doAction）
    motto: (st.dog && st.dog.motto) || '',
    theme: st.theme === 'night' ? 'night' : 'day',
    sceneCode: st.scene || 'plaza',
    onSceneChange: (sc) => {
      currentScene = sc.code;
      banner.replaceChildren(
        h('div', { class: 'w3-place' }, sc.name),
        h('div', { class: 'w3-place-sub' }, sc.desc || ''));
      renderTabs();
    },
    onNearby: (n) => {
      if (!n) { hint.className = 'w3-hint'; hint.textContent = ''; return; }
      hint.className = 'w3-hint is-on';
      hint.replaceChildren(
        h('span', { class: 'w3-key' }, 'E'),
        h('span', null, n.hint ? `${n.label} — ${n.hint}` : n.label));
    },
    onInteract: (n) => {
      if (n.kind === 'portal') { goto(n.to); return; }
      // 和别的玩家打招呼：本地说一句 + 广播出去，对方那边也会冒泡
      if (n.kind === 'dog') {
        const line = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
        world.doAction(line);
        say(`向「${n.label}」打了个招呼：${line}`, 'good');
        return;
      }
      // 用户要求：技术性的东西不给用户看，改成剧情口吻
      if (n.id === 'board') {
        /* ★ 彩蛋提示（说白版）：公告板也说清楚。
           原来是三层递进、只有这里给数字；用户说"再明显一点"之后，
           三层都写明了 —— 这样哪怕玩家只翻了一个地方也能找到。 */
        say('公告板上还钉着一张旧纸。背面用铅笔写着：页头那枚印，连按七下。', 'good');
      }
      // 月塔端口：走过去按 E 直接进那一页（和网页端同一个后端、同一份数据）
      else if (n.id === 'tower-port') {
        say('端口认出了你的编号，屏亮了一下。', 'good');
        setTimeout(() => go('/tower'), 650);
      }
      // 月塔问询：并排的另一台，按 E 直接进去答题（提示按智力早晚浮出）
      else if (n.id === 'quiz-port') {
        say('屏上浮出一行字：今天想问几句？', 'good');
        setTimeout(() => go('/quiz'), 650);
      }
      /* ★ 剧情模式：狗窝里那本摊开的册子（用户要求："在大世界内我的狗窝
         就用来开启剧情模式"）。
         ⚠️ 用 location.href 整页跳，**不能**用 go()（那是 hash 路由器，
            只认站内路径，而剧情模式是挂在 /gal/ 下的独立应用）。 */
      else if (n.id === 'gal') {
        say('册子自己翻开了第一页。', 'good');
        setTimeout(() => { window.location.href = GAL_HREF; }, 650);
      }
      else if (n.id === 'diary') say('成长日记：这些天的记录都在档案页里', 'good');
      else if (n.id === 'shelf') say('架子上摆着它叼回来的东西。', 'good');
      /* ---- 场景里的"入口"：走过去按 E 直接进对应页面 ----
         ⚠️ 这里原来只弹一句话（"去竞技场页面开一局"），**不会真的带你去** ——
            用户指出"在竞技场内可以通向真正的竞技场这一页"。
            现在训练场教官和竞技场登记员都是真的入口。 */
      else if (n.id === 'arena-desk') {
        say('对战登记员：登记好了，这就带你过去。', 'good');
        setTimeout(() => go('/arena'), 650);      // 留一点时间让提示看得见
      } else if (n.id === 'trainer' || n.id === 'stage-desk') {
        say(`${n.label}：关卡在前面，跟我来。`, 'good');
        setTimeout(() => go('/training'), 650);
      } else say(`${n.label}：${n.hint || '暂时没什么可做的'}`, '');
    },
    onPortal: (to) => goto(to),
    onAction: (line) => say(line, ''),
  });

  // 场景编辑器（F2 开关，见 world/editor.js 的用法说明）。
  // 挂在页面这一层而不是 world 内部：它是"改场景的人"用的工具，
  // 不是世界运行的一部分。关着时只有一次 keydown 监听的开销。
  attachSceneEditor(world);

  // ---- 联机：一条连接 = 一个场景 ----
  const session = new WorldSession({ scene: st.scene || 'plaza' });
  world.attachSession(session);
  const net = createWorldLink(session, {
    onStatus: (s, detail) => {
      onlineBadge.textContent = ONLINE_LABEL[s] || s;
      onlineBadge.title = detail || '';
      onlineBadge.className = 'badge' + (s === 'open' ? ' is-on' : ' is-off');
    },
  });
  // 别人说话 → 浮条提示（世界里不打算做聊天面板，看到一句就够了）
  session.onChat = (dogId, name, text) => say(`${name}：${text}`, '');
  session.onPeerJoin = (peer) => {
    if (peer?.name) say(`${peer.name} 也在这里`, 'good');
  };
  session.onReject = (why) => {
    /* 服务端觉得这一步的位置不对（走太快、或者跑到场地外），这一步不采纳。
       ⚠️ 原来是「位置同步异常，已忽略这一步」—— 纯技术话术，用户直接截图指出。
          按 UI 规矩改成剧情口吻：不提"同步/异常/忽略"，只说"这一步不算"。
          真正的排查信息留在 console 里，页面上不给用户看。

       ⚠️⚠️ 而且**单人时根本不该说**（用户截图指出：一个人逛狗窝也冒这句）。
          这条提示的意义是"**相对别人**，你这一步不算、会被拉回去" ——
          没有别人在场时它毫无意义，看着还像出了错。
          什么时候会误触发：**切场景**（广场→狗窝）会整体改坐标，
          服务端按"移动太快"拒掉一次 —— 单人玩必然遇到。
          所以：日志照留，话只在**场上有别人**的时候说。 */
    if (why === 'too_fast' || why === 'out_of_bounds') {
      console.info('[world] 服务端拒绝了这一步的位置：' + why
                   + `（场上 ${session.peers ? session.peers.size : 0} 人）`);
      const withPeers = session.peers && session.peers.size > 0;
      if (withPeers) say('刚才那一步没算数，再走一次就好。', '');
    }
  };

  /* ⚠️ 别和 router 的 `go()` 搞混：
       · `go('/arena')`      —— 跳**页面**（路由，去对战页）
       · `goto('arena')`     —— 换 **3D 场景**（本函数，换房间重连）
     两个名字太像，所以这里单独写一句。 */
  function goto(code) {
    if (code === currentScene) return;
    world.setScene(code);              // 内部会 session.setScene(code)
    net.reconnect(code);               // 换场景 = 换房间，重开一条连接
    const meta = SCENE_LIST.find((s) => s.code === code);
    say(`来到 ${meta?.name || code}`, 'good');
  }

  function renderTabs() {
    sceneTabs.replaceChildren(...SCENE_LIST.map((s) => h('button', {
      class: `btn btn-sm ${s.code === currentScene ? '' : 'btn-ghost'}`,
      'data-scene': s.code,
      onclick: () => goto(s.code),
    }, s.name)));
  }

  /* 体力条已删除。
     它原来在这里显示 0~100 的体力，但**没有任何玩法挂钩**：
     跑动只是让它掉、停下就回满，不掉血、不影响技能、不改变速度。
     一个"只会动"的条比没有更让人困惑，所以按用户的要求去掉。

     保留了这个定时器 —— 它同时在更新下面的"同场景 N 人"。 */
  const stamTimer = window.setInterval(() => {
    // 在场人数：自己 + 远端（远端数量由联机会话维护）
    const n = 1 + (world.session?.peers.size || 0);
    peerCount.textContent = n > 1 ? `· 同场景 ${n} 人` : '';
  }, 80);

  // 左下角不再塞东西（体力条已删）。
  // 操作提示在画面外的说明卡里，按 E 的交互提示由 world 自己弹。
  bottomLeft.replaceChildren();

  // 每次进页面（刷新/切场景回来）都重新抽两句，所以刷新一次就换一批
  const lore = pickTwo();

  pageEl.replaceChildren(
    // 页头那行小字：操作要点留着（不给就真的不会走），但按小说版的口吻写
    sheetHead('开放世界', '拖拽转视角 · WASD 走动 · 路灯还亮着', sceneTabs),
    wrap,    h('div', { class: 'grid-3', style: { marginTop: '14px' } },
      h('div', { class: 'card flat' },
        h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '操作')),
        h('ul', { class: 'small', style: { margin: 0, paddingLeft: '18px' } },
          h('li', null, 'WASD / 方向键 走动，按住 Shift 跑（消耗体力）'),
          h('li', null, '空格 = 跳一下 + 冒泡（别人也看得见）'),
          h('li', null, '按住鼠标拖动 = 旋转视角，滚轮 = 缩放'),
          h('li', null, '走近可交互物或传送点，按 E 交互 / 走过去自动前往'))),
      /* ⚠️ 这两张卡片原来是**给开发者自己看的**：
           "这一版做了什么"（版本改动清单）、
           "下一步 · 还没做完的部分：剧情关卡的 Boss 战、更多可选的训练项目"。
         用户明确要求："有一些技术性的东西不要给用户看，应该补充剧情，
         每次刷新都是不同的句子。" → 换成从剧本里摘的原文（见 lib/lore.js），
         每次进页面随机两条，且保证两条不同。
         文案纪律见 `剧本/UI文案对照.md` 第三节的 UI 层禁令。 */
      h('div', { class: 'card flat' },
        h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '长夜月')),
        h('div', { class: 'small', style: { lineHeight: '1.9' } }, lore.scene)),
      h('div', { class: 'note-paper' },
        h('div', { class: 'hand', style: { fontSize: '15px' } }, '册子上的一行'),
        h('div', { class: 'small' }, lore.note))));

  renderTabs();
  world.start();
  // 全屏：按钮 / F 键 / 双击都能切，切换后自动 resize。
  // 全屏的是整块 wrap（含顶部信息条），这样全屏下还看得到自己在哪。
  const fs = attachFullscreen(wrap, { onResize: () => world.resize() });
  // 给自动化测试/排障留个把手（只读 + 传送，便于定位问题）
  window.__world = world;
  window.__worldNet = { session, link: net };

  const onTheme = () => world.setTheme(get().theme === 'night' ? 'night' : 'day');
  document.addEventListener('theme:changed', onTheme);
  const onResize = () => world.resize();
  window.addEventListener('resize', onResize);

  return onDispose(shell, () => {
    clearInterval(stamTimer);
    clearTimeout(toastTimer);
    document.removeEventListener('theme:changed', onTheme);
    window.removeEventListener('resize', onResize);
    net.close();
    fs.dispose();
    // 触控层也要拆：它挂在 wrap 上，页面切走后不拆会留着按钮和监听
    touchPad?.dispose();
    if (window.__world === world) delete window.__world;
    if (window.__worldNet) delete window.__worldNet;
    world.dispose();
  });
}
