/* 剧情关卡数据：「档案册」里的训练记录
   ============================================================
   世界观包装：机械狗在训练模拟里挑战越来越强的机械对手，
   每通一关，档案册就多一页。Boss 走"家用机械失控"的路子——
   既幽默，又和"机械狗"这个主题自洽。

   关内节奏固定为：**推进 → 遇敌 → 打赢这一波 → 继续推进 …… → Boss 战**。
   为什么不是"一堆杂兵同时在场上"：见 game/sim.js 里 initTraining 的注释，
   一句话——为了杂兵去动锁步那块最值钱的代码，风险远大于收益。

   ⚠️ 改数值要同步跑 `node tests/sim_test.mjs`（里面有 PvE 的用例），
      以及 `node tests/levels_test.mjs`（关卡数据的自检）。
*/

// ⚠️ 目标用时的换算依赖模拟节拍，必须用**同一个常数**（原来是写死的 30，见 parTicks）
import { TICK_HZ } from './fx.js';

/** 行为档：交给 game/pve.js 解释，决定这个对手怎么打 */
export const PROFILES = {
  chaser: '直线逼近，进范围就咬',
  pouncer: '拉开距离再扑，扑完有硬直',
  drone: '悬空游走 + 俯冲，得跳起来打',
  roller: '高速滚过碾压，要用冲刺躲',
};

export const LEVELS = [
  {
    code: 'L1',
    name: '第一关 · 客厅沦陷',
    subtitle: '失控的扫地机器人',
    /* 小说第四章：那台老式扫地机的程序里，阿六**不是狗、不是同伴**，
       而是一团"必须被彻底清除、被强行抹杀的【顽固污渍】"。
       打法也是小说给的：它每一圈都在同一个转角慢下来，那是传感器的盲区。 */
    brief: '在它的程序里，你不是狗，是一团必须清除的【顽固污渍】。别硬拼——它每一圈，都在同一个转角慢下来。',
    recLevel: 1,
    stageW: 2000,
    parSec: 40,
    seed: 20240901,
    firstReward: { exp: 120, item: '尘埃齿轮' },
    repeatExp: 25,
    waves: [
      { gate: 620, unit: { name: '小吸尘兵', hp: 34, profile: 'chaser',
                           stats: { power: 40, agility: 50, wisdom: 30, affinity: 40 } } },
      { gate: 1180, unit: { name: '小吸尘兵', hp: 38, profile: 'chaser',
                            stats: { power: 44, agility: 54, wisdom: 30, affinity: 40 } } },
      { gate: 1700, unit: { name: '失控的扫地机', hp: 240, boss: true, profile: 'roller',
                            stats: { power: 80, agility: 62, wisdom: 40, affinity: 30 } } },
    ],
  },
  {
    code: 'L2',
    name: '第二关 · 巷口的头目',
    subtitle: '铁皮护甲的模拟体',
    /* 小说第四章：它"浑身披挂着生锈的铁皮护甲"，是照真实历史数据构建的
       【模拟体】—— 老人的原话是"这只不是月环街区的狗"。
       三段扑咬也是一段比一段快，退进死巷的直角墙缝就是致命的。 */
    brief: '三段扑咬，一段比一段快。它蹲在唯一的出口上——往后退就是死巷的直角。它不是月环街区的狗。',
    recLevel: 5,
    stageW: 2200,
    parSec: 55,
    seed: 20240902,
    firstReward: { exp: 220, item: '磨牙绳结' },
    repeatExp: 40,
    waves: [
      { gate: 640, unit: { name: '巷口小弟', hp: 44, profile: 'chaser',
                           stats: { power: 50, agility: 58, wisdom: 40, affinity: 45 } } },
      { gate: 1250, unit: { name: '巷口小弟', hp: 48, profile: 'chaser',
                            stats: { power: 54, agility: 62, wisdom: 40, affinity: 45 } } },
      { gate: 1300, unit: { name: '看门的老黄', hp: 70, profile: 'pouncer',
                            stats: { power: 62, agility: 66, wisdom: 50, affinity: 50 } } },
      { gate: 1850, unit: { name: '巷口的头目', hp: 300, boss: true, profile: 'pouncer',
                            stats: { power: 90, agility: 74, wisdom: 60, affinity: 40 } } },
    ],
  },
  {
    code: 'L3',
    name: '第三关 · 天台快递',
    subtitle: '盘旋的送药无人机',
    /* 小说第四章：那台失控的送药无人机"悬浮在天顶的铁丝网下方，发出刺耳的蜂鸣"。
       它不下来，所以够不着 —— 这是"打空中单位要跳起来"的来由。 */
    brief: '它悬在天顶铁丝网下面，蜂鸣不止，就是不肯下来。打空中单位，得跳起来。',
    recLevel: 9,
    stageW: 2300,
    parSec: 65,
    seed: 20240903,
    firstReward: { exp: 320, item: '螺旋桨叶' },
    repeatExp: 55,
    waves: [
      { gate: 620, unit: { name: '散落的包裹', hp: 40, profile: 'chaser',
                           stats: { power: 50, agility: 60, wisdom: 40, affinity: 40 } } },
      { gate: 1200, unit: { name: '小四轴', hp: 56, flying: true, hoverY: 160, profile: 'drone',
                            stats: { power: 60, agility: 72, wisdom: 50, affinity: 40 } } },
      { gate: 1850, unit: { name: '盘旋的送药机', hp: 340, boss: true, flying: true,
                            hoverY: 190, profile: 'drone',
                            stats: { power: 96, agility: 86, wisdom: 70, affinity: 40 } } },
    ],
  },
  {
    code: 'L4',
    name: '第四关 · 毛线雪崩',
    subtitle: '一人多高的旧毛线球',
    /* 小说第四章把这一关写成了全书的一个情感支点 ——
         机制："切角躲避，把巨大的线球诱导撞停在死角之中"（**不是**冲刺穿过去）；
         限时："极限考核时长也仅仅只有六十秒" → parSec 从 75 改成 **60**；
         来历："那不是由崭新毛线缠绕而成的玩具，而是由无数褪色的、
                 沾染着泥污与灰尘的旧毛线胡乱揉搓在一起的"；
         分量：老记录员那句"第四关……曾经有好几只狗，在里面哭过"。
       所以 brief 里把限时也写出来 —— 六十秒是这一关的一部分。 */
    brief: '它只会做一件事：滚过来。切角躲开，让它自己撞进死角——六十秒，够用。'
         + '这团线球是旧毛线揉的，曾经有好几只狗，在里面哭过。',
    recLevel: 14,
    stageW: 2400,
    // 小说第四章：“极限考核时长也仅仅只有六十秒”（原来是 75）
    parSec: 60,
    seed: 20240904,
    firstReward: { exp: 460, item: '褪色的毛线' },
    repeatExp: 70,
    waves: [
      { gate: 600, unit: { name: '滚落的小球', hp: 46, profile: 'chaser',
                           stats: { power: 55, agility: 65, wisdom: 40, affinity: 50 } } },
      { gate: 1150, unit: { name: '滚落的小球', hp: 52, profile: 'roller',
                            stats: { power: 60, agility: 80, wisdom: 40, affinity: 50 } } },
      { gate: 1700, unit: { name: '中号毛线团', hp: 90, profile: 'roller',
                            stats: { power: 70, agility: 86, wisdom: 40, affinity: 50 } } },
      { gate: 2100, unit: { name: '旧毛线球', hp: 400, boss: true, profile: 'roller',
                            stats: { power: 105, agility: 92, wisdom: 40, affinity: 50 } } },
    ],
  },
];

