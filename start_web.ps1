$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8

# 长夜月·机械狗 —— 本地一键启动（双击 start_web.bat 走这个脚本）
# 顺序要紧：**先保剧情模式，再看主服务**。反过来的话，"主服务还活着、gal 挂了"时
# 双击会直接开浏览器退出，gal 永远起不来，剧情模式就是死的。
# 本文件必须存成 UTF-8 with BOM + CRLF（无 BOM 时 PowerShell 5.1 按 ANSI 读，中文乱码）。

$root    = $PSScriptRoot
$galDir  = Join-Path $root 'gal'
$webDir  = Join-Path $root 'web'
$srvDir  = Join-Path $root 'server'
$port    = 8080
$galPort = 18080
$url     = "http://127.0.0.1:$port/"
$galUrl  = "${url}gal/web/index.html"

function Test-Port([int]$p) {
  try {
    $c = New-Object Net.Sockets.TcpClient
    $c.Connect('127.0.0.1', $p)
    $c.Close()
    return $true
  } catch { return $false }
}

function Wait-Port([int]$p, [int]$seconds, [string]$what) {
  for ($i = 0; $i -lt ($seconds * 2); $i++) {
    if (Test-Port $p) { return $true }
    Start-Sleep -Milliseconds 500
  }
  Write-Host "  [x] $what 没能在 $seconds 秒内起来（端口 $p）" -ForegroundColor Red
  return $false
}

Write-Host ''
Write-Host '  长夜月·机械狗  本地启动' -ForegroundColor Yellow
Write-Host '  ----------------------------------------'

# ---------- 1. 剧情模式（galgame）静态服务器 ----------
if (Test-Port $galPort) {
  Write-Host "  [1] 剧情模式服务：已经在 $galPort 端口跑着。"
} else {
  if (-not (Test-Path (Join-Path $galDir 'web\index.html'))) {
    Write-Host "  [!] 找不到 $galDir\web\index.html，剧情模式会打不开（游戏本体照常能玩）。" -ForegroundColor Yellow
  }
  Write-Host "  [1] 剧情模式服务：正在启动（端口 $galPort）..."
  Start-Process -FilePath 'python' `
    -ArgumentList '-m', 'http.server', "$galPort" `
    -WorkingDirectory $galDir `
    -WindowStyle Minimized
  if (-not (Wait-Port $galPort 10 '剧情模式服务')) { exit 1 }
  Write-Host '      ... 好了'
}

# ---------- 主服务已经在跑，就只把浏览器开了 ----------
if (Test-Port $port) {
  Write-Host "  [i] 主服务已经在 $port 端口跑着，直接开浏览器。" -ForegroundColor Cyan
  Write-Host "  ✓ $url" -ForegroundColor Green
  Write-Host "    剧情模式：$galUrl"
  Write-Host ''
  Start-Process $url
  exit 0
}

# ---------- 2. 前端构建产物 ----------
if (Test-Path (Join-Path $webDir 'dist\index.html')) {
  Write-Host '  [2] 前端构建产物：在。'
} else {
  Write-Host '  [2] 前端构建产物：还没有，先构建（第一次会慢一点）...'
  Push-Location $webDir
  try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build 失败（退出码 $LASTEXITCODE）" }
  } finally { Pop-Location }
}

# ---------- 3. 主服务 ----------
Write-Host "  [3] 主服务：正在启动（端口 $port）..."
$env:MOOPET_PORT = "$port"
$env:MOOPET_DATABASE_URL = "sqlite:///" + (Join-Path $srvDir 'data\dev.db').Replace('\', '/')
Start-Process -FilePath 'python' `
  -ArgumentList 'run_local.py' `
  -WorkingDirectory $srvDir `
  -WindowStyle Minimized

if (-not (Wait-Port $port 25 '主服务')) { exit 1 }

Write-Host '  ----------------------------------------'
Write-Host "  ✓ 起好了：$url" -ForegroundColor Green
Write-Host "    剧情模式：$galUrl"
Write-Host '  （关掉那两个最小化的窗口就是关服务。）'
Write-Host ''
Start-Process $url
