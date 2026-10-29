# 养成系机械狗 · moopet_ws

**W1 地基 + W2 模拟感知层 + W3 答题闭环 + W4 情感决策 + W5 火花计划与综合**（李文扬条目，Ubuntu 22.04 + ROS2 Humble）

目标：在**不依赖真实机械狗硬件**的情况下，用 ROS2 分布式仿真 + 模拟数据
跑通「感知 → 决策 → 成长」软件闭环（对应排期 9.18 前核心目标）。

## 快速开始

**Windows（无 ROS，只装 Python 即可）**
```bat
python standalone_demo_w5.py            :: W1→W2→W3→W4→W5 一条时间轴自动演示（推荐：火花/三档提醒/每日任务/抽奖/里程碑）
python standalone_demo_w4.py            :: W1→W2→W3→W4 情感决策演示（性格/情感账户/主动关怀/日记）
python standalone_demo_w3.py            :: W1→W2→W3 答题闭环演示
python standalone_demo_w3.py --interactive  :: 互动答题养狗模式
python standalone_demo.py               :: W2 独立演示（LV.1→LV.17）
```

**Ubuntu（ROS2 Humble）**
```bash
cd moopet_ws
bash scripts/start_demo.sh     # 一键：编译 + 拉起全部节点（含 backpack TTS）+ demo 场景 + 实时日志
bash scripts/stop_demo.sh      # 停止
```

demo 全程可见：仿真感知(触摸/表情/语音/空气质量/心跳) → 里程遛狗 →
经验结算(8来源归一/周上限) → 升级/成就 → W3 答题(等级解锁/连击/难度降档) →
W4 行为决策引擎完稿（性格演化/情感账户/主动关怀/早安晚安/纪念日/成长日记）→
**W5 火花计划（连续陪伴续火/熄灭/挽回 + 三档提醒 18:00/21:00/23:00 + 每日任务 +
签到抽奖(200 次保底) + 里程碑解锁 LED/肤位占位，双栈并入决策引擎 on_tick 调度）→
决策反应 → 背包 TTS 语音播报 + /dog/action 动作 → 状态卡实时刷新**。

## 文档

