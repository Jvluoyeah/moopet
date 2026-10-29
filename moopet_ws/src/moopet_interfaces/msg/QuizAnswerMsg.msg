# 答题答案消息（用户作答 → 判题，W3 用）
uint32 question_id
string answer
bool is_correct
uint32 combo_count     # 当前连击数（连续答对 5/10 连击奖励）
builtin_interfaces/Time stamp
