# VibeHub Desktop - 一键构建 / 启动 / 打包（Windows PowerShell）
#
# 默认行为（无参数）：构建三件套 → 拉起 cloud 模式后端 → 启动桌面壳。
# 即：双击或执行本脚本就能跑起完整桌面客户端。
#
# 用法：
#   .\build-desktop.ps1              # 构建 + 后端 + 桌面壳（默认，最常用）
#   .\build-desktop.ps1 -Quick       # 跳过构建，直接启动后端 + 桌面壳（已构建过时用）
#   .\build-desktop.ps1 -BuildOnly   # 仅构建，不启动
#   .\build-desktop.ps1 -NoBe        # 构建 + 桌面壳，不启动后端（后端已在跑）
#   .\build-desktop.ps1 -Dev         # 开发模式：后端 + 前端 dev server + 桌面壳(热更新)
#   .\build-desktop.ps1 -Pack        # 构建 + electron-builder 解包目录
#   .\build-desktop.ps1 -Dist        # 构建 + electron-builder NSIS 安装包
#
# 提示：若 PowerShell 执行策略受限，请用：
#   powershell -ExecutionPolicy Bypass -File .\build-desktop.ps1
#
[CmdletBinding()]
param(
    [switch]$Quick,         # 跳过构建，直接启动（已构建过时用）
    [switch]$BuildOnly,     # 仅构建，不启动任何服务
    [switch]$NoBe,          # 不启动后端（后端已在另一个窗口跑着）
    [switch]$Dev,           # 开发模式：前端走 Vite dev server 热更新
    [switch]$Pack,          # electron-builder --win --dir
    [switch]$Dist,          # electron-builder --win (NSIS 安装包)
    [switch]$ForceInstall   # 强制重新 npm install / pip install
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ROOT = $PSScriptRoot
$backendDir   = Join-Path $ROOT "backend"
$frontendDir  = Join-Path $ROOT "frontend"
$agentDir     = Join-Path $ROOT "local-agent"
$desktopDir   = Join-Path $ROOT "desktop"
$venvPython   = Join-Path $backendDir ".venv\Scripts\python.exe"

# ── 工具函数 ────────────────────────────────────────────────

function Write-Section($text) {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Cyan
}

function Invoke-In($dir, [scriptblock]$action, $label) {
    Push-Location $dir
    try {
        & $action
        if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "$label 失败 (exit $LASTEXITCODE)" }
    } finally { Pop-Location }
}

function Build-Node($dir, $name) {
    Write-Host "  [$name] " -NoNewline -ForegroundColor White
    $needInstall = $ForceInstall -or (-not (Test-Path (Join-Path $dir "node_modules")))
    if ($needInstall) {
        Write-Host "install → " -NoNewline -ForegroundColor Yellow
        Invoke-In $dir { npm install --loglevel=error } "$name npm install"
    }
    Write-Host "build → " -NoNewline -ForegroundColor Yellow
    Invoke-In $dir { npm run build } "$name build"
    Write-Host "OK" -ForegroundColor Green
}

function Ensure-Backend-Venv {
    if (-not (Test-Path $venvPython)) {
        Write-Host "  [后端] 创建虚拟环境 + 安装依赖..." -ForegroundColor Yellow
        $py = if (Get-Command python -ErrorAction SilentlyContinue) { "python" } else { "python3" }
        & $py -m venv (Join-Path $backendDir ".venv")
        & $venvPython -m pip install -r (Join-Path $backendDir "requirements.txt") -q 2>$null
        Write-Host "  [后端] OK" -ForegroundColor Green
    }
}

function Start-Backend {
    Ensure-Backend-Venv
    $script = Join-Path $env:TEMP "vibehub-desktop-backend.ps1"
    @"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
`$Host.UI.RawUI.WindowTitle = 'VibeHub Backend (cloud :8000)'
Set-Location '$backendDir'
`$env:DEPLOYMENT_MODE = 'cloud'
`$env:ALLOW_ORIGIN_REGEX = '.*'
Write-Host 'VibeHub Backend (cloud) -> http://127.0.0.1:8000' -ForegroundColor Green
& '$venvPython' -m uvicorn app.main:app --host 127.0.0.1 --port 8000
Write-Host 'Backend stopped. Press any key...' -ForegroundColor Yellow
`$null = `$Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
"@ | Out-File -FilePath $script -Encoding UTF8
    Start-Process powershell -ArgumentList "-NoExit", "-File", $script
    Write-Host "  [后端] 已在新窗口启动 (cloud, :8000)" -ForegroundColor Green
    Start-Sleep -Seconds 2
}

function Start-Frontend-Dev {
    $script = Join-Path $env:TEMP "vibehub-desktop-frontend-dev.ps1"
    @"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
`$Host.UI.RawUI.WindowTitle = 'VibeHub Frontend (Vite :5173)'
Set-Location '$frontendDir'
Write-Host 'VibeHub Frontend Dev -> http://localhost:5173' -ForegroundColor Green
npm run dev
"@ | Out-File -FilePath $script -Encoding UTF8
    Start-Process powershell -ArgumentList "-NoExit", "-File", $script
    Write-Host "  [前端] Vite dev server 已在新窗口启动 (:5173)" -ForegroundColor Green
    Start-Sleep -Seconds 3
}