| 文档 | 说明 |
|------|------|
| `docs/UBUNTU_AGENT_HANDOFF.md` | ★接续开发交接说明（Ubuntu Agent 必读：已验/未验清单、第一步、坑、约定） |
| `docs/interface_spec.md` | 感知节点接口规范（Topic 字段/频率/归一映射；W3 答题/决策 + W4 决策行为 + W5 火花口径增补） |
| `docs/进度汇报_W3.md` | W3 进度汇报（答题 + 基础闭环） |
| `docs/进度汇报_W4.md` | W4 进度汇报（决策引擎完稿 + 情感账户 + 双端联调 + 成长日记） |
| `docs/进度汇报_W5.md` | ★W5 进度汇报（火花计划 + 双栈集成 + 里程碑解锁玩法） |
| `docs/演示脚本_W3.md` | W3 演示方案（汇报 + 简单示意 + 时间轴解说词 + 容错） |
| `docs/演示详解与开发承接指南.md` | ★★W3 PPT 配套详稿：逐页讲稿 + 项目思路 + W4~W7 及实体机承接清单 |
| `docs/任务清单_W3_牛浩然.md` / `docs/任务清单_W3_黄鑫禹.md` | W3 成员任务清单（历史，供对照） |
| `docs/任务清单_W4_牛浩然.md` | 给 牛浩然（前端/后端）：W4 日记/周报 API + 心情时间序列 + 前端日记页/心情曲线 |
| `docs/任务清单_W4_黄鑫禹.md` | 给 黄鑫禹（创意/测试）：W4 角色串联演示 + 手感实测 + 调参建议 |
| `docs/任务清单_W5_牛浩然.md` | ★★照会·给 牛浩然：W5 火花/每日任务/成就/抽奖签到 API + 前端火花/任务/成就/主题皮肤 |
| `docs/任务清单_W5_黄鑫禹.md` | ★★照会·给 黄鑫禹：W5 端到端回归（遛狗→抚摸→答题→升级→火花）+ 边界用例 |
| `docs/部署文档.md` | ROS2 安装 / msg 编译 / 双机连接 / 跑 demo |
| `scripts/boundary_test.sh` | 边界用例合集（W2 经验引擎 + W3 题库/答题/决策 + W4 情感决策 + W5 火花/集成） |
| `演示_W3汇报.pptx` | W3 演示汇报 PPT（由 `scripts/make_w3_ppt.py` 生成） |
| `W3工作汇报_李文扬.pptx` | W3 向上级汇报 PPT（历史，由 `scripts/make_w3_upreport_ppt.py` 生成） |
| `W3-W4工作汇报_李文扬.pptx` | W3+W4 合并向上级汇报 PPT（由 `scripts/make_w34_upreport_ppt.py` 生成） |
| `W3-W4工作汇报_李文扬_明日方舟版.pptx` | 同上 · 明日方舟 UI 风格版（由 `scripts/make_w34_arknights_ppt.py` 生成） |
| `W5工作汇报_李文扬.pptx` | ★★W5 向上级汇报 PPT（火花计划 + 综合；由 `scripts/make_w5_upreport_ppt.py` 生成，含 `_ppt_overflow_check.py` 溢出自检） |
| `web/index.html`（含 `web/lib/`） | HTML 版汇报 · 基于 [html-ppt-skill](https://github.com/lewislulu/html-ppt-skill) 框架：47 种动画 + Canvas 背景 FX + presenter/概览 + 键盘快捷键；`←→`翻页 · `F`全屏 · `S`演讲者 · `O`概览 · `T`换主题 · `A`切动效 |
| `fonts/` + `scripts/install_fonts.ps1` | 字体（方舟 token 方案）：标题=Noto Serif SC、正文=Noto Sans SC、数据=Consolas（另有霞鹜文楷 LXGW WenKai 备用）；演示机先跑该脚本装字体再开 PPT |
| `docs/汇报讲稿_W3-W4_李文扬.md` | W3+W4 合并汇报配套讲稿：逐页边看边读 + 领导追问 Q&A + 数字速查 |

## 交付内容（对齐排期验收物）

- [x] W1：`moopet_ws` 三包骨架 + 全部自定义 msg/srv/action（15 项）+ 冒烟测试（T/S/A）
- [x] W2：心跳 `/backpack/heartbeat`(5s)、里程 `/dog/odom`(10Hz)、4 仿真感知节点
- [x] W2：`exp_engine` 7 来源归一加点 + 周上限 + 衰减(最低30级) + 升级/成就 + 边界用例
- [x] W3：`quiz_node` 集成（等级解锁题库/判题/连击 5·10/难度降档/`/dog/combo` 桥接）
- [x] W3：行为决策引擎骨架（Behavior Tree 目录结构 + 空节点 + quiz 反应节点）
- [x] W3：决策引擎入口 `/dog/decision/event` + `decision_engine_node`（事件路由 + 动作/TTS 联动）
- [x] W4：**行为决策引擎完稿**——性格演化（依恋/表达双轴 → 粘人/独立/话痨/安静）、
      情感账户（0~100 + 闲置衰减 + 冷淡/平衡/依赖三档 + 和好机制）、
      主动关怀（长沉默/深夜话术）、早安晚安/等级里程碑/自定义纪念日（按性格说不同的话）
- [x] W4：成长日记（`decision/diary.py`：按天统计互动 → 第一人称日记 → `diary` 表落库，节点跨日自动写）
- [x] W4：背包 TTS 节点 `tts_node`（`/backpack/tts_speak` 动作服务端）——决策输出 → 动作+语音 双端联调闭环
- [x] W5：**火花计划引擎**（`decision/spark.py`）——连续陪伴续火/熄灭/挽回、0~5 档佩戴、
      三档提醒 18:00/21:00/23:00、每日任务（4 点随机刷新）、签到/抽奖（40/30/20/9.5/0.5%，
      200 次保底超级大奖，经验不计周上限）、里程碑解锁玩法（LED 灯位/肤位数据占位）
- [x] W5：**双栈集成**——火花提醒/状态事件并入决策引擎 BT 主树（`build_spark_tree`），
      与纪念日/仪式/主动关怀统一调度；互动事件同时驱动连续陪伴与每日任务进度
- [x] W5：`exp_engine` 新增 weekly-exempt `lottery` 来源（`lottery_gain`，抽奖经验不计周上限）
- [x] W5：`standalone_demo_w5.py` + 单测新增 28 项（累计 **75 项**全过）
- [x] `scripts/start_demo.sh` 一键启动（含 quiz / decision / **backpack TTS** / 火花 节点与场景）
- [x] 接口规范 + 进度汇报（W3/W4/W5）+ 冒烟/边界脚本 + 成员照会（牛浩然/黄鑫禹）

## 双机联调

```bash
# 狗机                         # 背包机（同一局域网，相同 ROS_DOMAIN_ID）
export ROS_DOMAIN_ID=42        export ROS_DOMAIN_ID=42
bash scripts/start_demo.sh --machine dog
                               bash scripts/start_demo.sh --machine backpack
```
