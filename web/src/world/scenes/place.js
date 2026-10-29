/* 用"屏幕坐标"摆场景
   ------------------------------------------------------------
   开放世界最反直觉的一点：**世界坐标 (x,z) 和画面位置不是一回事**。
   相机转到 yaw=-0.18 之后，"正前方"在世界里是 (0.179, -0.984)，
   所以往 +x 走 500 格，在画面上其实是往右偏 + 稍稍往远。
   第一版直接拍脑袋写世界坐标，摆完截图一看全糊在画面底部——
   因为那一片是"狗身后"，会被透视放大成巨物。

   现在改成先想"前方多少格、左右多少格"，再由这个函数反算世界坐标：

     const at = placer(SCENE.spawn, SCENE.camera.yaw);
     { kind: 'bench', ...at(220, -380) }   // 前方 220、左侧 380

   camera.js / world.js / tools/layout_check.mjs 用的是同一套公式，
   所以这里写多少，检查器就算多少。
   */

export function placer(spawn, yaw) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);   // 屏幕上方 = 世界方向
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);    // 屏幕右方
  return (F, R) => ({
    x: Math.round(spawn.x + fx * F + rx * R),
    z: Math.round(spawn.z + fz * F + rz * R),
  });
}
