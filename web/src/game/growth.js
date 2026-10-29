/* 养成与四维 → 机制的**唯一真源**
   ============================================================
   为什么要单独一个文件：在它之前，四维是**死数据** ——
     · `data.power` 在 simAB.js:92 写死成 1，而唯一的用处是 rules.js:463
       的 `dmg = skill.damage * power` —— 也就是那个乘法**恒等于 ×1**；
     · `data.speed` 写死 260（rules.js:16 确实在读它，但没人往里写别的值）；
     · 敏捷 / 智力 / 亲和：全代码库**一处都没读过**；
     · 等级：战斗里没有任何作用（LV.1 和 LV.30 打起来一模一样）；
     · 社群那边是 `friendship_points += 1` 写死的，亲和同样没参与。
   于是八个原型只在贴图和数字上不同、打起来完全一样 —— 选谁纯看长相。

   这个文件把"等级 → 四维"和"四维 → 战斗"两件事收在一处，纯函数、无副作用，
   可以直接被 node 测试引用（tests/growth_test.mjs）。任何调数值都改这里，
   **不要在别处写魔法数字**。

   —— 数值是设计选择，不是物理定律。都带注释说明"为什么是这个量级"。
*/

/** 全局旋钮。调平衡只动这里。 */
export const GROWTH = {
  /** 每级成长 = 基础 + 出厂值 × 系数 ——
   *  出厂 50 的一维每级涨 0.6，出厂 95 的涨 0.83。
   *  为什么要跟出厂值挂钩：**品种偏向不用另建一张表** ——
   *  出厂时最高的那一维，练起来也长得最快，这本身就自洽。
   *  于是边牧越练越聪明、哈士奇越练越快、德牧越练越厚。 */
  perLevelBase: 0.35,
  perLevelFromStat: 1 / 200,
  /** 四维硬上限。不设的话三十级能顶到 110+ 把下面的公式推出合理区间。 */
  maxStat: 160,
  minStat: 1,
};

/** 战斗口径的基准值 —— 括号里是"接上之前"写死的值，用来对齐手感。 */
export const BASE = {
  hpMax: 400,        // simAB.js 里原来是 100 * 4
  speed: 260,        // simAB.js 里原来是 260
  damageMul: 1,      // rules.js 里原来 power 恒为 1
};

const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

/** 某只狗在某个等级下的四维。
 *  @param breed 品种。**两种形状都收**：
 *         · 平铺：`{power, agility, wisdom, affinity}`（测试里自己造的）
 *         · 嵌套：`{code, name, stats:{power, ...}}`（接口返回的就是这种）
 *  @param level 等级（≥1）
 *
 *  ⚠️ 为什么必须两种都收：真实接口（`/api/breeds`、`/api/dogs/{id}/card`）
 *     返回的是**嵌套**的 `stats`。我一开始只按平铺写，于是档案卡上传进来的
 *     `breed.power` 全是 undefined → 四项都落到默认值 50 →
 *     31 级正好显示成**四维全是 68**（用户截图："每只狗的这些属性维度不可能
 *     完全一样的"）。而单元测试用的是自己造的平铺对象，所以一路是绿的 ——
 *     这类"两边形状不一致"的 bug，只有拿真实数据跑才照得出来。
 */
export function statsAt(breed, level = 1) {
  const lv = Math.max(1, Math.floor(level || 1));
  const src = (breed && breed.stats) ? breed.stats : (breed || {});
  const out = {};
  for (const k of ['power', 'agility', 'wisdom', 'affinity']) {
    const base = Number(src[k]) || 50;          // 缺字段就当中等
    const per = GROWTH.perLevelBase + base * GROWTH.perLevelFromStat;
    const v = base + per * (lv - 1);
    out[k] = clamp(Math.round(v * 10) / 10, GROWTH.minStat, GROWTH.maxStat);
  }
  return out;
}

