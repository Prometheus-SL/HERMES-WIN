@echo off
REM HERMES Agent Tray - Build and Install Service
REM This script compiles the project and installs it as a Windows service

REM Check for administrator privileges
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Administrator privileges confirmed.
    goto :main
) else (
    echo Requesting administrator privileges...
    echo This is required to install Windows services.
    echo.
    
    REM Self-elevate using PowerShell
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

:main
echo.
echo =====================================================
echo   HERMES Agent Tray - Build and Install Service
echo =====================================================
echo.

REM Change to script directory
cd /d "%~dp0"

echo Step 1: Building the project...
echo.
cargo build --release --bin agent-tray
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Build failed!
    echo Please check the compilation errors above.
    echo.
    pause
    exit /b 1
)

echo.
echo === Build Successful! ===
echo.

set "EXECUTABLE=target\release\agent-tray.exe"

echo Step 2: Installing as Windows service...
echo.

echo Installing HERMES Agent Tray as Windows Service...
"%EXECUTABLE%" install
if %errorlevel% equ 0 (
    echo.
    echo === Installation Successful! ===
    echo Service installed and configured to start automatically with Windows.
    echo.
    echo Step 3: Starting service...
    "%EXECUTABLE%" start
    echo.
    echo === Service Started! ===
    echo.
    echo The HERMES Agent Tray is now running as a Windows service.
    echo It will start automatically every time Windows boots.
    echo.
    echo Service management commands:
    echo   Status:  %EXECUTABLE% status
    echo   Start:   %EXECUTABLE% start
    echo   Stop:    %EXECUTABLE% stop
    echo   Restart: %EXECUTABLE% restart
    echo   Uninstall: %EXECUTABLE% uninstall
) else (
    echo.
    echo ERROR: Installation failed!
    echo Please check the error messages above.
)

echo.
echo Checking final service status...
"%EXECUTABLE%" status

echo.
echo Installation complete!
pause