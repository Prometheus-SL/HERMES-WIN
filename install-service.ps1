# HERMES Agent Tray Service Installer
# This script must be run as Administrator

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("install", "uninstall", "reinstall")]
    [string]$Action = "install"
)

# Check if running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    exit 1
}

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
$agentExePath = Join-Path $scriptPath "target\release\agent-tray.exe"
$agentDebugPath = Join-Path $scriptPath "target\debug\agent-tray.exe"

# Check if executable exists
if (Test-Path $agentExePath) {
    $executablePath = $agentExePath
    Write-Host "Using release build: $executablePath" -ForegroundColor Green
} elseif (Test-Path $agentDebugPath) {
    $executablePath = $agentDebugPath
    Write-Host "Using debug build: $executablePath" -ForegroundColor Yellow
} else {
    Write-Host "ERROR: agent-tray.exe not found!" -ForegroundColor Red
    Write-Host "Please build the project first with: cargo build --release" -ForegroundColor Yellow
    exit 1
}

switch ($Action) {
    "install" {
        Write-Host "Installing HERMES Agent Tray as Windows Service..." -ForegroundColor Cyan
        
        try {
            & $executablePath install
            if ($LASTEXITCODE -eq 0) {
                Write-Host "`n=== Installation Successful! ===" -ForegroundColor Green
                Write-Host "Service installed and configured to start automatically with Windows." -ForegroundColor Green
                Write-Host "`nStarting service..." -ForegroundColor Cyan
                & $executablePath start
                Write-Host "`nService management commands:" -ForegroundColor White
                Write-Host "  Status:  $executablePath status" -ForegroundColor Gray
                Write-Host "  Start:   $executablePath start" -ForegroundColor Gray
                Write-Host "  Stop:    $executablePath stop" -ForegroundColor Gray
                Write-Host "  Restart: $executablePath restart" -ForegroundColor Gray
            } else {
                Write-Host "Installation failed!" -ForegroundColor Red
            }
        } catch {
            Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
    "uninstall" {
        Write-Host "Uninstalling HERMES Agent Tray Service..." -ForegroundColor Cyan
        
        try {
            # Stop service first
            Write-Host "Stopping service..." -ForegroundColor Yellow
            & $executablePath stop
            
            # Wait a moment
            Start-Sleep -Seconds 2
            
            # Uninstall service
            & $executablePath uninstall
            if ($LASTEXITCODE -eq 0) {
                Write-Host "`n=== Uninstallation Successful! ===" -ForegroundColor Green
            } else {
                Write-Host "Uninstallation failed!" -ForegroundColor Red
            }
        } catch {
            Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
    "reinstall" {
        Write-Host "Reinstalling HERMES Agent Tray Service..." -ForegroundColor Cyan
        
        # Uninstall first
        Write-Host "Removing existing service..." -ForegroundColor Yellow
        try {
            & $executablePath stop
            Start-Sleep -Seconds 2
            & $executablePath uninstall
        } catch {
            Write-Host "Service may not be installed, continuing..." -ForegroundColor Yellow
        }
        
        # Install
        Start-Sleep -Seconds 1
        Write-Host "Installing service..." -ForegroundColor Cyan
        try {
            & $executablePath install
            if ($LASTEXITCODE -eq 0) {
                Write-Host "`n=== Reinstallation Successful! ===" -ForegroundColor Green
                Write-Host "Starting service..." -ForegroundColor Cyan
                & $executablePath start
            } else {
                Write-Host "Reinstallation failed!" -ForegroundColor Red
            }
        } catch {
            Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Write-Host "`nPress any key to continue..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")