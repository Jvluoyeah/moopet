/* 登录 / 注册：羊皮纸表单。
   注册成功后引导去领养 —— 领养才是"加入社群"的那一步。 */

import { h, withBusy } from '../lib/dom.js';
import { api, saveSession, ApiError } from '../lib/api.js';
import { go } from '../lib/router.js';
import { note } from '../components/ui.js';
import { pageShell } from '../components/layout.js';
import { set } from '../lib/store.js';

export function loginPage() {
  let mode = 'login';                 // login | register
  const msgSlot = h('div');
  const userInput = h('input', { class: 'input', id: 'username', autocomplete: 'username',
                                 placeholder: '给自己起个名字', maxlength: '32' });
  const passInput = h('input', { class: 'input', id: 'password', type: 'password',
                                 autocomplete: 'current-password', placeholder: '至少 6 位' });
  const submit = h('button', { class: 'btn btn-blue btn-block', id: 'submit' });

  const titleEl = h('h2', null, '登录');
  const subEl = h('div', { class: 'sub' }, '欢迎回来，你的狗还在等你');
  const switchBtn = h('button', { class: 'btn btn-ghost btn-block btn-sm', id: 'mode-switch' });

  function syncMode() {
    const isLogin = mode === 'login';
    titleEl.textContent = isLogin ? '登录' : '注册';
    subEl.textContent = isLogin ? '欢迎回来，你的狗还在等你' : '注册后就能领养一只机械狗，并自动加入公开社群';
    submit.textContent = isLogin ? '登录' : '注册并继续';
    switchBtn.textContent = isLogin ? '还没有账号？去注册' : '已经有账号了？去登录';
    passInput.setAttribute('autocomplete', isLogin ? 'current-password' : 'new-password');
    msgSlot.replaceChildren();
  }

  switchBtn.addEventListener('click', () => {
    mode = mode === 'login' ? 'register' : 'login';
    syncMode();
  });

  submit.addEventListener('click', () => withBusy(submit, async () => {
    const username = userInput.value.trim();
    const password = passInput.value;
    if (!username || !password) {
      msgSlot.replaceChildren(note('账号和密码都要填。', 'warn'));
      return;
    }
    try {
      const data = mode === 'login'
        ? await api.login(username, password)
        : await api.register(username, password);
      saveSession(data);
      set({ account: data.account });
      go('/adopt');
    } catch (e) {
      msgSlot.replaceChildren(note(e instanceof ApiError ? e.message : String(e), 'bad'));
    }
  }));

  [userInput, passInput].forEach((el) => el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit.click();
  }));

  syncMode();

  const { shell, pageEl } = pageShell({
    current: '/login',
    tips: ['注册后会自动加入公开社群', '养成数据存在你自己的狗身上',
           '密码加密保存，任何人都看不到你的明文密码'],
  });
  pageEl.replaceChildren(
    h('div', { class: 'grid-2', style: { alignItems: 'start' } },
      h('div', null,
        h('p', { class: 'kicker' }, 'MOOPET DOSSIER'),
        h('h1', { class: 'display' }, '先报上名来'),
        h('p', { class: 'lede', style: { marginTop: '14px' } },
          '注册一个账号，领养一只机械狗。它会记住你的陪伴，也会在开放世界里遇到别的狗。'),
        h('div', { class: 'stack-sm', style: { marginTop: '18px' } },
          note('养成数据存在你自己的狗身上，断网也能养；云端只负责账号、社群与对战。', 'good'),
          note('随便起个名字就能进，数据只存在这台机器上', ''))),
      h('div', { class: 'card tint' },
        h('div', { class: 'sheet-head', style: { marginBottom: '14px' } },
          h('div', null, titleEl, subEl)),
        h('div', { class: 'stack' },
          h('div', { class: 'field' },
            h('label', { for: 'username' }, '账号名'),
            userInput,
            h('div', { class: 'field-hint' }, '2–32 位，可用中文、字母、数字、下划线')),
          h('div', { class: 'field' },
            h('label', { for: 'password' }, '密码'),
            passInput,
            h('div', { class: 'field-hint' }, '至少 6 位。密码加密保存，别人看不到')),
          msgSlot,
          submit,
          h('div', { class: 'rule' }, h('span', null, '或')),
          switchBtn))));
  return shell;
}
