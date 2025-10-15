@echo off
REM HERMES Agent Tray Service Uninstaller
REM This script removes the HERMES Agent service completely

REM Check for administrator privileges
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Administrator privileges confirmed.
    goto :main
) else (
    echo Requesting administrator privileges...
    echo This is required to uninstall Windows services.
    echo.
    
    REM Self-elevate using PowerShell
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

:main
echo.
echo ==========================================
echo   HERMES Agent Tray Service Uninstaller
echo ==========================================
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
    echo WARNING: agent-tray.exe not found!
    echo Trying to uninstall using Windows Service Manager...
    goto :manual_uninstall
)

echo.
echo Checking current service status...
"%EXECUTABLE%" status

echo.
echo Are you sure you want to completely remove the HERMES Agent service?
echo This will:
echo   - Stop the running service
echo   - Remove the service from Windows
echo   - The service will no longer start automatically
echo.
set /p confirm="Continue with uninstallation? (Y/N): "

if /i not "%confirm%"=="Y" (
    echo Uninstallation cancelled.
    goto :end
)

echo.
echo === Starting Uninstallation ===
echo.

echo Step 1: Stopping service...
"%EXECUTABLE%" stop
if %errorlevel% equ 0 (
    echo ✓ Service stopped successfully
) else (
    echo ! Service may not be running (this is OK)
)

echo.
echo Step 2: Removing service...
timeout /t 2 /nobreak >nul
"%EXECUTABLE%" uninstall
if %errorlevel% equ 0 (
    echo ✓ Service removed successfully
    goto :success
) else (
    echo ! Failed to remove service using executable
    goto :manual_uninstall
)

:manual_uninstall
echo.
echo Attempting manual service removal...
sc stop HermesAgentTray >nul 2>&1
timeout /t 2 /nobreak >nul
sc delete HermesAgentTray >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ Service removed manually
    goto :success
) else (
    echo ! Service may not be installed or already removed
    goto :success
)

:success
echo.
echo === Uninstallation Complete ===
echo.
echo ✓ HERMES Agent service has been removed from your system
echo ✓ The service will no longer start automatically with Windows
echo.
echo Note: Configuration files and logs have been left intact.
echo If you want to remove them as well, you can delete:
echo   - config.toml
echo   - agent.log
echo   - This installation folder
echo.
goto :end

:end
echo Press any key to exit...
pause >nul