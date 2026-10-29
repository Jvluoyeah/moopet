/* 生成 tools/moves-<scene>.json
   ============================================================
   跑一遍 fix_overlap 的算法，把结果写成 JSON 给 apply_overlap.mjs 用。
   为什么分两步：fix_overlap 是人类看的报告，apply_overlap 要机器读的数据。
   两边用**同一套算法**（都 import 场景 + 同样的推出逻辑），不会漂。
*/
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const scenes = ['plaza', 'park', 'kennel', 'arena'];
for (const sc of scenes) {
  const out = execSync(`node tools/fix_overlap.mjs ${sc}`, { encoding: 'utf-8' });
  const moves = [];
  const re = /(\w+)\[(\d+)\]\s+(\S+)\s+\(F=(-?\d+), R=(-?\d+)\)\s+→\s+F=(-?\d+), R=(-?\d+)\s*\n\s*→\s+scene-file:\s+prop\((-?\d+),\s*(-?\d+)/g;
  let m;
  while ((m = re.exec(out))) {
    moves.push({
      group: m[1], index: Number(m[2]), name: m[3],
      F: Number(m[6]), R: Number(m[7]),
      x: Number(m[8]), z: Number(m[9]),
    });
  }
  fs.writeFileSync(`tools/moves-${sc}.json`, JSON.stringify(moves, null, 2));
  console.log(`${sc}: ${moves.length} 处`);
}
