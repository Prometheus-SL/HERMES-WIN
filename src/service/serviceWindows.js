// Utility to install/uninstall the Node agent as a Windows service using node-windows
const Service = require('node-windows').Service;
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const SERVICE_NAME = 'HermesNodeAgent';
const PROGRAM_DATA_ROOT = path.join(
  process.env.PROGRAMDATA || 'C:\\ProgramData',
  'HERMES-WIN'
);

function resolveServiceScript() {
  const resourcesPath = process.resourcesPath;
  const packagedCandidates = resourcesPath
    ? [
        path.join(resourcesPath, 'app.asar.unpacked', 'src', 'service', 'agent.js'),
        path.join(resourcesPath, 'app.asar', 'src', 'service', 'agent.js'),
        path.join(resourcesPath, 'src', 'service', 'agent.js'),
      ]
    : [];

  return (
    packagedCandidates.find((candidate) => fs.existsSync(candidate)) ||
    path.join(__dirname, 'agent.js')
  );
}

function resolveServiceWorkingDirectory() {
  if (process.resourcesPath && fs.existsSync(process.resourcesPath)) {
    return process.resourcesPath;
  }

  return process.cwd();
}

function resolveServiceBaseDirectory() {
  if (!process.resourcesPath || /node(\.exe)?$/i.test(process.execPath || '')) {
    return path.dirname(resolveServiceScript());
  }

  return PROGRAM_DATA_ROOT;
}

function createService() {
  const serviceBaseDirectory = resolveServiceBaseDirectory();

  if (!fs.existsSync(serviceBaseDirectory)) {
    fs.mkdirSync(serviceBaseDirectory, { recursive: true });
  }

  const svc = new Service({
    name: SERVICE_NAME,
    description: 'HERMES Node Agent service',
    script: resolveServiceScript(),
    execPath: process.execPath,
    workingDirectory: resolveServiceWorkingDirectory(),
    env: [
      {
        name: 'ELECTRON_RUN_AS_NODE',
        value: '1',
      },
    ],
  });

  svc.directory(serviceBaseDirectory);
  return svc;
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
