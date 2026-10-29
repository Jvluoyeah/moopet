/* 横板对战的羊皮纸 HUD
   ============================================================
   分区照着参考图的信息层次来（**只学结构，不抄画面**）：

     顶部横贯      双方名牌 + 血条 + 防御条 + 气条
     顶部左/右     双方头像小章
     右上          性格 / 装备加成图标（墨线圈）
     左下          头像 + 连击点 + 气条
     右下          **六个**招式钮（J/K/U/I/O/L）+ 冷却环 + 键位
     正中          倒计时 / 回合提示

   ⚠️ 这个文件原来**写死了旧引擎**，四处在下面标了 `[旧]`。
      换引擎之后必须重做，否则界面上压根看不出底层换了：
        [旧] fmtCd(ticks, hz = 30)               —— 30Hz
        [旧] Math.floor(tick / 30)               —— 30Hz
        [旧] is-guard: Boolean(u.guard)          —— 旧引擎 guard 是布尔
      现在改成**引擎无关**：技能表和节拍都从 opts 传进来。

   为什么用 DOM 而不是画在 canvas 上：这套设计系统（纸纹、墨线、印章红）
   已经在 CSS 里了，重新用 canvas 画一遍等于把设计系统抄第二遍，
   而且以后改配色要改两个地方。
*/

import { h } from '../lib/dom.js';

/** 冷却显示：帧 → 秒。hz 由引擎决定（新引擎 128，旧引擎 30） */
const fmtCd = (frames, hz) => {
  if (!frames || frames <= 0) return '';
  const s = frames / hz;
  return s >= 10 ? String(Math.round(s)) : s.toFixed(1);
};

const pct = (v, max) => (max ? Math.max(0, Math.min(100, Math.round((v / max) * 100))) : 0);

/**
 * @param {HTMLElement} host
 * @param {object} opts
 *   skills  招式表，每项 { key, name, cd, cost, kind }
 *           —— 新引擎是 6 招（J/K/U/I/O/L，第 6 个是必杀），旧引擎是 4 招。
 *              这个数组决定右下角有几个钮，不再写死。
 *   tickHz  引擎节拍，用来把帧数换成秒显示
 *   onSkill (i) => void
 */
