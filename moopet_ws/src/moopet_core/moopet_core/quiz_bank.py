#!/usr/bin/env python3
"""养成系机械狗 · 题库模块（W3 · 李文扬，纯逻辑，无 ROS 依赖，可单测）。

对应排期 W3「集成 quiz_node」：
  - 题库按等级解锁：语文/数学=3级、英文/常识=8级、科学/编程=15级、自定义=20级
  - 难度 1~5 档，连错 3 题降一档（难度降档）
  - 判题（judge）与出题（pick）

规则来源：`养成系机械狗软件开发排期及分工.md` W3 条目 + 狗2.md「AI 交互（2级解锁）」。
边界用例见 tests/test_quiz_bank.py。
"""
import random

# ------------------------- 常量 -------------------------

# 题库按等级解锁（排期 W3 已定）
CATEGORY_UNLOCK_LEVEL = {
    '语文': 3,
    '数学': 3,
    '英文': 8,
    '常识': 8,
    '科学': 15,
    '编程': 15,
    '自定义': 20,
}

DIFFICULTY_MIN = 1
DIFFICULTY_MAX = 5
WRONG_DROP_THRESHOLD = 3          # 连错 3 题降一档难度
COMBO_BONUS = {5: 50, 10: 100}    # 连续答对 5 / 10 题的连击奖励（一次性）

# ------------------------- 题库（4 题 × 7 类 = 28 题） -------------------------
# 字段：id / category / difficulty(1~5) / question / options[4] / answer

QUESTION_DATA = [
    # ---- 语文（3 级解锁）----
    dict(id=1, category='语文', difficulty=1, question='“夜来风雨声，花落知多少”出自哪位诗人？',
         options=['孟浩然', '李白', '杜甫', '王维'], answer='孟浩然'),
    dict(id=2, category='语文', difficulty=1, question='“山重水复疑无路”的下一句是？',
         options=['柳暗花明又一村', '春风又绿江南岸', '碧水东流至此回', '明月何时照我还'], answer='柳暗花明又一村'),
    dict(id=3, category='语文', difficulty=2, question='“锲而不舍，金石可镂”出自哪部典籍？',
         options=['《荀子·劝学》', '《论语》', '《孟子》', '《庄子》'], answer='《荀子·劝学》'),
    dict(id=4, category='语文', difficulty=3, question='“知否，知否？应是绿肥红瘦”的作者是？',
         options=['李清照', '苏轼', '辛弃疾', '柳永'], answer='李清照'),

    # ---- 数学（3 级解锁）----
    dict(id=5, category='数学', difficulty=1, question='7 × 8 = ？',
         options=['54', '56', '58', '64'], answer='56'),
    dict(id=6, category='数学', difficulty=1, question='1 小时等于多少分钟？',
         options=['60', '100', '90', '3600'], answer='60'),
    dict(id=7, category='数学', difficulty=2, question='三角形的三个内角和是多少度？',
         options=['90', '180', '270', '360'], answer='180'),
    dict(id=8, category='数学', difficulty=3, question='3² + 4² = ？',
         options=['12', '25', '49', '7'], answer='25'),

    # ---- 英文（8 级解锁）----
    dict(id=9, category='英文', difficulty=1, question='“dog” 的中文意思是？',
         options=['猫', '鸟', '狗', '马'], answer='狗'),
    dict(id=10, category='英文', difficulty=2, question='“谢谢”的英文是？',
         options=['Sorry', 'Thank you', 'Excuse me', 'Please'], answer='Thank you'),
    dict(id=11, category='英文', difficulty=2, question='Which word is a fruit?',
         options=['Apple', 'Chair', 'Water', 'Book'], answer='Apple'),
    dict(id=12, category='英文', difficulty=3, question='“图书馆”的英文是？',
         options=['Library', 'Hospital', 'School', 'Museum'], answer='Library'),

    # ---- 常识（8 级解锁）----
    dict(id=13, category='常识', difficulty=1, question='一天有多少个小时？',
         options=['12', '24', '48', '8'], answer='24'),
    dict(id=14, category='常识', difficulty=1, question='一年有几个季节？',
         options=['2', '3', '4', '5'], answer='4'),
    dict(id=15, category='常识', difficulty=2, question='中国的首都是？',
         options=['上海', '北京', '广州', '深圳'], answer='北京'),
    dict(id=16, category='常识', difficulty=3, question='太阳从哪个方向升起？',
         options=['东', '西', '南', '北'], answer='东'),

    # ---- 科学（15 级解锁）----
    dict(id=17, category='科学', difficulty=2, question='水的化学式是？',
         options=['CO2', 'H2O', 'O2', 'NaCl'], answer='H2O'),
    dict(id=18, category='科学', difficulty=3, question='光在真空中的速度约为？',
         options=['3×10^8 m/s', '3×10^5 km/h', '3×10^6 m/s', '300 m/s'], answer='3×10^8 m/s'),
    dict(id=19, category='科学', difficulty=3, question='植物光合作用主要吸收什么气体？',
         options=['氧气', '二氧化碳', '氮气', '氢气'], answer='二氧化碳'),
    dict(id=20, category='科学', difficulty=4, question='地球绕太阳公转一圈约需多久？',
         options=['1 天', '1 月', '1 年', '1 小时'], answer='1 年'),

    # ---- 编程（15 级解锁）----
    dict(id=21, category='编程', difficulty=2, question='Python 中打印“你好”的命令是？',
         options=['print("你好")', 'echo 你好', 'console.log("你好")', 'cout << "你好"'], answer='print("你好")'),
    dict(id=22, category='编程', difficulty=3, question='下列哪个不是编程语言？',
         options=['Python', 'Java', 'C++', 'Music'], answer='Music'),
    dict(id=23, category='编程', difficulty=3, question='下列哪个用于循环结构？',
         options=['while', 'print', 'int', 'class'], answer='while'),
    dict(id=24, category='编程', difficulty=4, question='x=5, y=2，Python 中 x//y 的结果是？',
         options=['2', '2.5', '3', '0'], answer='2'),

    # ---- 自定义（20 级解锁，围绕本产品）----
    dict(id=25, category='自定义', difficulty=3, question='MooPet 的经验获取是否受每周上限约束？',
         options=['是', '否', '看等级', '不确定'], answer='是'),
    dict(id=26, category='自定义', difficulty=4, question='机器狗的“性格”由什么形成？',
         options=['预设模板', '真实互动数据', '随机生成', '固定不变'], answer='真实互动数据'),
    dict(id=27, category='自定义', difficulty=4, question='算力背包的主要作用是？',
         options=['提供算力', '装饰外观', '散热', '电池'], answer='提供算力'),
    dict(id=28, category='自定义', difficulty=5, question='下列哪个属于多模态情感识别的输入？',
         options=['语音情绪', '面部表情', '行为', '以上都是'], answer='以上都是'),
]


