"""moopet_core —— 纯逻辑大脑（零 ROS 依赖）。

这一层刻意不 import rclpy / moopet_interfaces，因此可以：
  * 在无 ROS 的开发机上直接跑单测与仿真；
  * 通过 MOOPET_BRAIN=dog|backpack|sim 决定部署在狗本体还是算力背包；
  * 被 FastAPI 服务端直接复用做数值校验。

分层约定：core 只依赖标准库与 sqlite3；一切 ROS/网络/硬件访问都在上层。
"""
