# 火花/连续使用消息（W5 全量接入，W1 先定义接口）
uint8 STATE_RENEW=0     # 续火
uint8 STATE_CONTINUE=1  # 继续保持
uint8 STATE_EXPIRED=2   # 熄灭
uint16 streak_days
uint8 level             # 0~5 档（等级佩戴）
uint8 state
builtin_interfaces/Time stamp
