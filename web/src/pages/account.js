/* 账号设置：昵称 / 改密码 / 登录着的设备 / 注销。
   ============================================================
   四项都对应服务端 `app/api/auth.py` 的接口：

     昵称      PATCH  /api/auth/me
     改密码    POST   /api/auth/me/password   ← 会让**其他设备全部失效**，
                                                并返回新 token（要写回）
     多设备    GET    /api/auth/me/sessions · .../{id}/revoke · .../revoke-others
     注销      DELETE /api/auth/me            ← 要再验一次密码，不可逆

   文案纪律（`剧本/UI文案对照.md`）：不用"玩家"、不出现"选择"两个字、
   不做"今日任务/成就"口吻。这里是设置页，口气比剧情页平一点是允许的，
   但"登录名/昵称"这类词要和注册页一致。
*/

import { h, withBusy } from '../lib/dom.js';
import { api, ApiError, token as apiToken } from '../lib/api.js';
import { go } from '../lib/router.js';
import { get, set } from '../lib/store.js';
import { sheetHead, note, errorBox } from '../components/ui.js';
import { pageShell } from '../components/layout.js';

/** 把时间戳说成"多久以前"。用户不需要看到 ISO 字符串。 */
function ago(iso) {
  if (!iso) return '—';
  const t = Date.parse(iso.endsWith('Z') ? iso : iso + 'Z');
  if (Number.isNaN(t)) return '—';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 90) return '刚刚';
  if (s < 3600) return `${Math.round(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.round(s / 3600)} 小时前`;
  return `${Math.round(s / 86400)} 天前`;
}

/** 把 User-Agent 说成人话：只认几个大类，认不出就原样截断。 */
function deviceName(ua) {
  const s = ua || '';
  const browser = /Edg\//.test(s) ? 'Edge'
    : /Chrome\//.test(s) ? 'Chrome'
      : /Safari\//.test(s) ? 'Safari'
        : /Firefox\//.test(s) ? 'Firefox' : '';
  const os = /Windows/.test(s) ? 'Windows'
    : /Mac OS X|Macintosh/.test(s) ? 'Mac'
      : /Android/.test(s) ? 'Android'
        : /iPhone|iPad/.test(s) ? 'iOS'
          : /Linux/.test(s) ? 'Linux' : '';
  const name = [os, browser].filter(Boolean).join(' · ');
  return name || (s ? s.slice(0, 28) : '认不出的设备');
}

