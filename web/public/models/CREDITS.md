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

## 长夜月广场建筑

`landmark/plaza-roofs.glb` 的屋顶网格和瓦纹图集由
`web/tools/build_plaza_roofs.py` 在 Blender 中生成，属于 Moopet 原创场景资产。

`landmark/plaza-architecture.glb` 包含原创商铺立面、月塔和喷泉。
网格与顶点色由 `web/tools/build_plaza_architecture.py` 在 Blender 中生成。

## 长夜月公园景观

`landmark/park-landscape.glb` 包含原创的睡莲池和野花组，由
`web/tools/build_park_landscape.py` 在 Blender 中生成。

`landmark/park-props.glb` 中的木栈台、白鹭、两种树、木栅栏、长椅、花灌木
和岩石来自 [kayquer / Low Poly City Kit](https://github.com/kayquer/kit-cidade-lowpoly/tree/d9de7e25d476d8b8572971840b129c28a68e9cf7)，
采用 [CC0 1.0](https://github.com/kayquer/kit-cidade-lowpoly/blob/d9de7e25d476d8b8572971840b129c28a68e9cf7/LICENSE)。
`web/tools/build_park_props.py` 负责适配 Moopet 的配色与尺寸、剔除原模型的独立地块及水块，并生成原创月石。

## 广场和狗窝扩建

`landmark/world-expansion.glb` 的夜市摊档、灯串、望月亭、墙板、沙发、书架、隧道和围栏为本项目原创，
由 `web/tools/build_world_expansion.py` 在 Blender 中生成。
