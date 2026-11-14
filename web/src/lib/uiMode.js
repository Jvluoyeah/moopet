/* 界面显示模式：标准 / 老人 / 幼稚。
   ------------------------------------------------------------
   模式只影响**本机显示**，不写服务端：同一账号换设备各选各的。
   三档的共同目标是把"看不清、点不准"和"信息太密"分开处理，
   而不是换一套完全不同的页面：

     standard  现有档案册，字号与密度不变
     elder     字号更大、正文对比更高、触控目标更大、关装饰与动画
     child     圆角大按钮、颜色更亮、导航改成更直白的说法

   落点：
     · `<html data-ui-mode="…">`（styles/modes.css 只认这个属性）
     · localStorage 的 `moopet.uiMode`
     · 切换时派发 `ui-mode:changed`，顶栏据此重绘

   ⚠️ 读取 localStorage 必须能失败（隐私模式/禁用存储）。失败就当标准模式，
      不能让"选过一次模式"变成打不开页面。 */

export const UI_MODE_KEY = 'moopet.uiMode';
/** 老人模式的第二档字号。只对老人模式生效，标准/幼稚档不读它。 */
export const UI_SCALE_KEY = 'moopet.uiScale';
/** 幼稚模式的可关闭反馈（点击音效 / 按钮动画）。 */
export const CHILD_PREFS_KEY = 'moopet.uiPrefs';

export const UI_MODES = [
  {
    id: 'standard',
    label: '标准',
    short: '标准',
    desc: '原来的档案册：字号和松紧都不变。',
  },
  {
    id: 'elder',
    label: '老人模式',
    short: '老人',
    desc: '字更大、墨色更深、按钮更好点，关掉纸纹和动画。',
  },
  {
    id: 'child',
    label: '幼稚模式',
    short: '幼稚',
    desc: '圆角大按钮、颜色更亮，目录换成更直白的说法。',
  },
];

const MODE_IDS = new Set(UI_MODES.map((m) => m.id));

/** 未知值一律回退到标准模式（旧版本存过的值、手改的 localStorage 都算）。 */
export function normalizeUiMode(mode) {
  return MODE_IDS.has(mode) ? mode : 'standard';
}

/* ---------------- 老人模式字号：默认 / 再大一号 ----------------
   需求里"字号可再调大"不能只靠浏览器缩放（那会把整页布局一起推乱）。
   这里只加一档显示偏好，由 modes.css 的 [data-ui-scale="large"] 消费。 */
export const UI_SCALES = [
  { id: 'normal', label: '默认大字', desc: '正文 20px，行距 1.8。' },
  { id: 'large', label: '特大字', desc: '正文再大一号，适合离屏幕更远。' },
];

const SCALE_IDS = new Set(UI_SCALES.map((s) => s.id));

export function normalizeUiScale(scale) {
  return SCALE_IDS.has(scale) ? scale : 'normal';
}

export function readUiScale(storage) {
  try {
    const store = storage === undefined ? globalThis.localStorage : storage;
    return normalizeUiScale(store?.getItem(UI_SCALE_KEY));
  } catch (e) {
    return 'normal';
  }
}

/** 把字号档写到 <html data-ui-scale> 与 localStorage，返回实际生效值。 */
export function applyUiScale(scale, {
  root = globalThis.document?.documentElement,
  storage,
} = {}) {
  const id = normalizeUiScale(scale);
  if (root) root.setAttribute('data-ui-scale', id);
  try {
    const store = storage === undefined ? globalThis.localStorage : storage;
    store?.setItem(UI_SCALE_KEY, id);
  } catch (e) {
    /* 存不下就只在本次会话生效 */
  }
  return id;
}

/* ---------------- 幼稚模式的反馈偏好 ----------------
   点击音效和按钮动画都可以关；关掉后 modes.css 用 data-child-motion="off" 停动画，
   childFx.js 用 sound=false 不再出声。默认都开，但尊重系统的减少动态设置。 */
export const DEFAULT_CHILD_PREFS = Object.freeze({ sound: true, motion: true });

export function normalizeChildPrefs(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    sound: typeof src.sound === 'boolean' ? src.sound : DEFAULT_CHILD_PREFS.sound,
    motion: typeof src.motion === 'boolean' ? src.motion : DEFAULT_CHILD_PREFS.motion,
  };
}

