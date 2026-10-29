# 空气质量消息（仿真 ENS160 / PMS5003）
# 居家类·通风提醒：warning_level>0 触发提醒，ventilated=true 表示用户已通风完成 → +10 经验
uint8 AQI_NONE=0
uint8 AQI_MILD=1
uint8 AQI_BAD=2
uint16 pm2_5           # μg/m³
uint16 tvoc            # ppb
uint16 co2             # ppm
uint8 warning_level    # 0 正常 / 1 轻度 / 2 重度（触发通风提醒）
bool ventilated        # 用户已完成通风（加点点位）
builtin_interfaces/Time stamp
