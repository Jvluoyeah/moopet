/* 服务端 API 客户端。
   约定：token 放 localStorage；所有错误统一抛 ApiError，页面只关心 message。 */

const TOKEN_KEY = 'moopet.token';
const ACCOUNT_KEY = 'moopet.account';

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/* 服务端地址：
   - 开发：Vite 代理 /api → 127.0.0.1:8080（见 vite.config.js），因此用相对路径
   - 部署：同源反代，也走相对路径
   需要直连别处时用 ?api=http://host:port 覆盖（演示排障很方便） */
const override = new URLSearchParams(location.search).get('api');
export const BASE = (override || '').replace(/\/$/, '');

export const token = {
  get: () => localStorage.getItem(TOKEN_KEY) || '',
  set(t) { localStorage.setItem(TOKEN_KEY, t); },
  clear() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(ACCOUNT_KEY); },
};

export const account = {
  get() {
    try { return JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null'); }
    catch { return null; }
  },
  set(a) { localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a)); },
};

async function request(method, path, { body, auth = true, raw = false } = {}) {
  const headers = {};
  if (body !== undefined && !raw) headers['Content-Type'] = 'application/json';
  if (auth && token.get()) headers.Authorization = `Bearer ${token.get()}`;

  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : (raw ? body : JSON.stringify(body)),
    });
  } catch (e) {
    throw new ApiError('连接不上，请检查网络后重试', 0, String(e));
  }

  if (res.status === 204) return null;
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    let msg = `请求失败（${res.status}）`;
    const detail = data && data.detail;
    if (typeof detail === 'string') msg = detail;
    else if (Array.isArray(detail) && detail.length) {
      // pydantic 校验错误：挑第一条说人话
      const d = detail[0];
      msg = `${(d.loc || []).slice(1).join('.') || '参数'}：${d.msg}`;
    }
    if (res.status === 401) {
      token.clear();
      msg = typeof detail === 'string' ? detail : '登录已过期，请重新登录';
    }
    throw new ApiError(msg, res.status, detail);
  }
  return data;
}

