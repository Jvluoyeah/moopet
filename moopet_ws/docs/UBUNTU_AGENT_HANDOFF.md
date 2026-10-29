# 交接说明 · 给 Ubuntu 侧 Agent

> 本文件供在 **Ubuntu 22.04 + ROS2 Humble** 环境继续开发养成系机械狗的 Agent 阅读。
> 作者（李文扬·架构/集成）在 **Windows** 上完成了 W1 地基 + W2 全套 demo 的源码编写与**纯逻辑验证**，
> 由于本机没有 ROS2，**尚未做过真实编译与节点联调**，需你在 Ubuntu 上完成验证与后续开发。
> 请先完整阅读：`../README.md`、`docs/interface_spec.md`、`docs/部署文档.md`、以及排期 `养成系机械狗软件开发排期及分工.md`。

---

## 1. 项目背景与总目标

养成系机械狗（"狗本体 + 背包盒子"双机 ROS2 分布式仿真），**9.18 前**用**模拟数据**跑通
「感知 → 决策 → 成长」完整软件闭环，不依赖真实机械狗硬件。

- 需求文档：`狗1.md`（技术架构/技术栈）、`狗2.md`（养成规则）
- 排期分工：`养成系机械狗软件开发排期及分工.md`
- 当前进度：**W1（地基）与 W2（模拟感知层）已完成**，W3（8.17-8.23，答题+基础闭环）待开始

## 2. 我在 Windows 侧完成了什么

### W1 · 地基（李文扬条目，全做）
- `moopet_ws` 工作空间 + 三包骨架：`moopet_interfaces` / `moopet_backpack` / `moopet_dog`
- 全部自定义接口 **15 项**（见 §5），冒烟测试节点 `smoke_test_node`（T/S/A 往返）

### W2 · 模拟感知层（承接整周 demo）
- 接口规范：`docs/interface_spec.md`（Topic 字段/频率/7 来源归一映射）
- 背包侧 5 个仿真节点：heartbeat(5s) / audio / vision / env / touch（均有 `--demo` 脚本模式）
- 狗侧 3 个节点：odom(10Hz 遛狗口径) / exp_engine_node(结算+状态广播+`/dog/action`服务) / state_mgr(状态卡)
- 经验结算引擎 `exp_engine.py`（纯逻辑、SQLite 持久化）：7 来源归一、周上限、全局 2000、衰减最低 30 级、升级曲线、一次性成就
- 一键脚本：`start_demo.sh` / `stop_demo.sh` / `smoke_test.sh` / `boundary_test.sh`
- 文档：README、接口规范、部署文档、本交接说明

## 3. 已验证 / 未验证 清单（重要）

| 项 | 状态 | 说明 |
|----|------|------|
| 全部 Python 语法 | ✅ 已验 | `python -m py_compile` 全部通过 |
| 经验引擎边界用例 8 条 | ✅ 已验 | `tests/test_exp_engine.py` **8/8 通过**（无 ROS 依赖，任意机器可跑） |
| demo 时间轴模拟 | ✅ 已验 | 按 start_demo.sh 事件序：guide+100→LV6，最终 **LV.17 / 总720 / 周250**，升级+成就正常 |
| `colcon build` 编译 | ❌ 未验 | 我无 ROS2，请在 Ubuntu 首跑（务必先读 §6 的坑） |
| `ros2 interface show` 15 项 | ❌ 未验 | 验证接口生成 |
| 节点真实拉起 + 话题互通 | ❌ 未验 | `start_demo.sh` 全流程 |
| Service/Action 运行时往返 | ❌ 未验 | `smoke_test.sh` |
| 双机联调（狗↔背包） | ❌ 未验 | `--machine dog` / `--machine backpack` |

## 4. 目录结构（接续开发落点）

