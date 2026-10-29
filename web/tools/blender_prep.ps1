# 把 Blender 导出的 glb 整理成游戏就绪的资产（拍平变换 + 按高度归一化 + 落地居中）
#
# 用法：
#   .\tools\blender_prep.ps1 -In 你的模型.glb -Out 输出.glb -Height 540
#   .\tools\blender_prep.ps1 -In 你的模型.glb -Out 输出.glb          # 不归一化高度，只拍平落地
#
# 为什么要有它：
#   你在 Blender 里为了方便缩放/挪动物体，那些变换会留在导出的 glb 里。
#   游戏那边其实会按包围盒自动归一化，但**拍平之后一切都变得可以直接相信**——
#   量尺寸、算碰撞盒、跨工具核对都不会再因为"变换挂在哪一层"而出错。
#
#   -Height 给了就等比缩放到这个高度（世界单位：狗 135 / 长椅 260 / 楼 400~600 / 树 540）。
#   脚本用的是 Blender 无头模式：**不开窗口、不抢键鼠**，跑完就退出。

param(
  [Parameter(Mandatory = $true)][string]$In,
  [Parameter(Mandatory = $true)][string]$Out,
  [double]$Height = 0,
  [string]$Blender = ''
)

$ErrorActionPreference = 'Stop'

if (-not $Blender) {
  $cand = @()
  $cand += Get-ChildItem 'C:\Program Files\Blender Foundation' -Directory -ErrorAction SilentlyContinue |
           ForEach-Object { Join-Path $_.FullName 'blender.exe' }
  $cand += Get-ChildItem 'E:\Program Files\Blender Foundation' -Directory -ErrorAction SilentlyContinue |
           ForEach-Object { Join-Path $_.FullName 'blender.exe' }
  $cand += (Get-Command blender -ErrorAction SilentlyContinue).Source
  $Blender = $cand | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}
if (-not $Blender) { throw '找不到 blender.exe，用 -Blender 指定完整路径' }

# 脚本在 <repo>/_refs/ 下，而本文件在 <repo>/w6/web/tools/ → 要往上**三层**
$repo = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$script = Join-Path $repo '_refs\blender_prep.py'
if (-not (Test-Path $script)) { throw "找不到预处理脚本: $script" }

# ⚠️ 别用 $args 这个名字：它是 PowerShell 的**自动变量**，赋值会报
#    "Missing argument in parameter list"，而且一点输出都没有（我踩过）。
$blArgs = @('--background', '--factory-startup', '--python', $script, '--',
            (Resolve-Path $In).Path, $Out)
if ($Height -gt 0) { $blArgs += $Height }

Write-Host "Blender : $Blender"
Write-Host "输入    : $In"
Write-Host "输出    : $Out"
if ($Height -gt 0) { Write-Host "目标高度: $Height" }

& $Blender @blArgs
if ($LASTEXITCODE -ne 0) { throw "Blender 退出码 $LASTEXITCODE" }
Write-Host "完成。接着跑：node tools/glb_inspect.mjs `"$Out`" 复核尺寸/材质"
