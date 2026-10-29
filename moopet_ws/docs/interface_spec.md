# 感知节点接口规范（W2 · 李文扬；W3 增补答题/决策接口）

> 对齐 狗1.md 方案 §4 感知模块，定义各 Topic 消息字段与频率，供双机（狗↔背包）联调使用。
> 所有自定义类型见 `moopet_interfaces`。

## 一、Topic 一览

| Topic | 类型 | 频率 | 发布端 | 说明 |
|-------|------|------|--------|------|
| `/backpack/heartbeat` | `HeartbeatMsg` | **5s** | 背包 | 心跳保活，狗侧监测断连 |
| `/backpack/audio/voice_cmd` | `VoiceCmdMsg` | 事件触发 | 背包 audio | 模拟语音命令（intent） |
| `/backpack/vision/expression` | `VisionMsg` | 事件触发 | 背包 vision | 表情识别结果 |
| `/backpack/vision/motion` | `VisionMsg` | 事件触发 | 背包 vision | 动作识别（握手等） |
| `/backpack/env/air_quality` | `AirQualityMsg` | 事件触发 | 背包 env | 空气质量 + warning_level |
| `/backpack/touch/zone` | `TouchEventMsg` | 事件触发 | 背包 touch | 触摸分区事件 |
| `/dog/odom` | `OdomMsg` | **10Hz** | 狗 odom | 里程（遛狗统计口径） |
| `/dog/state` | `DogStateMsg` | 加点/升级后 | 狗 exp_engine / quiz | 养成结算状态广播（W3 起 quiz 也发布） |
| `/dog/quiz/question` | `QuizMsg` | 事件触发 | 狗 quiz | 出题（W3） |
| `/dog/quiz/answer` | `QuizAnswerMsg` | 事件触发 | 答题方 | 作答 → 判题（W3） |
| `/dog/decision/event` | `DecisionEventMsg` | 事件触发 | quiz 等 | 决策引擎入口事件（W3） |

## 二、服务 / 动作

| 类型 | 名称 | 定义 | 说明 |
|------|------|------|------|
| Service | `/dog/action` | `DogAction.srv` | 狗执行动作（投影/通讯/握手/指引），返回加点结果 |
| Service | `/dog/cmd/walk` | `std_srvs/SetBool` | 走/停控制（odom） |
| Service | `/dog/combo` | `DogCombo.srv` | 答题连击结算（W3，web 判题桥接） |
| Action | `/backpack/tts_speak` | `TtsSpeak.action` | 背包 TTS 播放（W3 决策→语音联动） |

## 三、关键字段口径

### `/dog/quiz/question`（W3 出题）
```
question_id / category / difficulty(1~5) / question / options[] / correct_answer
```
> 题库按等级解锁：语文/数学=3级、英文/常识=8级、科学/编程=15级、自定义=20级。
> 连错 3 题难度降一档；连击在连续答对 5 / 10 题触发连击奖励（+50 / +100，免周上限）。

### `/dog/decision/event`（W3 决策引擎入口）
```
event_type   如 quiz_answer / pet / handshake / call / walk / air_quality / guide
event_value  如 answer_correct / answer_wrong / ventilated / ...
params       JSON 文本，如 {"category":"语文","combo":5,"difficulty":3}
```
> 发布端（如 quiz_node）把事件挂到决策引擎入口；`decision_engine_node` 订阅后经
> 行为决策引擎（Behavior Tree 骨架）路由出反应 → TTS / `/dog/action` 联动。

### `/backpack/heartbeat`（5s）
```
node_id    背包节点名
seq        递增序号
cpu_percent / mem_percent  机器负载
alive      恒 true
```
> 狗侧超 15s 未收到 → 判定背包离线（断连恢复，W6 完善）。

### `/dog/odom`（10Hz，遛狗统计用）
```
x / y / yaw      位姿（仿真）
linear_vel       当前线速度 m/s
distance         累计里程 m（断点续计）
```
> 口径：`distance` 累计增加，每满 **50m** → 运动类·散步 `+10` 经验（周上限 500）。

### `/backpack/env/air_quality`（通风提醒）
```
pm2_5 / tvoc / co2    实测值
warning_level         0 正常 / 1 轻度 / 2 重度（触发通风提醒）
ventilated            用户完成通风=true（→ 居家类·通风 +10 经验）
```

### `/backpack/audio/voice_cmd`（intent 语义）
```
intent: guide(使用指引) / call(呼唤) / walk(散步) / handshake(握手) / talk(聊天)
emotion: happy / sad / angry / tired / neutral
```

### `/backpack/vision/motion`（握手）
```
detection = "motion", value = "handshake"  → 互动类·握手 +10 经验
```

### `/backpack/touch/zone`（抚摸）
```
gesture = pat / stroke  → 互动类·抚摸 +10 经验（周上限 200）
```

## 四、经验来源 → 感知事件 归一映射（8 种）