export function createBattleHud(host, opts = {}) {
  const skills = opts.skills || [];
  const HZ = opts.tickHz || 128;
  const sides = [0, 1];

  const bars = sides.map((side) => {
    const fill = h('i', { class: 'bh-fill' });
    const bar = h('div', { class: 'bh-bar' }, fill);
    // 防御条：叠在血条下面的一条细条。新引擎的防御是**会攒会掉**的数值，
    // 旧引擎只是个布尔标记 —— 所以要单独一条，不能只靠 class。
    const guardFill = h('i', { class: 'bh-fill guard' });
    const guardBar = h('div', { class: 'bh-bar sub guard' }, guardFill);
    // 气条：攒满 100 才能放必杀（第 6 招）
    const energyFill = h('i', { class: 'bh-fill energy' });
    const energyBar = h('div', { class: 'bh-bar sub energy' }, energyFill);
    // 用「你 / 对方」而不是「我方 / 对手」—— 全站第二人称，别突然变成军事术语
    const name = h('span', { class: 'bh-name' }, side === 0 ? '你' : '对方');
    // 状态标记：破防 / 架势 / 无敌
    const marks = h('span', { class: 'bh-marks' });
    const wrap = h('div', { class: `bh-side bh-side-${side}` },
      h('div', { class: 'bh-plate' },
        h('span', { class: 'bh-avatar', id: `bh-avatar-${side}` }),
        name,
        marks),
      bar, guardBar, energyBar,
      h('span', { class: 'bh-hpnum' }, '100'));
    return { wrap, fill, guardFill, energyFill, name, marks,
             num: wrap.querySelector('.bh-hpnum') };
  });

  const timer = h('div', { class: 'bh-timer', id: 'bh-timer' }, '60');
  const center = h('div', { class: 'bh-center' });
  const buffs = h('div', { class: 'bh-buffs', id: 'bh-buffs' });
  const combo = h('div', { class: 'bh-combo', id: 'bh-combo' }, '');
  const enFill = h('i', { class: 'bh-fill energy' });
  const enTxt = h('span', { class: 'bh-mini mono' }, '0');
  const portrait = h('div', { class: 'bh-portrait', id: 'bh-portrait' });
  const hint = h('div', { class: 'bh-hint', id: 'bh-hint' });
  /* 瞬时提示：给"7 连强制脱离"这种**一帧级**的事件用。
     不能复用 hint —— hint 是持续状态（"等待对手…"），
     这个是"啪一下出现、0.9 秒后消失"，两者生命周期完全不同。 */
  const flash = h('div', { class: 'bh-flash', id: 'bh-flash' });

  // ---- 招式钮：数量和内容都由 skills 决定 ----
  /* 招式钮的结构（三层，互不重叠）：
       .bh-ring    冷却环 —— conic-gradient 扫，剩下的暗色越少说明越快好
       .bh-skill-k 键位字母（冷却时缩小挪到上方）
       .bh-cd      剩余秒数（只在冷却时出现，居中）
     原来是键位和数字都 `inset:0 + place-items:center`，两个都往中心挤 ——
     用户截图里 "0.5" 直接压在 "K" 上。 */
  const skillBtns = skills.map((sk, i) => {
    const ring = h('span', { class: 'bh-ring' });
    const cd = h('span', { class: 'bh-cd' }, '');
    const key = h('span', { class: 'bh-skill-k' }, sk.key || String(i + 1));
    const btn = h('button', {
      class: 'bh-skill', id: `bh-skill-${i}`, type: 'button',
      title: `${sk.name}（${sk.key || i + 1}）${sk.cost ? ` · 气 ${sk.cost}` : ''}`,
      onclick: () => opts.onSkill?.(i),
    }, ring, key, cd);
    btn.dataset.name = sk.name || '';
    if (sk.super) btn.classList.add('is-super');
    return { btn, cd, ring, sk };
  });

  const bottomLeft = h('div', { class: 'bh-bl' },
    portrait,
    h('div', { class: 'bh-stack' },
      h('div', { class: 'bh-sta' },
        h('span', { class: 'bh-mini' }, '气'),
        h('div', { class: 'bh-bar thin' }, enFill),
        enTxt),
      combo));

  const bottomRight = h('div', { class: 'bh-br' },
    ...skillBtns.map((s) => s.btn));

  // Boss 血条：**只在剧情关卡的 Boss 战出现**（这就是参考图顶部那条血条的用途）。
  // 杂兵与推进段都不显示，免得"一条血条常驻在顶上"变得没有信息量。
  const bossFill = h('i', { class: 'bh-fill' });
  const bossName = h('span', { class: 'bh-boss-name' }, '');
  const bossSub = h('span', { class: 'bh-boss-sub' }, '');
  const bossPhase = h('span', { class: 'bh-boss-phase' }, '');
  const bossBar = h('div', { class: 'bh-boss', id: 'bh-boss' },
    h('div', { class: 'bh-boss-head' }, bossName, bossSub, bossPhase),
    h('div', { class: 'bh-bar boss' }, bossFill));

  // 推进提示（剧情关卡专用）：第几波 / 下一波的刷新冷却
  // ⚠️ 这里原来只有一行文字。用户要求"做好刷新 boss 之间的冷却时间**及其示意**" ——
  //    光有文字看不出"还要等多久"，所以里面加一条细线，走到底下一波就登场。
  const waveFill = h('i', { class: 'bh-wave-fill' });
  const wave = h('div', { class: 'bh-wave', id: 'bh-wave' }, waveFill);

  const root = h('div', { class: 'bh' },
    h('div', { class: 'bh-top' }, bars[0].wrap, center, bars[1].wrap),
    bossBar, wave, buffs, hint, flash, bottomLeft, bottomRight);
  host.appendChild(root);

  center.replaceChildren(timer);

  let lastCombo = 0;
  let bossKey = '';
  return {
    root,
    skills,
    setNames(mine, foe) {
      bars[0].name.textContent = mine || '我方';
      bars[1].name.textContent = foe || '对手';
    },
    /**
     * 头像。参数可以是三种：
     *   - SVG 字符串（程序生成的占位形象，兜底）
     *   - { url } 指向真实形象图
     *   - 空
     */
    setAvatars(mine, foe) {
      const put = (host, v) => {
        if (!host) return;
        host.replaceChildren();
        if (!v) return;
        if (typeof v === 'string') host.innerHTML = v;
        else if (v.url) {
          host.appendChild(h('img', { src: v.url, alt: v.alt || '', class: 'bh-face' }));
        }
      };
      put(bars[0].wrap.querySelector('.bh-avatar'), mine);
      put(bars[1].wrap.querySelector('.bh-avatar'), foe);
      put(portrait, mine);
    },
    setBuffs(list) {
      buffs.replaceChildren(...(list || []).map((b) => h('span', {
        class: 'bh-buff', title: b.title || b.label,
      }, b.label)));
    },
    setHint(text) {
      hint.textContent = text || '';
      hint.className = 'bh-hint' + (text ? ' is-on' : '');
    },
    /**
     * 瞬时提示（"啪一下"）。
     * @param text  内容
     * @param ms    显示多久（默认 900ms）
     * @param kind  'escape' 之类的样式钩子
     *
     * 为什么要单独一条通道：像"7 连强制脱离"这种事件只发生**一帧**，
     * 页面靠每帧比状态量是抓不住的（上一轮 is-ready 就是这么踩的坑）。
     * 引擎把它记成事件，页面收到就调这个，然后自己计时收掉。
     */
    flash(text, ms = 900, kind = '') {
      if (!text) return;
      flash.textContent = text;
      flash.className = `bh-flash is-on${kind ? ' is-' + kind : ''}`;
      clearTimeout(this._flashTimer);
      this._flashTimer = setTimeout(() => {
        flash.className = 'bh-flash';
      }, ms);
    },
    /** 显示/更新 Boss 血条；传 null 就收起 */
    setBoss(info, phaseLabel = '') {
      if (!info) {
        bossBar.classList.remove('is-on');
        bossKey = '';
        return;
      }
      const key = `${info.name}|${info.hp}|${info.maxHp}`;
      if (key !== bossKey) {
        bossKey = key;
        bossName.textContent = info.name || 'BOSS';
        bossSub.textContent = info.subtitle || '';
        const p = pct(info.hp, info.maxHp);
        bossFill.style.width = `${p}%`;
        bossBar.classList.toggle('is-low', p <= 33);
      }
      bossPhase.textContent = phaseLabel || '';
      bossBar.classList.add('is-on');
    },
    /** 推进段提示。
     *  `pct` 是**刷新冷却的进度**（0~1）：细线走到底，下一波就登场。
     *  不传或传 null 就不显示线（战斗中说"第 N/M 波"时不需要它）。
     *  ⚠️ 文案里**不写秒数** —— 写出来就成了催促，而这只是"它在路上"。 */
    setWave(text, pct = null) {
      // 文字与细线是两层：textContent 会连子元素一起清掉，所以只改文本节点
      if (wave.firstChild && wave.firstChild.nodeType === 3) {
        wave.firstChild.nodeValue = text || '';
      } else {
        wave.insertBefore(document.createTextNode(text || ''), wave.firstChild);
      }
      wave.classList.toggle('is-on', Boolean(text));
      wave.classList.toggle('has-gap', pct !== null && pct !== undefined);
      if (pct !== null && pct !== undefined) {
        waveFill.style.width = `${Math.max(0, Math.min(1, pct)) * 100}%`;
      }
    },
    /** 单人关：把某一侧的整条血条藏掉（对手还没登场时） */
    setSideVisible(side, visible) {
      bars[side].wrap.style.visibility = visible === false ? 'hidden' : '';
    },
    /**
     * 每帧刷新（只改文本与宽度，别重建 DOM）
     * @param view.units[i] 要带这些字段：
     *   hp / maxHp / guard / maxGuard / energy / maxEnergy（或 sta/maxSta）
     *   combo / state / cd / stance / invuln / guardBroken
     * @param countUp 剧情关卡用：没有"时间到判负"，计时器正着走
     */
    update(view, tick, roundTicks, countUp = false) {
      for (const side of sides) {
        const u = view.units[side];
        const b = bars[side];
        if (!u) continue;
        b.fill.style.width = `${pct(u.hp, u.maxHp)}%`;
        b.num.textContent = String(Math.round(u.hp));
        b.wrap.classList.toggle('is-low', pct(u.hp, u.maxHp) <= 30);
        b.wrap.classList.toggle('is-down', u.state === 'down');

        // 防御条：有防御值就显示（新引擎），旧引擎给 false 就整条隐藏
        const gMax = u.maxGuard || 0;
        const hasGuard = gMax > 0;
        b.wrap.classList.toggle('has-guard', hasGuard);
        if (hasGuard) {
          const gp = pct(u.guard, gMax);
          b.guardFill.style.width = `${gp}%`;
          b.wrap.classList.toggle('is-guardlow', gp <= 30);
        }

        // 气条：新引擎是 0~100 的 energy，攒满放必杀
        const eMax = u.maxEnergy || u.maxSta || 100;
        const e = u.energy !== undefined ? u.energy : (u.sta || 0);
        b.energyFill.style.width = `${pct(e, eMax)}%`;
        b.wrap.classList.toggle('is-full', eMax > 0 && e >= eMax);

        // 状态标记：破防 / 架势 / 无敌
        const marks = [];
        if (u.guardBroken) marks.push(['破防', 'broken']);
        if (u.stance) marks.push(['架势', 'stance']);
        if (u.invuln) marks.push(['无敌', 'invuln']);
        const key = marks.map((m) => m[1]).join(',');
        if (b.marks.dataset.key !== key) {
          b.marks.dataset.key = key;
          b.marks.replaceChildren(...marks.map(([txt, cls]) =>
            h('span', { class: `bh-mark ${cls}` }, txt)));
        }
      }

      const me = view.units[0];
      if (me) {
        const eMax = me.maxEnergy || me.maxSta || 100;
        const e = me.energy !== undefined ? me.energy : (me.sta || 0);
        enFill.style.width = `${pct(e, eMax)}%`;
        enTxt.textContent = String(Math.round(e));

        if (me.combo > lastCombo && me.combo > 1) {
          combo.textContent = `${me.combo} 连击`;
          combo.className = 'bh-combo is-on';
        } else if (me.combo <= 1) {
          combo.className = 'bh-combo';
        }
        lastCombo = me.combo;

        skillBtns.forEach((s, i) => {
          const cd = (me.cd && me.cd[i]) || 0;
          s.cd.textContent = fmtCd(cd, HZ);
          s.btn.classList.toggle('is-cooling', cd > 0);
          // 冷却环：暗色扇形从满圈缩到 0，--cd 是"还剩多少比例"。
          // 数值给 CSS 的 conic-gradient 用（见 battle-hud.css 的 .bh-ring）。
          const total = s.sk.cd || 0;
          const frac = total > 0 ? Math.max(0, Math.min(1, cd / total)) : 0;
          s.btn.style.setProperty('--cd', String(frac));
          // 必杀看气，其余看气够不够
          const cost = s.sk.cost || 0;
          s.btn.classList.toggle('is-poor', cost > 0 && e < cost);
          if (s.sk.super) s.btn.classList.toggle('is-ready', e >= eMax && cd <= 0);
        });
      }

      if (countUp) {
        timer.textContent = String(Math.floor(tick / HZ));
        timer.classList.toggle('is-urgent', false);
      } else {
        const left = Math.max(0, Math.ceil((roundTicks - tick) / HZ));
        timer.textContent = String(left);
        timer.classList.toggle('is-urgent', left <= 10);
      }
    },
    dispose() { clearTimeout(this._flashTimer); root.remove(); },
  };
}
