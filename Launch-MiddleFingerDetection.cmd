@echo off
cd /d "%~dp0"
if exist "dist\MiddleFingerDetection.exe" (
  start "" "dist\MiddleFingerDetection.exe"
  exit /b 0
)
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" "app.py"
) else (
  python "app.py"
)
if errorlevel 1 (
  echo.
  echo Startup failed. See the message above and README.md.
  pause
  exit /b 1
)
exit /b 0
