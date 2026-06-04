# VibeHub - Startup Script (Windows PowerShell)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ROOT = $PSScriptRoot
$backendDir = Join-Path $ROOT "backend"
$frontendDir = Join-Path $ROOT "frontend"
$venvDir = Join-Path $backendDir ".venv"
$venvPython = Join-Path $venvDir "Scripts\python.exe"
$venvPip = Join-Path $venvDir "Scripts\pip.exe"

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   VibeHub - AI Collaboration Platform Launcher" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# --- Check environment ---
Write-Host "[Check] Verifying dependencies..." -ForegroundColor Yellow
Write-Host ""

$python = $null
if (Get-Command python -ErrorAction SilentlyContinue) { $python = "python" }
elseif (Get-Command python3 -ErrorAction SilentlyContinue) { $python = "python3" }
if (-not $python) {
    Write-Host "  [ERROR] Python not found. Install Python 3.10+" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Python: $(& $python --version 2>&1)" -ForegroundColor Green

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  [ERROR] Node.js not found. Install Node.js 18+" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Node.js: $(node --version)" -ForegroundColor Green
Write-Host "  [OK] npm: $(npm --version)" -ForegroundColor Green
Write-Host ""

# --- Backend venv ---
if (-not (Test-Path $venvDir)) {
    Write-Host "[Setup] Creating Python venv..." -ForegroundColor Yellow
    & $python -m venv $venvDir
}
if (-not (Test-Path $venvPython)) {
    Write-Host "  [ERROR] venv creation failed" -ForegroundColor Red
    exit 1
}
Write-Host "[Setup] Installing backend deps..." -ForegroundColor Yellow
& $venvPip install -r (Join-Path $backendDir "requirements.txt") -q 2>$null
Write-Host "  [OK] Backend deps ready" -ForegroundColor Green
Write-Host ""

# --- Frontend deps ---
if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Host "[Setup] Installing frontend deps..." -ForegroundColor Yellow
    Push-Location $frontendDir
    npm install
    Pop-Location
}
Write-Host "  [OK] Frontend deps ready" -ForegroundColor Green
Write-Host ""

# --- Launch backend in a new terminal window ---
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "  Launching Backend (FastAPI + Uvicorn)" -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "  Dir:  $backendDir" -ForegroundColor Gray
Write-Host "  URL:  http://localhost:8000" -ForegroundColor White
Write-Host "  Docs: http://localhost:8000/docs" -ForegroundColor White
Write-Host ""

$backendScript = Join-Path $env:TEMP "cowork-backend-start.ps1"
@"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
`$Host.UI.RawUI.WindowTitle = 'VibeHub - Backend (FastAPI :8000)'
Write-Host '=========================================='  -ForegroundColor Cyan
Write-Host '  VibeHub Backend (FastAPI)' -ForegroundColor Cyan
Write-Host '==========================================' -ForegroundColor Cyan
Write-Host "  Dir:  $backendDir" -ForegroundColor Gray
Write-Host '  URL:  http://localhost:8000' -ForegroundColor Green
Write-Host '  Docs: http://localhost:8000/docs' -ForegroundColor Green
Write-Host '==========================================' -ForegroundColor Cyan
Write-Host ''
Set-Location '$backendDir'
& '$venvPython' -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
Write-Host ''
Write-Host 'Backend stopped. Press any key to close...' -ForegroundColor Yellow
`$null = `$Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
"@ | Out-File -FilePath $backendScript -Encoding UTF8

Start-Process powershell -ArgumentList "-NoExit", "-File", $backendScript

Start-Sleep -Seconds 1

# --- Launch frontend in a new terminal window ---
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Launching Frontend (Vite Dev Server)" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Dir: $frontendDir" -ForegroundColor Gray
Write-Host "  URL: http://localhost:5173" -ForegroundColor White
Write-Host ""

$frontendScript = Join-Path $env:TEMP "cowork-frontend-start.ps1"
@"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
`$Host.UI.RawUI.WindowTitle = 'VibeHub - Frontend (Vite :5173)'
Write-Host '==========================================' -ForegroundColor Cyan
Write-Host '  VibeHub Frontend (Vite)' -ForegroundColor Cyan
Write-Host '==========================================' -ForegroundColor Cyan
Write-Host "  Dir: $frontendDir" -ForegroundColor Gray
Write-Host '  URL: http://localhost:5173' -ForegroundColor Green
Write-Host '==========================================' -ForegroundColor Cyan
Write-Host ''
Set-Location '$frontendDir'
npm run dev
Write-Host ''
Write-Host 'Frontend stopped. Press any key to close...' -ForegroundColor Yellow
`$null = `$Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
"@ | Out-File -FilePath $frontendScript -Encoding UTF8

Start-Process powershell -ArgumentList "-NoExit", "-File", $frontendScript

# --- Done ---
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  All services launched in separate windows!" -ForegroundColor Green
Write-Host "" -ForegroundColor White
Write-Host "  Frontend: http://localhost:5173  (new window)" -ForegroundColor White
Write-Host "  Backend:  http://localhost:8000  (new window)" -ForegroundColor White
Write-Host "  API Docs: http://localhost:8000/docs" -ForegroundColor White
Write-Host "" -ForegroundColor White
Write-Host "  To stop: close the terminal windows" -ForegroundColor Gray
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