export function readChildPrefs(storage) {
  try {
    const store = storage === undefined ? globalThis.localStorage : storage;
    return normalizeChildPrefs(JSON.parse(store?.getItem(CHILD_PREFS_KEY) || 'null'));
  } catch (e) {
    return { ...DEFAULT_CHILD_PREFS };
  }
}

/** 合并写入一份/几项偏好；返回合并后的值。root/storage 可注入，便于测试。 */
export function writeChildPrefs(patch, {
  root = globalThis.document?.documentElement,
  storage,
} = {}) {
  const next = normalizeChildPrefs({ ...readChildPrefs(storage), ...patch });
  if (root) applyChildPrefs(next, root);
  try {
    const store = storage === undefined ? globalThis.localStorage : storage;
    store?.setItem(CHILD_PREFS_KEY, JSON.stringify(next));
  } catch (e) {
    /* 存不下就只在本次会话生效 */
  }
  return next;
}

/** 把幼稚模式偏好落到 <html>：CSS 只认这两个属性，不读 JS。 */
export function applyChildPrefs(prefs, root = globalThis.document?.documentElement) {
  if (!root) return;
  const p = normalizeChildPrefs(prefs);
  root.setAttribute('data-child-sound', p.sound ? 'on' : 'off');
  root.setAttribute('data-child-motion', p.motion ? 'on' : 'off');
}

/** 点击音效只在幼稚模式且用户没关的时候响。 */
export function childSoundEnabled(mode, prefs) {
  return normalizeUiMode(mode) === 'child' && normalizeChildPrefs(prefs).sound;
}

/** 幼稚模式底部导航的四个主入口；不是"全部功能"，只放最常用的一条路径。 */
export const CHILD_BOTTOM_PAGES = [
  { path: '/', label: '回家' },
  { path: '/world', label: '出去玩' },
  { path: '/arena', label: '比一比' },
  { path: '/card', label: '我的狗' },
];

/* 对战/开放世界页面底部已经有固定的虚拟摇杆，再盖一条导航会挡住拇指。
   这些页面不画底部栏，页面里的"回到册子/回首页"照常可用。 */
const GAME_PATHS = ['/world', '/arena', '/dojo', '/training'];

/** 底部栏该有哪些项；null = 这一页不画底部栏。
 *  纯函数，方便单测；layout.js 只负责把 id 换成按钮/链接。 */
export function bottomNavFor(mode, path = '/') {
  const m = normalizeUiMode(mode);
  if (m === 'standard') return null;
  if (GAME_PATHS.some((p) => path === p || path.startsWith(p + '/'))) return null;
  if (m === 'child') {
    return CHILD_BOTTOM_PAGES.map((p) => ({
      id: 'page' + p.path, path: p.path, label: p.label, current: p.path === path,
    }));
  }
  return [
    { id: 'back', label: '返回', kind: 'back' },
    { id: 'home', label: '回首页', path: '/', kind: 'link' },
    { id: 'scale', label: '字更大', kind: 'scale' },
  ];
}

/** 读取已保存的模式；存储不可用时返回 standard。
 *  ⚠️ 连 `globalThis.localStorage` 这个取值本身都放进 try：
 *     部分浏览器的隐私设置会让访问它直接抛 SecurityError，
 *     默认参数在函数体外求值，那时抛就没人接住了。 */
export function readUiMode(storage) {
  try {
    const store = storage === undefined ? globalThis.localStorage : storage;
    return normalizeUiMode(store?.getItem(UI_MODE_KEY));
  } catch (e) {
    return 'standard';
  }
}

/** 把模式写到 <html> 与 localStorage，返回实际生效的模式。
 *  root/storage 可注入，便于 Node 单测；浏览器里用默认值即可。 */
export function applyUiMode(mode, {
  root = globalThis.document?.documentElement,
  storage,
} = {}) {
  const id = normalizeUiMode(mode);
  if (root) root.setAttribute('data-ui-mode', id);
  try {
    const store = storage === undefined ? globalThis.localStorage : storage;
    store?.setItem(UI_MODE_KEY, id);
  } catch (e) {
    /* 存不下就只在本次会话生效 */
  }
  return id;
}

/** 剧情模式入口的文案（它不是 hash 路由，不在这份 PAGES 里）。 */
export function galCopyFor(mode) {
  return normalizeUiMode(mode) === 'child'
    ? { ...CHILD_GAL }
    : { label: '剧情模式', short: '剧情', hint: '档案册' };
}