```
moopet_ws/
├── src/
│   ├── moopet_interfaces/          # 全部 msg/srv/action（W1）
│   │   ├── msg/  (12)  srv/ (2)  action/ (1)
│   ├── moopet_backpack/            # 背包盒子·仿真感知 + 心跳（W2）
│   │   └── moopet_backpack/
│   │       ├── heartbeat_node.py   # /backpack/heartbeat 5s
│   │       ├── audio_node.py       # /backpack/audio/voice_cmd
│   │       ├── vision_node.py      # /backpack/vision/expression|motion
│   │       ├── env_node.py         # /backpack/env/air_quality
│   │       └── touch_node.py       # /backpack/touch/zone
│   └── moopet_dog/                 # 狗本体（W2）
│       ├── moopet_dog/
│       │   ├── exp_engine.py       # ★纯逻辑结算引擎（无 ROS，可单测）
│       │   ├── exp_engine_node.py  # ROS 包装：订阅感知→结算→/dog/state + /dog/action
│       │   ├── odom_node.py        # /dog/odom 10Hz，--demo 自动遛狗
│       │   ├── state_mgr_node.py   # 订阅 /dog/state + heartbeat，打印状态卡
│       │   ├── smoke_test_node.py  # W1 冒烟：T/S/A 往返
│       │   ├── data/schema.sql     # 11 张表（对齐牛浩然 W1 口径）
│       │   └── tests/test_exp_engine.py  # 边界用例 8 条
├── scripts/  start_demo.sh / stop_demo.sh / smoke_test.sh / boundary_test.sh
├── standalone_demo.py / run_demo_win.bat   # 无 ROS 独立演示（Windows/Ubuntu 均可跑，纯 Python）
├── docs/     interface_spec.md / 部署文档.md / 本文件
└── logs/     运行时日志（自动生成，gitignore）
```

## 5. 接口一览（moopet_interfaces）

- **msg（12）**：EmotionMsg / AirQualityMsg / TouchEventMsg / IrCodeMsg / QuizMsg / QuizAnswerMsg / StreakMsg（W1）
  + HeartbeatMsg / OdomMsg / VoiceCmdMsg / VisionMsg / DogStateMsg（W2 新增）
- **srv（2）**：`DogAction.srv`（/dog/action，动作加点）、`DogCombo.srv`（/dog/combo，答题连击，W3 用）
- **action（1）**：`TtsSpeak.action`（/backpack/tts_speak，W3 语音用）

> 新增接口时必须：在 `moopet_interfaces/msg|srv|action/` 加文件，并**同步登记到 `CMakeLists.txt`**（`rosidl_generate_interfaces` 的列表），否则编译不生成。
> `.msg` 只允许整型常量，**不允许字符串常量**（我已规避）。

## 6. 你在 Ubuntu 上的第一步（验收我交付的东西）

```bash
# 1. 把 moopet_ws 整目录拷到 Ubuntu（如 ~/robotdog/moopet_ws），保留目录结构
# 2. 装 ROS2 Humble（步骤见 docs/部署文档.md），然后：
cd moopet_ws
source /opt/ros/humble/setup.bash

# 3. 编译
colcon build --symlink-install --packages-select \
  moopet_interfaces moopet_backpack moopet_dog
source install/setup.bash

# 4. 验接口（15 项都应 OK）
bash scripts/smoke_test.sh        # 内含 interface show 校验 + T/S/A 冒烟

# 5. 边界用例（无 ROS，验证引擎）
bash scripts/boundary_test.sh     # 期望 8/8 passed

# 6. 全自动 demo
bash scripts/start_demo.sh        # 单机：仿真感知→加点→升级→状态卡，Ctrl+C 结束
```

