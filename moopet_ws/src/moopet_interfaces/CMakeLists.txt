cmake_minimum_required(VERSION 3.8)
project(moopet_interfaces)

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

find_package(ament_cmake REQUIRED)
find_package(builtin_interfaces REQUIRED)
find_package(rosidl_default_generators REQUIRED)
find_package(std_msgs REQUIRED)

# ---------------- W1: 基础接口 ----------------
set(msg_files
  "msg/EmotionMsg.msg"
  "msg/AirQualityMsg.msg"
  "msg/TouchEventMsg.msg"
  "msg/IrCodeMsg.msg"
  "msg/QuizMsg.msg"
  "msg/QuizAnswerMsg.msg"
  "msg/StreakMsg.msg"
)

set(srv_files
  "srv/DogAction.srv"
  "srv/DogCombo.srv"
)

set(action_files
  "action/TtsSpeak.action"
)

# ---------------- W2: 模拟感知层新增 ----------------
list(APPEND msg_files
  "msg/HeartbeatMsg.msg"      # /backpack/heartbeat 5s
  "msg/OdomMsg.msg"           # /dog/odom 10Hz 遛狗统计
  "msg/VoiceCmdMsg.msg"       # audio_node 模拟语音命令
  "msg/VisionMsg.msg"         # vision_node 表情/动作识别结果
  "msg/DogStateMsg.msg"       # 狗侧状态广播（经验/等级/心情）
)

# ---------------- W3: 决策引擎入口新增 ----------------
list(APPEND msg_files
  "msg/DecisionEventMsg.msg"  # /dog/decision/event 决策引擎入口（quiz_node 等挂入）
)

rosidl_generate_interfaces(${PROJECT_NAME}
  ${msg_files}
  ${srv_files}
  ${action_files}
  DEPENDENCIES builtin_interfaces std_msgs
)

if(BUILD_TESTING)
  find_package(ament_lint_auto REQUIRED)
  ament_lint_auto_find_test_dependencies()
endif()

ament_export_dependencies(rosidl_default_runtime)
ament_package()
