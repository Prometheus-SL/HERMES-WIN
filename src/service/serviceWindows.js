// Utility to install/uninstall the Node agent as a Windows service using node-windows
const Service = require('node-windows').Service;
const path = require('path');
const { execFile } = require('child_process');

const SERVICE_NAME = 'HermesNodeAgent';

function createService() {
  return new Service({
    name: SERVICE_NAME,
    description: 'HERMES Node Agent service',
    script: path.join(__dirname, 'agent.js'),
  });
}

function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { windowsHide: true, timeout: 15000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message || 'PowerShell failed'));
          return;
        }

        resolve(String(stdout || '').trim());
      }
    );
  });
}

async function getServiceStatus() {
  const raw = await runPowerShell(
    `try {
      $svc = Get-Service -Name '${SERVICE_NAME}' -ErrorAction Stop
      [PSCustomObject]@{
        installed = $true
        status = [string]$svc.Status
        canStop = [bool]$svc.CanStop
      } | ConvertTo-Json -Compress
    } catch {
      [PSCustomObject]@{
        installed = $false
        status = 'not-installed'
        canStop = $false
      } | ConvertTo-Json -Compress
    }`
  );

  const parsed = JSON.parse(raw);
  return {
    name: SERVICE_NAME,
    installed: Boolean(parsed.installed),
    status: String(parsed.status || 'unknown'),
    running: String(parsed.status || '').toLowerCase() === 'running',
    canStop: Boolean(parsed.canStop),
  };
}

function installService() {
  return new Promise((resolve, reject) => {
    const svc = createService();

    svc.on('install', async () => {
      try {
        svc.start();
        setTimeout(async () => resolve(await getServiceStatus()), 1200);
      } catch (error) {
        reject(error);
      }
    });

    svc.on('alreadyinstalled', async () => {
      resolve(await getServiceStatus());
    });

    svc.on('invalidinstallation', () => {
      reject(new Error('Invalid service installation'));
    });

    svc.on('error', reject);
    svc.install();
  });
}

function uninstallService() {
  return new Promise((resolve, reject) => {
    const svc = createService();

    svc.on('uninstall', async () => {
      resolve(await getServiceStatus());
    });

    svc.on('alreadyuninstalled', async () => {
      resolve(await getServiceStatus());
    });

    svc.on('error', reject);
    svc.uninstall();
  });
}

async function startService() {
  await runPowerShell(`Start-Service -Name '${SERVICE_NAME}'`);
  return getServiceStatus();
}

async function stopService() {
  await runPowerShell(`Stop-Service -Name '${SERVICE_NAME}' -Force`);
  return getServiceStatus();
}

module.exports = {
  SERVICE_NAME,
  installService,
  uninstallService,
  startService,
  stopService,
  getServiceStatus,
};
