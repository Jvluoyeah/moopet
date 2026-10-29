# 第三方许可与素材声明

根 [LICENSE](LICENSE) 仅覆盖本仓库贡献者有权授权且未另行声明的原创代码和技术文档。它不替代第三方许可证，不表示所有资源已取得再分发许可，也不限制第三方独立内容在其自身许可下已经授予的权利。

本清单记录已识别的来源和发布检查事项，不是完整授权审计或不侵权保证。贡献者新增依赖、移植代码或素材时，应补充来源、版权、实际许可、适用文件及修改内容。

## 1. abstract-brawl 格斗代码

- 上游项目：[XzJoshZ/abstract-brawl](https://github.com/XzJoshZ/abstract-brawl)。
- 原始版权与作者：`Copyright (c) 2026 Xz乔希`；[作者主页](https://space.bilibili.com/5859321)。仓内部分源码使用账号 `XzJoshZ` 标注来源。
- 实际许可：**抽象大乱斗 · 非商业学习交流许可 1.0**。允许非商业学习、修改和分享，要求保留许可、作者署名、第三方素材说明及修改说明；禁止商业用途。它不是 OSI 批准的开源许可证。
- 原始许可副本：[web/src/game/ab/LICENSE](web/src/game/ab/LICENSE)。
- 原始素材说明副本：[web/src/game/ab/ASSET_NOTICE.md](web/src/game/ab/ASSET_NOTICE.md)。
- 声明来源：[上游 LICENSE](https://github.com/XzJoshZ/abstract-brawl/blob/main/LICENSE)、[上游 ASSET_NOTICE.md](https://github.com/XzJoshZ/abstract-brawl/blob/main/ASSET_NOTICE.md)。副本按整理时读取的上游 `main` 文本保留，不据此断言仓内代码对应某个上游提交。

### 适用文件与本仓库修改

| 本地文件 / 范围 | 来源与修改说明 |
| --- | --- |
| `web/src/game/ab/` 中的参考引擎 JS | 用作移植对账的参考实现。按现有 `loadEngine.mjs` 声明，目录内参考引擎文件为上游原样复制；此处不是对历史字节一致性的审计结论。`loadEngine.mjs` 是本仓库的 Node 加载适配器。 |
| `web/src/game/rules.js` | 移植上游 `engine.js` 的物理与战斗规则，改为 Q8 定点、128Hz，适配本项目成长参数。 |
| `web/src/game/match.js` | 移植上游回合流程，改为本项目的确定性帧推进。 |
| `web/src/game/aiAB.js` | 移植上游 AI 逻辑，适配确定性模拟。 |
| `web/src/game/simAB.js` 中复用或改写的上游逻辑 | 集成本项目状态、模拟、单局流程和弹丸等逻辑，并用于快照、回放及联机。 |

以上是已识别范围，不应以文件不在 `ab/` 内或未列入表格为由，移除其他复制/衍生部分的上游许可要求。Moopet 的修改与适配不代表上游作者认可或背书本项目。

发布包含上述部分的源码或构建包时，必须一并保留上游许可、署名、素材说明和修改说明；不能仅附根许可证。上游素材声明中的目录和文档链接按**上游仓库**解释，其中部分文件并未随本仓库复制；原文中的 [羁绊手册](https://github.com/XzJoshZ/abstract-brawl/blob/main/docs/RELATIONSHIPS.md) 和 [搭档名称表](https://github.com/XzJoshZ/abstract-brawl/blob/main/docs/CP_NAMES.md) 不是素材授权证明。

## 2. 剧情播放器与 Spine

- 保留 [gal/web/SPINE-RUNTIMES-LICENSE.txt](gal/web/SPINE-RUNTIMES-LICENSE.txt) 的原始版权及许可条款；其中包含 Spine Editor 许可及再分发条件。
- 根非商业许可不能替代 Spine 或其他剧情运行时的原始条款，也不能自动满足其使用要求。
- `gal/` 的完整源码来源、剧情、角色、音视频及其他资源的再分发权仍须逐项人工核实。不能因运行时有许可证就认为全部剧情素材获准公开。

## 3. 字体、模型与其他资源

- `web/public/fonts/lxgw-bright/SOURCE.md` 记录 LXGW Bright 上游与 OFL-1.1；发布前应补齐并核对适用的完整字体许可和版权通知。
- `web/public/models/CREDITS.md` 记录部分 Kenney Nature Kit 资源为 CC0；该声明不覆盖全部模型，也不是对所有模型的统一授权。
- `web/public/` 中的角色、美术、场景、宣传页面资源，以及 `moopet_ws/fonts/`、`blender/` 和历史汇报中的图片/模板，应分别核实来源及再分发条件。
- `web/README.md` 中提到 adnovel.xin 的 MIT 是该参考项目的来源说明，不是本仓库整体许可。
- npm、Python 等依赖各自遵守原始许可；根非商业条款不替代依赖许可，分发时仍须保留其要求的通知。

免费、非商业、同人创作、生成式制作或标明出处都不能替代第三方权利人的必要授权。授权无法核实的内容不得仅凭根 LICENSE 宣称可公开、可独立复用或可商用。