/** 某一模式在目录/顶栏里的文案。standard/elder 用原页名，child 换成更直白的说法。 */
export function navCopyFor(mode, page) {
  const child = normalizeUiMode(mode) === 'child' && CHILD_NAV[page.path];
  if (!child) return { label: page.label, short: page.short || page.label, hint: page.hint };
  return { ...child, hint: page.hint };
}

/* 幼稚模式的导航文案：不改变页面本身，只把"档案例目"的说法换成
   小朋友一眼能懂的短句。键必须与 layout.js 的 PAGES 路径一一对应。 */
const CHILD_NAV = {
  '/': { label: '回家', short: '回家' },
  '/world': { label: '出去玩', short: '出去玩' },
  '/arena': { label: '比一比', short: '比赛' },
  '/training': { label: '闯关', short: '闯关' },
  '/dojo': { label: '练功房', short: '练功' },
  '/card': { label: '我的狗', short: '我的狗' },
  '/tower': { label: '月塔', short: '月塔' },
  '/quiz': { label: '答题', short: '答题' },
  '/duel': { label: '一起答', short: '一起答' },
  '/leaderboard': { label: '光荣榜', short: '光荣榜' },
};

export const CHILD_GAL = { label: '故事时间', short: '故事', hint: '档案册' };

/* 幼稚模式的叙述：标准文案 → 更短、更直白的说法。
   键是**完整标准句**，所以只影响明确登记过的界面叙述，
   不会碰狗名、昵称、服务端返回的社群介绍等用户/接口数据。
   页面用 components/ui.js 的 textNode() 包一层，切模式时 refreshCopy() 会就地换字，
   不必重跑页面（答题、对局不会被打断）。 */
