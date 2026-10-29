/* 经验与等级（**本地结算**）
   ============================================================
   为什么要有这个文件：服务端按设计**不直接改**狗的等级经验，只把本局应得经验
   记下来（对战记在 `match.pending_exp`，训练关直接返回 `drop.exp`），
   结算交给"狗本体"——见 server/app/api/match.py 开头那段说明。

   但**这个"本地结算"一直没有实现**：
     · 前端全库搜不到 exp_engine / levelUp / addExp，一处都没有；
     · 竞技场领完奖只弹一句提示，既没加经验也没重算等级；
     · 训练关也是，提示里还写着"经验由本地养成结算"（说了一句没实现的话）。
   于是等级永远停在 LV.1，而 `api.updateMine()`（PATCH /api/dogs/mine）
   这个现成的镜像接口从来没被调用过 —— 全都卡在"缺这一块"上。

   ⚠️ 服务端只上行不下行：这里算出来的 level/total_exp 要**上报**给云端做镜像
      （社群、排行榜靠它），云端不会反过来覆盖本地。

   数值设计（自己定的，文档里没有现成规则，写在这里便于以后调）：
     升到下一级需要的经验 = 40 + 20 × 当前等级
       LV.1→2: 60   LV.2→3: 80   LV.3→4: 100 … LV.9→10: 220
     一局对战胜利 60 经验（服务端 WIN_EXP）、首通一关 120~460，
     所以前期"赢一局升一级"、后面慢慢变慢 —— 和"长夜里它一点点长大"对得上。
*/

/** 当前等级升到下一级需要多少经验 */
export function expToNext(level) {
  const lv = Math.max(1, Math.min(99, level | 0 || 1));
  return 40 + 20 * lv;
}

/** 从累计经验反推等级与进度 */
export function levelFromExp(totalExp) {
  let lv = 1;
  let left = Math.max(0, Math.floor(totalExp || 0));
  while (lv < 99 && left >= expToNext(lv)) {
    left -= expToNext(lv);
    lv += 1;
  }
  return { level: lv, into: left, need: expToNext(lv) };
}

/**
 * 给一只狗加上经验，返回**新的等级/总经验**与升级信息。
 * 纯函数：不改传入的 dog，调用方拿结果去 set() 与 updateMine()。
 */
export function applyExp(dog, gained) {
  const beforeLevel = (dog && dog.level) || 1;
  const beforeTotal = (dog && dog.total_exp) || 0;
  const add = Math.max(0, Math.floor(gained || 0));
  const total_exp = beforeTotal + add;
  const { level, into, need } = levelFromExp(total_exp);
  return {
    gained: add,
    total_exp,
    level,
    into,
    need,
    leveledUp: level > beforeLevel,
    from: beforeLevel,
  };
}
