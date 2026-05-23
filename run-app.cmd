@echo off
setlocal

cd /d "%~dp0"

echo [MellowCat] Building launcher...
call npm.cmd run build
if errorlevel 1 (
  echo.
  echo [MellowCat] Build failed. Press any key to close.
  pause >nul
  exit /b 1
)

echo.
echo [MellowCat] Opening launcher...
call .\node_modules\.bin\electron.cmd .

endlocal
