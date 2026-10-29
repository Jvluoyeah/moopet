# 决策引擎入口事件（W3 · 李文扬：把感知/答题等事件统一挂到行为决策引擎入口）
# 发布端：quiz_node 等调用方；订阅端：decision_engine_node
# 对齐排期 W3「集成 quiz_node 并挂到决策引擎入口」+ 狗2.md 情感回应层
string event_type     # 事件类型：quiz_answer / pet / handshake / call / walk / air_quality / guide / ...
string event_value    # 事件细节：answer_correct / answer_wrong / ventilated / ...
string params         # 附加参数（JSON 文本）：如 {"category":"语文","combo":5,"difficulty":2}
builtin_interfaces/Time stamp
