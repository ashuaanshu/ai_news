@echo off
setlocal

set "ROOT=%~dp0"

where uv >nul 2>nul
if errorlevel 1 (
    echo uv was not found. Install uv, then run this file again.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo npm was not found. Install Node.js, then run this file again.
    pause
    exit /b 1
)

if not exist "%ROOT%frontend\node_modules\next\dist\bin\next" (
    echo Frontend dependencies are missing.
    echo Open a terminal in "%ROOT%frontend" and run: npm install
    pause
    exit /b 1
)

curl.exe --silent --fail http://127.0.0.1:8000/api/health >nul 2>nul
if errorlevel 1 (
    echo Starting the AI News backend...
    start "AI News Backend" /D "%ROOT%backend" cmd /k "uv run uvicorn app.main:app --host 127.0.0.1 --port 8000"
)

curl.exe --silent --fail http://127.0.0.1:3000 >nul 2>nul
if errorlevel 1 (
    echo Starting the AI News frontend...
    start "AI News Frontend" /D "%ROOT%frontend" cmd /k "npm run dev -- --hostname 127.0.0.1 --port 3000"
)

echo Waiting for the backend...
call :wait_for_url http://127.0.0.1:8000/api/health
if errorlevel 1 (
    echo The backend did not become ready. Check its terminal window for errors.
    pause
    exit /b 1
)

echo Waiting for the frontend...
call :wait_for_url http://127.0.0.1:3000
if errorlevel 1 (
    echo The frontend did not become ready. Check its terminal window for errors.
    pause
    exit /b 1
)

echo Opening AI News at http://127.0.0.1:3000
start "" http://127.0.0.1:3000
exit /b 0

:wait_for_url
set "CHECK_URL=%~1"
powershell -NoProfile -Command "$ready = $false; for ($i = 0; $i -lt 45; $i++) { try { $response = Invoke-WebRequest -UseBasicParsing -Uri $env:CHECK_URL -TimeoutSec 2; if ($response.StatusCode -eq 200) { $ready = $true; break } } catch {}; Start-Sleep -Seconds 1 }; if (-not $ready) { exit 1 }"
exit /b %errorlevel%
