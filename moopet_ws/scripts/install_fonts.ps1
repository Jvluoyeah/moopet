# 安装汇报 PPT 所需字体
#   标题/卡头/表头：思源宋体 Noto Serif SC（Bold/Black/Regular）
#   正文/副题：霞鹜文楷 LXGW WenKai（Regular）
# 用途：W3-W4工作汇报_李文扬_明日方舟版.pptx
# 用法：右键"使用 PowerShell 运行"，或终端执行
#      powershell -ExecutionPolicy Bypass -File install_fonts.ps1
$ErrorActionPreference = 'Stop'
$fontsDir = Join-Path $PSScriptRoot '..' 'fonts'
$fontsDir = (Resolve-Path $fontsDir).Path
$dest = "$env:LOCALAPPDATA\Microsoft\Windows\Fonts"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$reg  = "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts"

# 文件名 -> 注册用家族名（含扩展名类型 TrueType / OpenType）
$map = @{
  'NotoSerifSC-Regular.otf' = 'Noto Serif SC|OpenType'
  'NotoSerifSC-Bold.otf'    = 'Noto Serif SC Bold|OpenType'
  'NotoSerifSC-Black.otf'   = 'Noto Serif SC Black|OpenType'
  'NotoSansSC-Regular.otf'  = 'Noto Sans SC|OpenType'
  'NotoSansSC-Bold.otf'     = 'Noto Sans SC Bold|OpenType'
  'LXGWWenKai-Regular.ttf'  = 'LXGW WenKai|TrueType'
}

Write-Host "==> 检索字体目录：$fontsDir"
foreach ($f in $map.Keys) {
  $src = Join-Path $fontsDir $f
  if (-not (Test-Path $src)) { Write-Warning "缺少 $f，跳过"; continue }
  $dstPath = Join-Path $dest $f
  Copy-Item $src $dstPath -Force
  $parts = $map[$f].Split('|')
  $valName = "{0} ({1})" -f $parts[0], $parts[1]
  New-ItemProperty -Path $reg -Name $valName -Value $dstPath -PropertyType String -Force | Out-Null
  Write-Host ("  已安装：{0}  ->  {1}" -f $f, $valName)
}

Write-Host ""
Write-Host "==> 完成。请重启 PowerPoint（或退出重登）让新字体生效。"
Write-Host "    若在其它机器演示，先拷贝 fonts/ 目录到该机再运行本脚本。"