class QuizBank:
    """题库：按等级解锁、出题、判题、难度降档。"""

    def __init__(self):
        self.questions = {q['id']: dict(q) for q in QUESTION_DATA}

    # ---------------- 解锁与出题 ----------------

    def unlocked_categories(self, level):
        """返回当前等级已解锁的科目列表（排期 W3 的等级门槛）。"""
        return [cat for cat, lv in CATEGORY_UNLOCK_LEVEL.items() if level >= lv]

    def pick(self, level, difficulty=None, rng=None, exclude_ids=None):
        """在已解锁科目中抽题。
        - level: 当前狗等级（决定解锁科目）
        - difficulty: 期望难度（尽量命中该档，退而求最近档）
        - exclude_ids: 排除的题号（避免重复）
        无已解锁科目或无可选题时返回 None（quiz_node 据此等待升级）。
        """
        cats = self.unlocked_categories(level)
        if not cats:
            return None
        pool = [q for q in self.questions.values()
                if q['category'] in cats and (not exclude_ids or q['id'] not in exclude_ids)]
        if not pool:
            return None
        if difficulty is not None:
            exact = [q for q in pool if q['difficulty'] == difficulty]
            if exact:
                pool = exact
            else:
                pool = sorted(pool, key=lambda q: abs(q['difficulty'] - difficulty))
        rng = rng or random
        return dict(rng.choice(pool))

    # ---------------- 判题 ----------------

    def judge(self, question, answer):
        """判题：忽略首尾空白，英文不区分大小写。"""
        if not question or answer is None:
            return False
        return str(answer).strip().lower() == str(question['answer']).strip().lower()

    # ---------------- 难度降档 ----------------

    def next_difficulty(self, current, correct, wrong_streak):
        """难度调节：连错 3 题降一档；答对保持（后续 W4 再做动态调档）。"""
        if correct:
            return max(DIFFICULTY_MIN, current)
        if wrong_streak >= WRONG_DROP_THRESHOLD and current > DIFFICULTY_MIN:
            return current - 1
        return current


if __name__ == '__main__':
    bank = QuizBank()
    print('=== 题库自检 ===')
    print('科目数:', len(CATEGORY_UNLOCK_LEVEL), '| 题数:', len(bank.questions))
    print('等级解锁:')
    for lv in (1, 3, 8, 15, 20):
        print(f'  LV.{lv} →', '、'.join(bank.unlocked_categories(lv)) or '(无)')
    q = bank.pick(8)
    print('示例题(LV.8):', q['question'], '→', q['answer'])
    print('判题正确:', bank.judge(q, q['answer']),
          '| 判题错误:', bank.judge(q, '随便选'))
    print('难度降档: 连错3题', 2, '→', bank.next_difficulty(2, False, 3),
          '| 答对保持', 2, '→', bank.next_difficulty(2, True, 0))