export const api = {
  // 服务信息
  health: () => request('GET', '/api/health', { auth: false }),
  meta: () => request('GET', '/api/meta', { auth: false }),

  // 账号
  register: (username, password, email = '') =>
    request('POST', '/api/auth/register', { body: { username, password, email }, auth: false }),
  login: (username, password) =>
    request('POST', '/api/auth/login', { body: { username, password }, auth: false }),
  me: () => request('GET', '/api/auth/me'),

  /* ---- 账号设置（昵称 / 改密码 / 登录设备 / 注销）----
     对应服务端 app/api/auth.py。两个语义要点：
       · 改密码会**让其他设备全部失效**，并返回一个**新 token**
         （当前这台要继续能用），所以调用方必须把返回值写回 token。
       · username 是登录名，改不了；能改的是 nickname。 */
  updateProfile: (nickname) => request('PATCH', '/api/auth/me', { body: { nickname } }),
  changePassword: (oldPassword, newPassword) =>
    request('POST', '/api/auth/me/password',
            { body: { old_password: oldPassword, new_password: newPassword } }),
  sessions: () => request('GET', '/api/auth/me/sessions'),
  revokeSession: (id) => request('POST', `/api/auth/me/sessions/${id}/revoke`),
  revokeOtherSessions: () => request('POST', '/api/auth/me/sessions/revoke-others'),
  logout: () => request('POST', '/api/auth/logout'),
  deleteAccount: (password) =>
    request('DELETE', '/api/auth/me', { body: { password } }),

  // 品种
  breeds: () => request('GET', '/api/breeds', { auth: false }),
  breedPopulation: (code) => request('GET', `/api/breeds/${code}/population`, { auth: false }),

  // 档案
  adopt: (name, breed_code, motto = '') =>
    request('POST', '/api/dogs/adopt', { body: { name, breed_code, motto } }),
  myDogs: () => request('GET', '/api/dogs/mine'),
  dogCard: (id) => request('GET', `/api/dogs/${id}/card`),
  updateMine: (patch) => request('PATCH', '/api/dogs/mine', { body: patch }),

  // 社群与开放世界
  community: () => request('GET', '/api/community/public', { auth: false }),
  members: (limit = 50) => request('GET', `/api/community/members?limit=${limit}`, { auth: false }),
  scenes: () => request('GET', '/api/community/scenes', { auth: false }),
  world: (scene = 'plaza') => request('GET', `/api/world?scene=${scene}`, { auth: false }),
  move: (patch) => request('POST', '/api/world/move', { body: patch }),

  // 剧情关卡（训练记录）：关卡内容在前端，服务端只管进度/掉落/榜单
  trainingLevels: () => request('GET', '/api/training/levels'),
  trainingClear: (body) => request('POST', '/api/training/clear', { body }),
  trainingBoard: (level = 'L1') => request('GET', `/api/training/board?level=${level}`, { auth: false }),
  trainingDrops: () => request('GET', '/api/training/drops'),

  // 月塔端口：盖章 / 摸签 / 册子上的日记
  // （网页端和世界里那个端口**共用这一套**，两边看到的是同一份数据）
  towerPanel: () => request('GET', '/api/tower/panel'),
  towerCheckin: () => request('POST', '/api/tower/checkin'),
  towerDraw: () => request('POST', '/api/tower/draw'),
  towerDiary: (limit = 30) => request('GET', `/api/tower/diary?limit=${limit}`),

  // 月塔问询（出题）。答案不下发 —— 判分在服务端，见 server/app/api/quiz.py
  quizAsk: () => request('GET', '/api/quiz/ask'),
  quizAnswer: (questionId, choice) =>
    request('POST', '/api/quiz/answer', { body: { question_id: questionId, choice } }),
  quizState: () => request('GET', '/api/quiz/state'),
  // 难度基准：月塔拿哪一档来问（题量与星档由服务端按题库现算，前端不自己数）
  quizBaselines: () => request('GET', '/api/quiz/baselines'),
  quizSetBaseline: (baseline) =>
    request('PUT', '/api/quiz/baseline', { body: { baseline } }),
  // 同问（好友对战）：同一道题、两个人同时答、谁先答对归谁。
  // ⚠️ 判分与计时**都在服务端的房间里**（/ws/quiz/{room}），
  //    下面这几个只管开房、进房、翻战绩 —— 前端判"谁快"是不算数的。
  duelOpponents: () => request('GET', '/api/quiz/duel/opponents'),
  duelOpen: (mode = 'friend', opponentDogId = null) =>
    request('POST', '/api/quiz/duel/room',
      { body: { mode, opponent_dog_id: opponentDogId } }),
  duelJoin: (room) => request('POST', `/api/quiz/duel/room/${room}/join`),
  duelRoom: (room) => request('GET', `/api/quiz/duel/room/${room}`),
  duelRecord: () => request('GET', '/api/quiz/duel/record'),
  duelDetail: (id) => request('GET', `/api/quiz/duel/${id}`),
  visit: (dogId, message = '') =>
    request('POST', `/api/community/visit/${dogId}`, { body: { message } }),
  visits: () => request('GET', '/api/community/visits'),

  // 对战
  createMatch: (mode = 'ai', opponent_dog_id = null) =>
    request('POST', '/api/match', { body: { mode, opponent_dog_id } }),
  match: (room) => request('GET', `/api/match/${room}`, { auth: false }),
  reportResult: (room, payload) => request('POST', `/api/match/${room}/result`, { body: payload }),
  claimReward: (room) => request('POST', `/api/match/${room}/claim`),
  replay: (room) => request('GET', `/api/match/${room}/replay`, { auth: false }),

  // 排行
  leaderboard: (kind = 'level', limit = 20) =>
    request('GET', `/api/leaderboard?kind=${kind}&limit=${limit}`),
};

export function saveSession(data) {
  token.set(data.access_token);
  account.set(data.account);
}

export function isLoggedIn() {
  return Boolean(token.get() && account.get());
}

export function logout() {
  token.clear();
}