const CHILD_TEXT = {
  /* 页面标题 */
  '竞技场': '比一比',
  '训练记录': '闯关',
  '开放世界': '出去玩',
  '月塔端口': '月塔',
  '月塔问询': '答题',
  '同问': '一起答题',
  '排行榜': '光荣榜',
  '我的机械狗': '我的狗',
  '领养一只机械狗': '养一只小狗',
  '训练场': '练功房',

  /* 页面副标题 */
  '铭刻于虚无核心的八个灵魂。挑一个，它会出现在广场上；你也会自动加入公开社群':
    '先挑一只喜欢的狗。它会出现在广场上，你也会自动加入社群。',
  '去图鉴里挑一只，它立刻会出现在广场上': '去图鉴挑一只，它马上就会来。',
  '领养之后这里会显示它的状态、社群和最近发生的事': '领养以后，这里会显示它的状态和最近的事。',
  '和同类打一场。闸机后的规则：免伤自检，输了不会真的坏掉。': '和别的狗打一场。不会受伤，输了也没关系。',
  'J 轻击 · K 重击 · U 突进 · I 升龙 · O 治愈 · L 必杀': '按 J 轻击、K 重击、U 突进、I 升龙、O 治愈、L 必杀。',
  '同一道题，两个人同时答': '一道题，两个人一起答。',
  '同一道题，两个人同时答 —— 谁先答对，这一回合归谁': '一道题，两个人一起答。谁先答对，谁得分。',
  '它问一句，你答一句': '它问，你答。',
  '盖章 · 摸签 · 册子上的日记': '盖章、抽签、写日记。',
  '档案册 · 关卡': '一关一关往前打。',
  '四道关卡。翻过去，册子上会多一页': '有四关。打过一关，就多一页。',
  '每通一关，档案册就多一页。首通给大奖，重复通关给少量经验。':
    '每过一关，就多一页。第一次过关奖励多，再打奖励少一点。',
  '等级 / 对战 / 社交 三个榜。没登记也看得见': '有等级、对战、社交三个榜。不登录也能看。',
  '拖拽转视角 · WASD 走动 · 路灯还亮着': '拖动看四周，WASD 走路。路灯还亮着。',
  '登录名、密码、登录设备。这一页只给你自己看': '这里可以改名字和密码。只有你能看。',
  '无压力练习 · 不倒计时 · 倒下自动复活 · 木桩不会还手': '随便练，不计时，倒下也会站起来。木桩不还手。',
  '横板对战需要宽一点的画面': '把手机横过来，画面会宽一点。',

  /* 总览 / 登录 / 领养 */
  '先登录，再领养一只机械狗。它能记住你的陪伴，也会在开放世界里认识别的狗。':
    '先登录，再养一只机械狗。它会记住你，也会认识别的狗。',
  '注册一个账号，领养一只机械狗。它会记住你的陪伴，也会在开放世界里遇到别的狗。':
    '注册一个账号，养一只机械狗。它会陪着你，也会认识别的狗。',
  '册子是你的了。狗还没有。': '本子有了，还差一只狗。',
  '档案册是空的': '这里还空着',
  '养成数据存在你自己的狗身上，断网也能养；云端只负责账号、社群与对战。':
    '成长记录存在你的狗身上，断网也能玩。云端只保存账号、社群和比赛。',
  '随便起个名字就能进，数据只存在这台机器上': '随便起个名字就能进。',
  '欢迎回来，你的狗还在等你': '欢迎回来，你的狗在等你。',
  '注册后就能领养一只机械狗，并自动加入公开社群': '注册后就能养狗，还会自动加入社群。',
  '还没有账号？去注册': '没有账号？去注册',
  '已经有账号了？去登录': '有账号了？去登录',
  '先报上名来': '先起个名字',
  '名字要短。你以后要喊它一辈子。（1–24 个字）': '名字短一点，1 到 24 个字。',
  '写一句你以后打算天天跟它说的话。不用长，一句就行。': '写一句想对它说的话，一句就好。',
  '一个账号最多领养 3 只。领养后可在「狗狗档案」里翻到完整的那一页。':
    '一个账号最多养 3 只。领养后可以在「我的狗」里看到它。',
  '品种还没加载出来，请稍候或刷新。': '还在加载，请等一下。',
  '先给狗起个名字。': '先给它起个名字。',
  '一个账号最多 3 只。上面挑一只带出门就好。': '一个账号最多养 3 只。挑一只带出门吧。',

  /* 目录便签与空状态 */
  '这本册子': '这本小册子',
  '左边是目录，中间是纸页，右边是便签。所有页面都是同一套羊皮纸。':
    '左边是目录，中间是内容，右边是小纸条。',
  '扉页那枚印是按得动的 —— 连按七下，有人留了东西在里面。':
    '页头那个「犬」可以按。连按七下，有惊喜。',
  '这一页能做什么': '这里能做什么',
  '去「领养」选一个品种，就会自动加入公开社群。': '去挑一只狗，它就会加入社群。',
  '训练场的门锁着。册子上还没有编号。': '练功房的门还锁着。',
  '登录并领养一只机械狗，档案册才会开始记页。': '登录并养一只狗，这里才会开始记录。',
  '端口不认没有编号的人。': '这里要先有一只狗。',
  '先去登记处领一只机械狗，册子上有了编号，端口才开。': '先去养一只狗，这里才会开。',
  '册子这一页还是空的。打过一局、通一关、串过门，这里就会多一行。':
    '这里还空着。打一局、过一关、串个门，就会多一行。',
  '月塔只问有编号的人。': '这里要先有一只狗。',
  '先去登记处领一只机械狗。': '先去养一只狗。',
  '今天的问询用完了。': '今天的题答完了。',
  '榜单还是空的': '榜上还没有名字',
  '去打一局、或者去广场串个门，这里就有名字了。': '去打一局，或者去广场串个门，就会有人上榜。',
  '这一页还是空的。': '这一页还空着。',
  '册子发下来了，编号那行还空着。': '本子有了，还差一只狗。',
  '我的档案卡': '我的档案卡',
  '社群档案卡': '别人的档案卡',
  '看排行': '看光荣榜',
  '去开放世界': '出去玩',

  /* 练功房 / 答题 / 同问 / 光荣榜的说明 */
  '木桩站着不动，你可以随便试招': '木桩不动，你可以随便试招。',
  '倒下会自动站起来，不会结束': '倒了自己站起来，不会结束。',
  '没有时间限制，练到会为止': '没有时间限制，练到会为止。',
  '小贴士': '小提示',
  '气在训练场里会自动补满，想练必杀随时可以放。': '这里的气会自动补满，想放必杀就放。',
  '被打破防的时候会有一下硬直，那是练防御的好时机。': '被打破防会停一下，正好练防御。',
  '同问：同一道题，两个人同时答，看谁快': '一起答：一道题，两个人一起答，看谁快。',
  '一个人问询': '一个人答题',
  '同问 · 抢答': '一起抢答',
  '去同问抢答': '去一起抢答',
  '月塔明天还会问。答对的经验已经记在它身上了。': '明天还会问。答对的经验已经记在它身上了。',
  '按自己的底子定一档，月塔就不拿超纲的题来问了。': '选一档适合自己的题，月塔就不会出太难的题。',
  '月塔拿哪一档来问': '选哪一档题',
  '这是今天最后一次。': '这是今天最后一题。',
  '找一只模拟体对一局': '和电脑答一局',
  '它不用等人，你一进去它就开答。脑子越好使的，答得又快又准。':
    '不用等人，进去就开始。脑子越好的狗，答得越快。',
  '找一只狗，把这间房留给它': '把房间留给一只狗',
  '开好之后把这串码念给对面，它在自己的册子上输进去。':
    '把这串码念给朋友，让它输进来。',
  '同问战绩': '一起答战绩',
  '月塔只把问话递给有编号的人。': '这里要先有一只狗。',
  '谁先答对，这一回合就记在谁头上。答错这一回合就锁住了 —— 不能乱点。':
    '谁先答对，谁得分。答错这一回合就不能改。',
  '点一下就是开一间留给它的房 —— 它那边会看到"等你进来"，不用念房间码。':
    '点一下就把房间留给它，不用念房间码。',
  '名册上还没有别的狗。先把房间码念给对面也一样能打。':
    '还没有别的狗。把房间码念给朋友也能打。',
  '等好友进来': '等朋友进来',
  '还没对过局。第一次会记在这里。': '还没打过。第一次会记在这里。',

  /* 总览下一步与说明 */
  '左栏是册页目录，右栏是你的狗与便签': '左边是目录，右边是你的狗和小纸条。',
  '去开放世界能看到别的狗，点它可以串门': '去外面能看见别的狗，点它就能串门。',
  '竞技场打一局有经验，由你本地的狗结算': '去比赛能拿经验。',
  '去开放世界走走，靠近别的狗按下 E 打招呼': '去外面走走，靠近别的狗按 E 打招呼。',
  '去竞技场打一局，赢了有经验': '去比一比，赢了有经验。',
  '打不过就进训练场练手——那里不会挨打': '打不过就去练功房练一练，那里不会受伤。',
  '看看排行榜上自己排第几': '看看自己在光荣榜上排第几。',
  '关于你的狗': '你的狗',
  '等级、经验、火花、日记都记在这只狗身上。断网也能继续养，联网之后自动同步。':
    '等级、经验、日记都记在它身上。断网也能养，联网后会自动同步。',

  /* 各页提示 */
  '注册后会自动加入公开社群': '注册后会加入公开社群。',
  '养成数据存在你自己的狗身上': '你的狗和成长记录存在这台机器上。',
  '密码加密保存，任何人都看不到你的明文密码': '密码会加密保存，别人看不到。',
  '品种决定四维天赋与形象': '品种决定它的样子和能力。',
  '领养后自动加入公开社群': '领养后会自动加入社群。',
  '一个账号最多 3 只': '一个账号最多养 3 只。',
  '登录名不能改，昵称可以': '登录名不能改，昵称可以改。',
  '改密码会让其他设备退出': '改密码后，别的设备要重新登录。',
  '注销之后，名下的狗也一起没了': '注销后，你的狗也会一起没有。',
  '未登录也能看榜': '不登录也能看榜。',
  '赢一局对战 +3 分': '赢一局比赛加 3 分。',
  '去广场串门能涨社交榜': '去广场串门能涨社交分。',

  /* 战斗说明 */
  '60 秒内把对方的血打空。打空、或者时间到时血更多的一方赢。':
    '60 秒内把对方打空血。谁先打空，或者时间到时谁血多，谁就赢。',
};

/** 幼稚模式换用更直白的一句；其他模式原样返回。 */
export function simpleText(mode, text) {
  if (normalizeUiMode(mode) !== 'child' || typeof text !== 'string') return text;
  return Object.hasOwn(CHILD_TEXT, text) ? CHILD_TEXT[text] : text;
}

/** 这句是否登记过幼稚模式说法（决定要不要包成可刷新的文本节点）。 */
export function hasSimpleText(text) {
  return typeof text === 'string' && Object.hasOwn(CHILD_TEXT, text);
}

/** 切模式后就地刷新页面里所有 [data-copy-standard] 文本，不重跑页面。 */
export function refreshCopy(mode, root = globalThis.document) {
  if (!root?.querySelectorAll) return;
  const m = normalizeUiMode(mode);
  root.querySelectorAll('[data-copy-standard]').forEach((el) => {
    el.textContent = simpleText(m, el.getAttribute('data-copy-standard'));
  });
}