function Start-Desktop([switch]$devMode) {
    if ($devMode) {
        $env:VIBEHUB_DEV_SERVER_URL = "http://localhost:5173"
        Write-Host "  [桌面壳] 开发模式 → 加载 Vite dev server (热更新)" -ForegroundColor Magenta
    }
    Invoke-In $desktopDir { npm start } "electron start"
    if ($devMode) { Remove-Item Env:\VIBEHUB_DEV_SERVER_URL -ErrorAction SilentlyContinue }
}

# ── 环境检查 ────────────────────────────────────────────────

Write-Section "VibeHub 桌面客户端"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  [ERROR] 未找到 Node.js，请安装 Node 20+" -ForegroundColor Red; exit 1
}
Write-Host "  Node $(node --version) · npm $(npm --version)" -ForegroundColor DarkGray

# ── 构建 ────────────────────────────────────────────────────

$skipBuild = $Quick
if (-not $skipBuild) {
    Write-Section "构建三件套"
    Build-Node $agentDir   "local-agent"
    if (-not $Dev) {
        Build-Node $frontendDir "frontend"
    } else {
        Write-Host "  [frontend] 开发模式，跳过 build（走 Vite dev server）" -ForegroundColor DarkGray
    }
    Build-Node $desktopDir "desktop"
}
else {
    # Quick 模式：检查产物是否存在
    $missing = @()
    if (-not (Test-Path (Join-Path $agentDir "dist\index.js")))          { $missing += "local-agent/dist" }
    if (-not $Dev -and -not (Test-Path (Join-Path $frontendDir "dist\index.html"))) { $missing += "frontend/dist" }
    if (-not (Test-Path (Join-Path $desktopDir "dist-electron\main\index.js")))     { $missing += "desktop/dist-electron" }
    if ($missing.Count -gt 0) {
        Write-Host "  [WARN] -Quick 但以下产物缺失，将自动构建: $($missing -join ', ')" -ForegroundColor Yellow
        if ($missing -contains "local-agent/dist")    { Build-Node $agentDir   "local-agent" }
        if ($missing -contains "frontend/dist")       { Build-Node $frontendDir "frontend" }
        if ($missing -contains "desktop/dist-electron"){ Build-Node $desktopDir "desktop" }
    }
    else {
        Write-Host "  [Quick] 产物已存在，跳过构建" -ForegroundColor DarkGray
    }
}

# ── 打包 ────────────────────────────────────────────────────

if ($Dist) {
    Write-Section "打包 NSIS 安装包"
    Write-Host "  首次会下载 electron + nsis 工具链，请耐心等待" -ForegroundColor Gray
    Invoke-In $desktopDir { npm run dist:win } "electron-builder dist"
    Write-Host "  [OK] 输出: $(Join-Path $desktopDir 'release')" -ForegroundColor Green
    Write-Host ""; exit 0
}
if ($Pack) {
    Write-Section "打包解压即用目录"
    Write-Host "  首次会下载 electron 工具链，请耐心等待" -ForegroundColor Gray
    Invoke-In $desktopDir { npm run pack:win } "electron-builder pack"
    Write-Host "  [OK] 输出: $(Join-Path $desktopDir 'release')" -ForegroundColor Green
    Write-Host ""; exit 0
}

# ── 仅构建 ──────────────────────────────────────────────────

if ($BuildOnly) {
    Write-Section "构建完成"
    Write-Host "  local-agent/dist, frontend/dist, desktop/dist-electron" -ForegroundColor Green
    Write-Host ""; exit 0
}

# ── 启动 ────────────────────────────────────────────────────

Write-Section "启动服务"

if (-not $NoBe) {
    Start-Backend
}
else {
    Write-Host "  [后端] -NoBe: 跳过，请确保 cloud 后端已在 :8000 运行" -ForegroundColor Yellow
}

if ($Dev) {
    Start-Frontend-Dev
    Start-Desktop -devMode
}
else {
    Start-Desktop
}

Write-Host ""
