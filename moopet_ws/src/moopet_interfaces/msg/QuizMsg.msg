# 答题题目消息（出题节点 → 问答节点，W3 用，W1 先定义）
# 题库按等级解锁：语文/数学=3级，英文/常识=8级，科学/编程=15级，自定义=20级
uint32 question_id
string category        # 语文 / 数学 / 英文 / 常识 / 科学 / 编程 / 自定义
uint8 difficulty       # 1~5，连错 3 题降一档
string question
string[] options       # 选项列表
string correct_answer
builtin_interfaces/Time stamp
