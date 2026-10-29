# 场景模型来源与许可

## Kenney Nature Kit（CC0 1.0，公有领域）
- 来源：https://kenney.nl/assets/nature-kit
- 许可：Creative Commons CC0 1.0 —— 可自由商用、可修改、**无需署名**
- 本目录只挑取了场景需要的 29 个 GLB（树/灌木/草/花/蘑菇/石/树桩），合计约 280 KB

## 为什么选这套
- **纯顶点色 + `KHR_materials_unlit`**：没有贴图文件，平涂质感正好贴合本项目的版画/羊皮纸风
- 体积很小：29 个文件不到 300 KB，进场一次载完
- 低多边形：与手搓的"纸盒"建筑是同一路审美，不会打架

## 替换说明
本项目对模型只做三件事：按包围盒把高度归一到目标值、脚底对齐地面、绕 Y 轴随机转个角度。
若要换成别的模型包，改 `web/src/world/models.js` 里的 `MODELS_BY_KIND` 与 `TARGET_HEIGHT` 即可，
场景数据（`scenes/*.js`）不用动。模型缺失时自动退回程序生成的占位道具，不会白屏。
