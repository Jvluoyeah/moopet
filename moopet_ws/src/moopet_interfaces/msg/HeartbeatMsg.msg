# 背包心跳消息（W2·/backpack/heartbeat，5s 一帧）
# 狗侧据此判断背包盒子在线状态（断连/重连）
string node_id
uint32 seq
float32 cpu_percent
float32 mem_percent
bool alive
builtin_interfaces/Time stamp
