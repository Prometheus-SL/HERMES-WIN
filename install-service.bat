@echo off
REM HERMES Agent Tray Service Installer (Auto-elevate to Administrator)

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
echo =====================================
echo   HERMES Agent Tray Service Installer
echo =====================================
echo.

REM Change to script directory
cd /d "%~dp0"

REM Check if executable exists
if exist "target\release\agent-tray.exe" (
    set "EXECUTABLE=target\release\agent-tray.exe"
    echo Using release build: !EXECUTABLE!
) else if exist "target\debug\agent-tray.exe" (
    set "EXECUTABLE=target\debug\agent-tray.exe"
    echo Using debug build: !EXECUTABLE!
) else (
    echo ERROR: agent-tray.exe not found!
    echo Please build the project first with: cargo build --release
    echo.
    pause
    exit /b 1
)

echo.
echo What would you like to do?
echo 1. Install service
echo 2. Uninstall service
echo 3. Reinstall service
echo 4. Check service status
echo 5. Exit
echo.
set /p choice="Enter your choice (1-5): "

if "%choice%"=="1" goto :install
if "%choice%"=="2" goto :uninstall
if "%choice%"=="3" goto :reinstall
if "%choice%"=="4" goto :status
if "%choice%"=="5" goto :exit
echo Invalid choice. Please try again.
goto :main

:install
echo.
echo Installing HERMES Agent Tray as Windows Service...
echo.
"%EXECUTABLE%" install
if %errorlevel% equ 0 (
    echo.
    echo === Installation Successful! ===
    echo Service installed and configured to start automatically with Windows.
    echo.
    echo Starting service...
    "%EXECUTABLE%" start
    echo.
    echo Service management commands:
    echo   Status:  %EXECUTABLE% status
    echo   Start:   %EXECUTABLE% start
    echo   Stop:    %EXECUTABLE% stop
    echo   Restart: %EXECUTABLE% restart
) else (
    echo Installation failed!
)
goto :end

:uninstall
echo.
echo Uninstalling HERMES Agent Tray Service...
echo.
echo Stopping service...
"%EXECUTABLE%" stop
timeout /t 2 /nobreak >nul
"%EXECUTABLE%" uninstall
if %errorlevel% equ 0 (
    echo.
    echo === Uninstallation Successful! ===
) else (
    echo Uninstallation failed!
)
goto :end

:reinstall
echo.
echo Reinstalling HERMES Agent Tray Service...
echo.
echo Removing existing service...
"%EXECUTABLE%" stop
timeout /t 2 /nobreak >nul
"%EXECUTABLE%" uninstall
timeout /t 1 /nobreak >nul
echo Installing service...
"%EXECUTABLE%" install
if %errorlevel% equ 0 (
    echo.
    echo === Reinstallation Successful! ===
    echo Starting service...
    "%EXECUTABLE%" start
) else (
    echo Reinstallation failed!
)
goto :end

:status
echo.
echo Checking service status...
echo.
"%EXECUTABLE%" status
goto :end

:end
echo.
pause

:exit