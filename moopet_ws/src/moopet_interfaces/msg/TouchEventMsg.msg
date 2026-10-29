# 触摸事件消息（仿真 MPR121，分布于头部/背部/前爪）
# 互动类·抚摸：gesture = pat/stroke → +10 经验
uint8 ZONE_HEAD=0
uint8 ZONE_BACK=1
uint8 ZONE_FRONT_PAW=2
uint8 zone
string gesture         # pat(抚摸) / stroke(抚摸) / press(按压)
uint16 duration_ms
builtin_interfaces/Time stamp