/** 四维 → 战斗参数。
 *
 *  每一项都**单调**：属性越高越强，且都有上下夹子 ——
 *  极端数值（四维全是 1 或全是 999）不会变成一战秒杀或永远打不动。
 *
 *  为什么系数是这些数：在"出厂四维 48~95"这个区间里，
 *  要让最好与最差之间差出**看得出手感区别、但不至于没法打**的幅度
 *  （血量 0.87×~1.13×、伤害 0.87×~1.13×、速度 0.91×~1.06×）。
 */
export function combatOf(stats) {
  const s = stats || {};
  const power = Number(s.power) || 50;
  const agility = Number(s.agility) || 50;
  const wisdom = Number(s.wisdom) || 50;
  const affinity = Number(s.affinity) || 50;

  return {
    /** 最大血量：体力 */
    hpMax: Math.round(BASE.hpMax * clamp(0.75 + power / 200, 0.6, 1.6)),
    /** 伤害倍率：体力 */
    damageMul: Math.round(clamp(0.75 + power / 200, 0.6, 1.6) * 1000) / 1000,
    /** 移动速度：敏捷。
     *  ⚠️ 系数定成 0.75 + agility/200 是**两次调出来的**：
     *     第一版 0.85+agility/400 让敏捷 50 算成 254（所有狗悄悄慢 2%），
     *     而且八只狗之间只差 18 点速度（10%）—— 手感上分不出来。
     *     现在敏捷 50 → 正好 260（接上写死值），58→270、84→319，
     *     最好与最慢差 16% 左右，是"看得出来但还能一起玩"的幅度。 */
    speed: Math.round(BASE.speed * clamp(0.75 + agility / 200, 0.75, 1.4)),
    /** 冷却倍率（越小越快）：智力 —— 越聪明，招式转得越快 */
    cdMul: Math.round(clamp(1.15 - wisdom / 400, 0.6, 1.15) * 1000) / 1000,
    /** 气力回收倍率：亲和 —— 越亲和，越容易攒满气 */
    energyMul: Math.round(clamp(0.85 + affinity / 300, 0.8, 1.5) * 1000) / 1000,
    /* 治愈（O 键）的两个数也一起算出来：回血看体力、耗气看敏捷。
       放在 combatOf 里是为了让**权威引擎那一侧也拿得到** ——
       它只吃 combatAt(...) 的结果（见 server 的 authority_routes._breeds_of）。 */
    ...healOf({ power, agility }),
  };
}

/** 一步到位：某只狗在某等级下的战斗参数 */
export function combatAt(breed, level = 1) {
  return combatOf(statsAt(breed, level));
}

/** 相比上一级，这一级涨了什么 —— 档案卡上要能看出"它比昨天强在哪"。 */
export function growthAt(breed, level) {
  const now = statsAt(breed, level);
  const before = statsAt(breed, level - 1);
  const delta = {};
  for (const k of ['power', 'agility', 'wisdom', 'affinity']) {
    delta[k] = Math.round((now[k] - before[k]) * 10) / 10;
  }
  return { stats: now, delta, combat: combatOf(now) };
}

/** 四维的中文名（界面与日记都用这一份，别各写各的） */
export const STAT_LABEL = {
  power: '体力', agility: '敏捷', wisdom: '智力', affinity: '亲和',
};

/** 答题时，**等多久提示才解锁**（毫秒）。
 *
 *  智力越高，等得越短 —— 这是"聪明"最直观的一种表现：
 *  聪明的狗不是天生知道答案，而是**更早想起该往哪个方向想**。
 *
 *  ⚠️ 提示**不是自动弹出来的**，而是"冷却结束后**变得可以点**"（用户明确要求：
 *     "冷却到了之后才可以点击并查看提示，不要直接出来"）。
 *     自动弹出来等于替你决定"你现在需要提示"，而让人自己点，才是他自己判断要不要。
 *
 *  数值（用户要求"设长一点"，所以从 20s 档整体上调）：
 *    基础 40 秒，每点智力减 280 毫秒，夹在 12~40 秒之间。
 *    智力 50（中位） → 26.0 秒
 *    智力 70（柴犬） → 20.4 秒
 *    智力 95（边牧） → 13.4 秒
 *    智力 140 以上   → 12.0 秒（下限：再聪明也得自己先想想）
 *    智力 1          → 39.7 秒（上限：再笨也给得起）
 *  为什么下限是 12 秒：提示是**帮人想起来**的，不是代替人想。
 *  几秒就解锁等于把题送出去，那样答对也没有成就感。
 *
 *  ⚠️ 这是**唯一真源**：页面上不许再写 26000 这种数字；
 *     服务端 server/app/api/quiz.py 的 HINT_* 常量必须与这里同步。
 */