export function levelOf(code) {
  return LEVELS.find((l) => l.code === code) || null;
}

export function levelIndex(code) {
  return LEVELS.findIndex((l) => l.code === code);
}

/** 三星判定：通关时间 + 剩余血量（都在本地算，服务端只记结果）
 *
 *  目标用时**手写在关卡数据里**（parSec），不按场地宽度推：
 *  宽度只决定"跑多久"，真正吃时间的是"打掉多少血"——
 *  按宽度算出来的目标时间会紧到没人拿得到三星。
 */
export function starsFor(level, ticks, hpRatio) {
  const par = parTicks(level);
  if (ticks <= par * 0.7 && hpRatio >= 0.5) return 3;
  if (ticks <= par) return 2;
  return 1;
}

export function parTicks(level) {
  /* ⚠️⚠️ 这里原来是写死的 `* 30`，而模拟的节拍是 **TICK_HZ = 128** ——
     于是"目标用时"在界面上被算成 parSec × 30 ÷ 128 ≈ **parSec 的 23%**：
     第二关实际目标 55 秒，界面写的是「目标 13s」（用户截图里就是这个）。

     更严重的是它**同时污染了星级判定**：starsFor 拿 parTicks 跟真实的
     st.tick（128Hz）比，等于要求"用目标时间的 23% 通关才给两星、
     16% 才给三星" —— 实际上**永远只能拿一星**。

     为什么一直没被发现：tests/levels_test.mjs 里也写着 `par / 30`，
     把同一个错常数抄了一遍，于是测试和实现**一起错**，一直是绿的。
     现在两边都用 TICK_HZ。 */
  return Math.round((level.parSec || 45) * TICK_HZ);
}