### 已知注意事项（避免踩坑）
- 所有脚本用 `bash scripts/xxx.sh` 调用即可（不依赖可执行位）。
- 日志在 `logs/`，demo 各节点分开落盘；状态卡看 `logs/dog_state_mgr.log`，结算看 `logs/dog_exp_engine.log`。
- 数据库默认 `~/.moopet/moopet.db`，可 `DB_PATH=/tmp/xx.db ./start_demo.sh` 覆盖。
- 双机联调：两台同局域网、相同 `export ROS_DOMAIN_ID`；防火墙放行 `udp 7400-7500`（Fast-DDS）。
- 中文日志：Ubuntu 终端默认 UTF-8 正常显示（Windows 侧出现的乱码只是本地 GBK 控制台问题，与代码无关）。
- `start_demo.sh --machine dog|backpack` 双机运行时，两侧都建议 `--demo`（默认开），事件跨机互通即联调成功。
- `smoke_test_node --role both|server|client`：both=单机自检；server/client 分开跑=双机往返。

## 7. 设计约定（后续开发请沿用）

1. **纯逻辑与 ROS 分离**：业务规则放无 ROS 依赖的模块（如 `exp_engine.py`），任意机器可单测；ROS 只做包装/订阅/发布。
2. **仿真节点 demo 化**：sensor/odom 节点支持 `--demo [--demo-delay 秒]`，按时间轴自动连发，保证演示可复现、可录屏。
3. **接口即契约**：Topic 名称、频率、字段以 `docs/interface_spec.md` 为准；新增来源要同步更新该表与 `exp_engine.SOURCES`。
4. **经验规则集中在 `exp_engine.py` 常量区**：SOURCES(7 来源 周上限) / GUIDE_EXP / WEEKLY_MAX_EXP / MAX_LEVEL / MIN_DECAY_LEVEL / DECAY_AFTER_DAYS，改动只碰这一处。
5. **命名**：msg 以 `Msg` 结尾、srv 以 `Srv` 结尾、action 以 `Action` 结尾；节点 `xxx_node.py`，`setup.py` 的 `entry_points` 注册后 `ros2 run` 才能用。

## 8. 下一步（W3+，参考排期）

- **W3 答题+基础闭环**：`quiz_node` 出题/判题（题库按等级解锁：语文/数学=3级…）、难度降档（连错3题降一档）、`/dog/combo` 结算、`/backpack/tts_speak` 打通语音问答。
- **W4 情感决策+日记**：行为决策引擎（性格 粘人/独立/话痨/安静）、情感账户、主动关怀、纪念日；成长日记/周报写 SQLite。
- **W5 火花+综合**：火花机制（连续天数/0-5档/续火/熄灭/挽回）、每日任务、九项成就、里程碑解锁。
- **W6 稳定性+上线**：真实局域网联通、断连重连、`start_demo.sh` 一键最终化、刷 100 级/抽奖概率/周上限压力。
- **W7 打磨+提交**：部署文档最终化、数据一致性校验、演示录屏。

> 我已在 W2 把 `moopet_interfaces` 里 QuizMsg/QuizAnswerMsg/StreakMsg/DogCombo.srv/TtsSpeak.action 与 `schema.sql` 的 quiz_record / daily_task / daily_reward / streak 表预先定义好，W3-W5 可直接在其上扩展，无需改接口层。

## 9. 若出问题先查这里

| 现象 | 排查 |
|------|------|
| `colcon build` 报接口找不到 | 确认 `moopet_interfaces/CMakeLists.txt` 的 msg/srv/action 列表与文件一致；先单独编译 interfaces |
| `ros2 run` 找不到命令 | 确认 `source install/setup.bash`；`setup.py` entry_points 已注册 |
| 双机看不到对方话题 | 同 `ROS_DOMAIN_ID`、同网段、防火墙放行 7400-7500 |
| demo 无加点日志 | 看 `logs/` 各节点日志；sensor 用 `--demo` 才自动触发；确认 exp_engine 已订阅（启动需快于事件，可加大 `--demo-delay`） |
| 里程不结算 | `OdomMsg.distance` 为累计值，exp_engine 按增量累加、每 50m 结算；节点重启里程归零会被判为重置而忽略 |
