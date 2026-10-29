/* 战斗姿态选择：把"模拟状态"翻译成"该画哪一张图"
   ============================================================
   分两层，缺一层就退回上一层，保证任何品种都有东西可画：

     ① 动作帧    breeds/<code>/actions/<动作>_<帧>.png    ← 现在只有萨摩耶有
     ② 四形态    breeds/<code>/forms/{sit,face,paw,lie}.png ← 八个品种都有
     ③ 程序生成 SVG                                          ← 兜底

   为什么单独一个模块：arena 和 training 两个页面都要用，
   而且这是**纯函数**（状态进、图名出），可以单独测。

   动作帧的语义（见 tools/actions/<code>.json 的归位表）：
     run    4 帧循环，按 tick 推进
     jump   腾空
     attack 2 帧：1=低头蓄力（前摇） 2=张嘴吼（判定）
     hurt   受击后仰
     down   倒地（X 眼）
     roll   冲刺/翻滚（带速度线）
     idle   待机
     win    胜利
*/

/** 动作帧没有的品种，按这个表退回四形态 */
const FORM_FALLBACK = {
  run: 'sit',
  jump: 'paw',
  attack: 'paw',
  hurt: 'paw',
  down: 'lie',
  roll: 'paw',
  idle: 'sit',
  win: 'face',
  sleep: 'lie',
  back: 'sit',
};

/** 跑动循环每帧停几个 tick（30Hz 下 5 tick ≈ 6 帧/秒，看着像在跑而不是在滑） */
const RUN_FRAME_TICKS = 5;

/**
 * @param {object} u     unitView() 出来的单位视图
 * @param {number} tick  当前模拟帧号（跑动循环用）
 * @param {number} frames 该品种 run 有几帧（没有动作帧时给 0）
 * @returns {{action:string, frame:number, form:string}}
 *          form 是给 breedImage() 用的键名：有动作帧时是 `run_02`，
 *          退回四形态时是 `sit` 这类
 */
export function pickPose(u, tick = 0, runFrames = 0) {
  const out = (action, frame = 1) => {
    if (runFrames > 0) {
      const n = action === 'run' ? runFrames : 1;
      const f = ((frame - 1) % n) + 1;
      return { action, frame: f, form: `${action}_${String(f).padStart(2, '0')}` };
    }
    return { action, frame: 0, form: FORM_FALLBACK[action] || 'sit' };
  };

  if (!u) return out('idle');
  if (u.state === 'down') return out('down');
  if (u.hurt) return out('hurt');
  if (u.state === 'dash') return out('roll');
  if (u.state === 'attack' || u.state === 'skill') {
    // 前摇 → 蓄力那一帧；判定与后摇 → 出招那一帧
    const windup = u.act ? u.stateT <= u.act.windup : false;
    return out('attack', windup ? 1 : 2);
  }
  if (!u.grounded) return out('jump');
  if (u.state === 'run' || Math.abs(u.vx) > 120) {
    return out('run', 1 + Math.floor(tick / RUN_FRAME_TICKS));
  }
  return out('idle');
}

/** 这个单位该不该用大世界那种"面朝前"的形态（只有四形态时才有意义） */
export function isFallbackForm(form) {
  return !/_/.test(form);
}

export { FORM_FALLBACK, RUN_FRAME_TICKS };
