/* 渲染插值
   ============================================================
   模拟固定 128Hz，显示器大多 60Hz —— 一帧画面要跳 2.13 个模拟帧。
   直接画"最后一次 tick 的位置"，动作就是一顿一顿的（judder）。

   做法：留住上一 tick 和这一 tick 的两组位置，按累加器的余数插值。
        alpha = acc / TICK_MS        （0 = 完全用上一帧，1 = 完全用这一帧）
        画 = prev + (cur - prev) * alpha

   ⚠️ 插值**只碰位置**，不碰状态机。
      状态（idle/attack/hurt…）取 cur，不能插 —— 插出个中间态姿势就错乱了。
      同理血量、冷却、连段这些离散量一律用 cur。

   ⚠️ 只有**同一只狗**的相邻两帧才能插。
      回合切换、换人、PvE 波次会让 units 数组整个换掉，
      拿 slot 0 的上一帧去插 slot 0 的这一帧，会看到"瞬移"。
      所以 push() 里比一下 id，对不上就丢弃上一帧。
*/

/** 需要插值的连续量（位置、速度这类）。其余字段一律取 cur。 */
const LERP_FIELDS = ['x', 'y', 'vx', 'vy'];

export function createInterp() {
  return {
    prev: null,
    cur: null,

    /** 每推进一个模拟 tick 调一次，喂进这一 tick 的 unitView 数组 */
    push(units) {
      const same = this.cur && units && this.cur.length === units.length
        && this.cur.every((u, i) => u && units[i] && u.id === units[i].id);
      this.prev = same ? this.cur : null;   // 对不上 id 就别插，直接跳
      this.cur = units;
    },

    /**
     * 取这一帧该画的东西。
     * @param alpha 0~1 的插值系数（累加器余数 / 一个 tick）
     */
    sample(alpha) {
      const cur = this.cur;
      if (!cur) return [];
      if (!this.prev || !(alpha > 0)) return cur;
      const a = Math.max(0, Math.min(1, alpha));
      return cur.map((u, i) => {
        const p = this.prev[i];
        if (!p) return u;
        const out = { ...u };
        for (const k of LERP_FIELDS) {
          if (typeof u[k] === 'number' && typeof p[k] === 'number') {
            out[k] = p[k] + (u[k] - p[k]) * a;
          }
        }
        return out;
      });
    },

    reset() { this.prev = null; this.cur = null; },
  };
}

/** 视角中心也插一下，否则拉远拉近会一顿一顿 */
export function lerpFocus(prevF, curF, alpha) {
  if (!prevF || !curF) return curF;
  const a = Math.max(0, Math.min(1, alpha));
  return {
    x: prevF.x + (curF.x - prevF.x) * a,
    span: prevF.span + (curF.span - prevF.span) * a,
  };
}