| # | 来源 source | 感知事件 | 单位经验 | 周上限 |
|---|-------------|----------|---------|--------|
| 1 | 散步 `walk` | `/dog/odom` 每 50m | 10 | 500 |
| 2 | 通风 `ventilate` | `/backpack/env/air_quality.ventilated=true` | 10 | 100 |
| 3 | 投影 `projector` | `/dog/action` 服务 | 10 | 100 |
| 4 | 通讯 `communication` | `/dog/action` 服务 | 10 | 100 |
| 5 | 抚摸 `pet` | `/backpack/touch/zone` pat/stroke | 10 | 200 |
| 6 | 握手 `handshake` | `/backpack/vision/motion`=handshake | 10 | 200 |
| 7 | 呼唤 `call` | `/backpack/audio/voice_cmd`=call | 10 | 200 |
| 8 | 答题 `quiz` | `/dog/quiz/answer` 判对（W3 新增） | 10 | 200 |

> 使用指引 `guide` 一次性 +100；全局每周经验上限 2000；等级封顶 100；
> 连续 7 天未使用逐天衰减、最低 30 级（规则见 狗2.md）。
> 答题连击奖励（5 连 +50 / 10 连 +100）与成就、抽奖奖励**不计入周上限**
> （`exp_engine.WEEKLY_EXEMPT_SOURCES`）。

## 五、双机部署口径

- 两台设备同一局域网，`export ROS_DOMAIN_ID=<相同值>`（默认 0）。
- 狗机跑 `moopet_dog` 节点，背包机跑 `moopet_backpack` 节点，消息跨机可见即联调通过。
- 仿真阶段两台可合并为单机运行（loopback 自动发现）。

## 六、W4 增补：决策行为口径（无新增接口）

W4 决策引擎完稿**不新增接口**，全部复用 W1 已定义接口：

- `/backpack/tts_speak`（TtsSpeak.action）由 W4 新增的背包 `tts_node` 实现服务端；
  决策引擎的每条反应（tts_text）经此播报，result.duration 为模拟播报时长
  （= max(0.5, 字数×0.08)/语速），接真实 TTS 时仅替换内部实现、口径不变。
- 决策反应 → `/dog/action` 动作联动沿用 W3（如握手反应回执 handshake 动作）。
- 决策引擎每 60s 定时主动检查（长沉默主动关怀 / 早安晚安 / 纪念日 / 性格播报），
  触发时同样走 `/dog/decision/event` 同款反应落地路径（TTS + 动作），不新增 Topic。
- 成长日记写入 `diary` 表（与经验库同库，`db_path` 参数），一天一条（UNIQUE(date)），
  供前端日记页/周报 API 读取（牛浩然 W4 对接）。

## 七、W5 增补：火花计划口径（无新增接口）

W5 火花计划**不新增 Topic/Service/Action**，全部复用 W1 已定义接口 + 既有表：

- **表（schema.sql W1 已建）**：`streak`（连续陪伴 0~5 档）、`daily_task`（每日任务）、
  `daily_reward`（签到/抽奖）；`spark_meta`（保底计数/提醒去重，SparkEngine 自建兜底）。
- **SparkEngine**（`decision/spark.py`）：
  - 连续陪伴：`register_activity` 续火 / `settle_missed_days` 断档熄灭 / 回归挽回；
    档位 = 连续天数 // 7，封顶 5 档（`level_from_days`）。
  - 三档提醒：18:00 / 21:00 / 23:00，当天未续火时由决策引擎 `on_tick(spark_reminder=…)`
    催续火（同档当天去重，`mark_reminded`）。
  - 每日任务：每天 4 点随机刷新 2 个；全部完成 → `+2` 次抽奖机会。
  - 签到/抽奖：每天签到 `+1` 次机会；概率 40/30/20/9.5/0.5%，
    奖 20/50/100/500/10000 经验，**200 次保底出超级大奖**；
    抽奖经验经 `exp_engine.lottery_gain` 加点，**不计入每周经验上限**（weekly-exempt）。
  - 里程碑解锁：核心功能前 10 级解锁完成、后续每 5 级一项到 30 级；
    附带 LED 灯位 / 肤位外观**数据占位**，供前端主题/皮肤切换消费。
- **双栈集成**：火花提醒 / 状态事件并入决策引擎 BT 主树（`build_spark_tree`），
  与纪念日/仪式/主动关怀统一调度；互动事件同时驱动 `register_activity` 与每日任务进度
  （答对才算 quiz、通风完成才算 ventilate），无新增接口。

## 八、已定义但尚未接入的接口（W1 预置，如实登记）

W1 一次性定义了 16 项接口，其中 3 项目前还没有任何节点发布/订阅。
登记在此，避免"实现了但没人知道它的状态"，也便于 W6+ 决定是否启用：

| 接口 | 设计用途 | 当前状态 |
|------|----------|----------|
| `EmotionMsg.msg` | 情绪状态广播（表情/语音情绪识别的落地 Topic） | 待接入：情绪已在决策引擎内部使用（`set_state(emotion=…)`），Topic 未发布 |
| `IrCodeMsg.msg` | 红外遥控码（实体机遥控器信号） | 待接入：需实体机硬件，软件侧暂不模拟 |
| `StreakMsg.msg` | 连续陪伴天数广播 | 待接入：数据已由 `SparkEngine` 维护（`streak` 表），广播 Topic 未发布 |

> 该清单由 `tools/link_lab/contract.py` 的可执行契约测试守护：
> 规范与实现任何一侧变动不一致，测试即失败。

