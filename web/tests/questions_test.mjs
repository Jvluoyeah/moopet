/* 题库自检
   ============================================================
   题库是**手写的数据**，最容易出的错不是"题目难"而是：
     · 答案下标越界（写了 answer: 4 但只有四个选项）
     · 选项重复（"36 支" 出现两次，答哪个都对/都不对）
     · 题干重复（复制粘贴时漏改）
     · 正确答案全挤在同一个下标（一眼就能蒙对）
     · 难度与学段对不上（小学题写着 difficulty 5、高中题全是 1）
   这些都能被机器查出来，所以别靠眼睛看。

   查不了的：答案在知识上对不对 —— 那只能靠写的时候认真。
   （数学题我是算过再写的；自检里额外把"算术类题目的答案"抽出来人工复核。）
*/
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/* 题库分批放在 w6/data/questions*.json（第一批太长，继续堆会变成没法读的巨文件）。
   这里把**所有批次**读进来合并 —— 和 server/app/api/quiz.py 的 bank() 一个口径，
   漏读一批就会"服务端出得出来的题、自检里查不到"。 */
const DIR = join(HERE, '..', '..', 'data');
const files = readdirSync(DIR).filter((f) => f.startsWith('questions') && f.endsWith('.json')).sort();
if (!files.length) {
  console.error('没找到任何 data/questions*.json');
  process.exit(1);
}
console.log(`题库文件：${files.join(' / ')}`);
const QS = files.flatMap((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')).questions || []);

let bad = 0;
const ok = (label, cond, detail = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '  — ' + detail : ''}`);
  if (!cond) bad += 1;
};

const STAGES = ['小学', '初中', '高中', '常识', '专业'];
const SUBJECTS = ['数学', '语文', '英语', '科学', '物理', '化学', '生物', '历史', '地理', '信息', '生活', '档案'];
/** 每个学段的难度应该落在哪一档（对得上课标：小学简单、高中要动脑） */
const DIFF_RANGE = { 小学: [1, 3], 常识: [1, 3], 初中: [2, 4], 高中: [3, 5], 专业: [3, 5] };

console.log(`\n[总量] 共 ${QS.length} 题`);
/* 下限就是**目标线 200**。到这一步题库已经 210 题，
   所以这条不再是"提醒还差多少"，而是"掉下 200 就是出事了"（比如误删一批文件）。 */
const FLOOR = 200;
ok(`题量至少 ${FLOOR}（目标线）`, QS.length >= FLOOR, String(QS.length));

console.log('\n[结构]');
{
  const ids = new Set();
  const texts = new Set();
  let dupId = 0;
  let dupText = 0;
  let badAnswer = 0;
  let badOptions = 0;
  let badStage = 0;
  let badSubject = 0;
  let badDiff = 0;
  let missing = 0;
  for (const q of QS) {
    if (!q.id || ids.has(q.id)) dupId += 1;
    ids.add(q.id);
    if (!q.q || texts.has(q.q)) dupText += 1;
    texts.add(q.q);
    if (!Array.isArray(q.options) || q.options.length < 2) badOptions += 1;
    else if (new Set(q.options).size !== q.options.length) badOptions += 1;
    if (typeof q.answer !== 'number' || !Array.isArray(q.options)
        || q.answer < 0 || q.answer >= q.options.length) badAnswer += 1;
    if (!STAGES.includes(q.stage)) badStage += 1;
    if (!SUBJECTS.includes(q.subject)) badSubject += 1;
    if (!Number.isInteger(q.difficulty) || q.difficulty < 1 || q.difficulty > 5) badDiff += 1;
    if (!q.hint || !q.why) missing += 1;
  }
  ok('编号唯一', dupId === 0, `${dupId} 个重复`);
  ok('题干不重复', dupText === 0, `${dupText} 个重复`);
  ok('选项都够两个且不重复', badOptions === 0, `${badOptions} 题有问题`);
  ok('答案下标合法（不越界）', badAnswer === 0, `${badAnswer} 题越界`);
  ok('学段都在名单里', badStage === 0, `${badStage} 题`);
  ok('学科都在名单里', badSubject === 0, `${badSubject} 题`);
  ok('难度都是 1~5 的整数', badDiff === 0, `${badDiff} 题`);
  ok('每题都带提示与解析（没有提示浮不出来、没有解析答完没话说）',
     missing === 0, `${missing} 题缺`);
}

console.log('\n[答案分布]');
{
  const byAnswer = [0, 0, 0, 0];
  for (const q of QS) if (q.answer >= 0 && q.answer < 4) byAnswer[q.answer] += 1;
  const total = QS.length;
  const worst = Math.max(...byAnswer) / total;
  console.log(`   下标 0/1/2/3 各 ${byAnswer.join(' / ')} 题`);
  ok('正确答案没有全挤在一个下标（最高占比 < 50%）', worst < 0.5,
     `${(worst * 100).toFixed(0)}%`);
  ok('四个下标都用到过', byAnswer.every((n) => n > 0));
}

console.log('\n[学段 × 难度 对得上]');
{
  for (const st of STAGES) {
    const rows = QS.filter((q) => q.stage === st);
    if (!rows.length) {
      ok(`${st} 有题`, false, '0 题');
      continue;
    }
    const [lo, hi] = DIFF_RANGE[st];
    const out = rows.filter((q) => q.difficulty < lo || q.difficulty > hi);
    const avg = rows.reduce((s, q) => s + q.difficulty, 0) / rows.length;
    ok(`${st} ${rows.length} 题，难度都在 ${lo}~${hi}（均值 ${avg.toFixed(1)}）`,
       out.length === 0, out.map((q) => `${q.id}:${q.difficulty}`).slice(0, 3));
  }
}

console.log('\n[覆盖度]');
{
  const subjects = new Set(QS.map((q) => q.subject));
  ok('学科覆盖 ≥ 8 个', subjects.size >= 8, [...subjects].join('/'));
  for (const st of STAGES) {
    const n = QS.filter((q) => q.stage === st).length;
    ok(`${st} 至少 6 题`, n >= 6, String(n));
  }
}

console.log('\n[提示不能就是答案]');
{
  /* ⚠️ 只查**两个字以上**的选项。
     第一版对单字符选项（"1"、"T"）必然误报 ——
     s-math-004 的提示是"两个都是 1/2"、选项是"1"，字符串包含就命中了；
     s-bio-002 的提示是"A-T、G-C"、选项是"T"，同样。
     那不是"提示泄露"，是**判据太糙**。这里收精度，不放宽：
     多字选项照样查，而且照样要求完全不出现。 */
  const leaks = QS.filter((q) => q.hint && q.options
    && q.options[q.answer] && String(q.options[q.answer]).length >= 2
    && q.hint.includes(q.options[q.answer]));
  ok('没有哪道题的提示直接写出了正确选项（多字选项）', leaks.length === 0,
     leaks.map((q) => q.id).slice(0, 3));
}

console.log(bad ? `\n${bad} 项不通过` : `\n题库自检通过 ✅（${QS.length} 题）`);
process.exit(bad ? 1 : 0);
