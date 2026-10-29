# 狗本体里程消息（W2·/dog/odom，10Hz，遛狗统计用）
# 口径：distance 为累计里程(米)，每累计 50m → 运动类·散步 +10 经验
float32 x
float32 y
float32 yaw
float32 linear_vel     # 当前线速度 m/s
float32 distance       # 累计里程 m（断点续计）
builtin_interfaces/Time stamp