export function hintDelayMs(wisdom) {
  const w = Number.isFinite(Number(wisdom)) ? Number(wisdom) : 50;
  return Math.round(clamp(40000 - w * 280, 12000, 40000));
}

/** **同问（好友对战）里**，等多久提示才解锁（毫秒）。
 *
 *  和上面单人问询那套（40 秒档）**不是一份数**，因为时限完全不同：
 *  对战一回合只有 12 秒，40 秒的冷却永远等不到 —— 那条机制就等于没有。
 *  用户要的正是这个："好一点的狗可以为自己争取更快的提示冷却时间"。
 *
 *  数值：基础 9 秒，每点智力减 45 毫秒，夹在 3~9 秒之间。
 *    智力 30 → 7.65 秒     智力 50（中位） → 6.75 秒
 *    智力 70（柴犬） → 5.85 秒   智力 95（边牧） → 4.73 秒
 *    智力 140 以上 → 3.0 秒（下限：再聪明也得自己先看一遍题）
 *  一回合 12 秒：边牧比中位的狗**早两秒**拿到提示，这两秒就是它的先手。
 *
 *  ⚠️ 这是**唯一真源**：页面上不许再写 4725 这种数字；
 *     服务端 server/app/ws/quiz_routes.py 的 DUEL_HINT_* 必须与这里同步。
 *  ⚠️ 提示同样是"冷却到了**变得可以点**"，不是自动弹出来。
 */
export function duelHintMs(wisdom) {
  const w = Number.isFinite(Number(wisdom)) ? Number(wisdom) : 50;
  return Math.round(clamp(9000 - w * 45, 3000, 9000));
}

/** 答对一题给多少经验（按难度）。答错给 0 —— **不惩罚**，只是没有。 */
export function quizExpFor(difficulty) {
  const d = Math.max(1, Math.min(5, Math.floor(difficulty || 1)));
  return [0, 12, 18, 26, 36, 50][d];
}

/** 治愈（O 键）的两个数：**回多少血** 与 **花多少气**。
 *
 *  用户定的口径：
 *    · 每次回的血由**体力**决定，**单次上限 80**；
 *    · 消耗的气由**敏捷**决定（越高越省 —— 敏捷本来就是"省力"的那一维）；
 *    · 必须消耗气，气不够就放不出来。
 *
 *  数值：
 *    回血 = clamp(round(体力 × 0.7), 10, 80)
 *      体力 50（中位）→ 35      体力 88（德牧）→ 62
 *      体力 114 以上  → 80（顶到上限，再高也不会更多）
 *    耗气 = clamp(round(60 − 敏捷 × 0.35), 20, 60)
 *      敏捷 50 → 43    敏捷 84（柴犬）→ 31    敏捷 115 以上 → 20（最低 20，不会变成免费）
 *
 *  为什么上限是 80：血量基准是 400 上下，一次回 80 是"五分之一条命" ——
 *  够救急，但**不足以靠它站住**（冷却 11 秒 + 一次 20~60 气兜着）。
 *  为什么耗气下限不是 0：气是这招的代价，免费的回血会让对局变成互相耗。
 */
export function healOf(stats) {
  const s = stats || {};
  const power = Number(s.power) || 50;
  const agility = Number(s.agility) || 50;
  return {
    amount: Math.round(clamp(Math.round(power * 0.7), 10, 80)),
    cost: Math.round(clamp(Math.round(60 - agility * 0.35), 20, 60)),
  };
}