export function accountPage() {
  const st = get();
  const msg = h('div');
  const sections = [];

  const nicknameInput = h('input', {
    class: 'input', id: 'nickname', maxlength: '32',
    value: st.account?.nickname || '', placeholder: '比如：月环街区的记录员',
  });
  const saveName = h('button', { class: 'btn btn-seal', id: 'save-nickname' }, '记下这个名字');

  const oldPwd = h('input', { class: 'input', id: 'old-password', type: 'password', autocomplete: 'current-password' });
  const newPwd = h('input', { class: 'input', id: 'new-password', type: 'password', autocomplete: 'new-password' });
  const newPwd2 = h('input', { class: 'input', id: 'new-password2', type: 'password', autocomplete: 'new-password' });
  const savePwd = h('button', { class: 'btn', id: 'save-password' }, '换成新密码');

  const devList = h('div', { id: 'sessions' });
  const kickOthers = h('button', { class: 'btn btn-ghost', id: 'revoke-others' }, '退出其他所有设备');

  const delPwd = h('input', { class: 'input', id: 'delete-password', type: 'password' });
  const delBtn = h('button', { class: 'btn btn-danger', id: 'delete-account' }, '注销账号');

  // ---------------- 昵称 ----------------
  saveName.addEventListener('click', () => withBusy(saveName, async () => {
    try {
      const acc = await api.updateProfile(nicknameInput.value.trim());
      set({ account: acc });
      msg.replaceChildren(note('记下了。', 'good'));
      document.dispatchEvent(new CustomEvent('account:changed'));
    } catch (e) {
      msg.replaceChildren(errorBox(e instanceof ApiError ? e : e));
    }
  }));

  // ---------------- 改密码 ----------------
  savePwd.addEventListener('click', () => withBusy(savePwd, async () => {
    if (newPwd.value !== newPwd2.value) {
      msg.replaceChildren(note('两次输入的新密码不一样。', 'warn'));
      return;
    }
    try {
      const r = await api.changePassword(oldPwd.value, newPwd.value);
      /* ⚠️ 必须把新 token 写回去。改密码时服务端把 token 版本 +1、
         其他设备全部失效；**当前这台**要接着用，靠的就是这个新 token。
         不写回的话，用户改完密码下一步就被踢出去。 */
      if (r && r.access_token) apiToken.set(r.access_token);
      oldPwd.value = newPwd.value = newPwd2.value = '';
      msg.replaceChildren(note('换好了。其他设备上的登录已经失效。', 'good'));
    } catch (e) {
      msg.replaceChildren(errorBox(e instanceof ApiError ? e : e));
    }
  }));

  // ---------------- 登录设备 ----------------
  function renderSessions(rows) {
    if (!rows.length) {
      devList.replaceChildren(note('没有记录到登录设备。', 'warn'));
      return;
    }
    devList.replaceChildren(...rows.map((s) => h('div', {
      class: 'row', style: { alignItems: 'center', gap: '12px', padding: '8px 0' },
    },
      h('div', { style: { flex: 1, minWidth: '160px' } },
        h('div', null, deviceName(s.user_agent) + (s.current ? '（这一台）' : '')),
        h('div', { class: 'field-hint' },
          `${ago(s.created_at)}登录 · 最近活跃 ${ago(s.last_seen_at)}`)),
      s.current ? null : h('button', {
        class: 'btn btn-ghost btn-sm',
        // 踢一台设备：成功后重新拉列表（那一台就从列表里消失了）
        onclick: async (ev) => {
          const btn = ev.currentTarget;
          btn.disabled = true;
          try {
            await api.revokeSession(s.id);
            renderSessions(await api.sessions());
          } catch (e) {
            msg.replaceChildren(errorBox(e instanceof ApiError ? e : e));
            btn.disabled = false;
          }
        },
      }, '退出这台'))));
  }

  kickOthers.addEventListener('click', () => withBusy(kickOthers, async () => {
    try {
      const r = await api.revokeOtherSessions();
      msg.replaceChildren(note(`已退出其他设备（${r.revoked} 台）。`, 'good'));
      renderSessions(await api.sessions());
    } catch (e) {
      msg.replaceChildren(errorBox(e instanceof ApiError ? e : e));
    }
  }));

  // ---------------- 注销 ----------------
  delBtn.addEventListener('click', () => withBusy(delBtn, async () => {
    if (!delPwd.value) {
      msg.replaceChildren(note('注销要再输一次密码。', 'warn'));
      return;
    }
    try {
      await api.deleteAccount(delPwd.value);
      // 账号没了，本地凭证也清掉，然后回登录页
      apiToken.clear();
      set({ account: null, dog: null, card: null });
      go('/login');
    } catch (e) {
      msg.replaceChildren(errorBox(e instanceof ApiError ? e : e));
    }
  }));

  const { shell, pageEl } = pageShell({
    current: '/account',
    tips: ['登录名不能改，昵称可以', '改密码会让其他设备退出',
           '注销之后，名下的狗也一起没了'],
  });

  sections.push(
    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '昵称')),
      h('div', { class: 'small muted', style: { marginBottom: '8px' } },
        `登录名是「${st.account?.username || ''}」，它不能改。昵称会显示在顶栏和广场上。`),
      nicknameInput, h('div', { style: { height: '8px' } }), saveName),

    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '改密码')),
      h('div', { class: 'small muted', style: { marginBottom: '8px' } },
        '换完之后，其他设备上的登录会一起失效 —— 只有这一台继续用。'),
      h('div', { class: 'field' }, h('label', { for: 'old-password' }, '现在的密码'), oldPwd),
      h('div', { class: 'field' }, h('label', { for: 'new-password' }, '新密码'), newPwd),
      h('div', { class: 'field' }, h('label', { for: 'new-password2' }, '再输一次'), newPwd2),
      savePwd),

    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '登录着的设备')),
      h('div', { class: 'small muted', style: { marginBottom: '6px' } },
        '同一个账号可以在几台设备上同时登录。这里列的是还登着的。'),
      devList, kickOthers),

    h('div', { class: 'card' },
      h('div', { class: 'card-title' }, h('span', { class: 'kicker' }, '注销账号')),
      h('div', { class: 'small muted', style: { marginBottom: '8px' } },
        '注销之后，账号名下的狗和档案会一起删掉，找不回来。'),
      h('div', { class: 'field' }, h('label', { for: 'delete-password' }, '输入密码确认'), delPwd),
      delBtn));

  pageEl.replaceChildren(
    sheetHead('账号', '登录名、密码、登录设备。这一页只给你自己看',
      h('a', { class: 'btn btn-ghost btn-sm', href: '#/' }, '回到册子')),
    msg,
    h('div', { class: 'stack-lg' }, ...sections));

  api.sessions().then(renderSessions).catch(() => {
    devList.replaceChildren(note('读不到登录设备（可能是网络问题）。', 'warn'));
  });
  return shell;
}
