// Utility to install/uninstall the Node agent as a Windows service using node-windows
const Service = require('node-windows').Service;
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const SERVICE_NAME = 'HermesNodeAgent';
const SERVICE_ID = SERVICE_NAME.replace(/[^\w]/g, '').toLowerCase();
const SERVICE_INTERNAL_NAME = `${SERVICE_ID}.exe`;
const LOCAL_SERVICE_SCRIPT = path.join(__dirname, 'agent.js');
const PROGRAM_DATA_ROOT = path.join(
  process.env.PROGRAMDATA || 'C:\\ProgramData',
  'HERMES-WIN'
);

function resolveServiceScript() {
  const resourcesPath = process.resourcesPath;
  const packagedCandidates = resourcesPath
    ? [
        path.join(resourcesPath, 'app.asar.unpacked', 'dist', 'service', 'agent.js'),
        path.join(resourcesPath, 'app.asar', 'dist', 'service', 'agent.js'),
        path.join(resourcesPath, 'dist', 'service', 'agent.js'),
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
  if (
    process.resourcesPath &&
    fs.existsSync(process.resourcesPath) &&
    !isUsingLocalServiceScript()
  ) {
    return process.resourcesPath;
  }

  return process.cwd();
}

function isUsingLocalServiceScript() {
  return path.normalize(resolveServiceScript()) === path.normalize(LOCAL_SERVICE_SCRIPT);
}

function resolveDefaultServiceBaseDirectory() {
  if (
    !process.resourcesPath ||
    /node(\.exe)?$/i.test(process.execPath || '') ||
    isUsingLocalServiceScript()
  ) {
    return path.dirname(resolveServiceScript());
  }

  return PROGRAM_DATA_ROOT;
}

function parseServiceExecutablePath(pathName) {
  const trimmed = String(pathName || '').trim();
  if (!trimmed) {
    return '';
  }

  const quotedMatch = trimmed.match(/^"([^"]+)"/);
  if (quotedMatch) {
    return quotedMatch[1];
  }

  const bareMatch = trimmed.match(/^([^\s]+)/);
  return bareMatch ? bareMatch[1] : '';
}

function hasLocalServiceArtifacts(baseDirectory) {
  const daemonDirectory = path.join(baseDirectory, 'daemon');
  return (
    fs.existsSync(path.join(daemonDirectory, `${SERVICE_ID}.exe`)) &&
    fs.existsSync(path.join(daemonDirectory, `${SERVICE_ID}.xml`))
  );
}

async function resolveServiceBaseDirectory() {
  const knownDirectories = [];
  const serviceRecord = await getInstalledServiceRecord();
  const registeredExecutablePath = parseServiceExecutablePath(serviceRecord.pathName);

  if (registeredExecutablePath) {
    knownDirectories.push(path.dirname(path.dirname(registeredExecutablePath)));
  }

  knownDirectories.push(path.dirname(resolveServiceScript()));
  knownDirectories.push(resolveDefaultServiceBaseDirectory());
  knownDirectories.push(PROGRAM_DATA_ROOT);

  const uniqueDirectories = Array.from(
    new Set(
      knownDirectories
        .filter(Boolean)
        .map((candidate) => path.normalize(candidate))
    )
  );

  const existingInstallDirectory = uniqueDirectories.find((candidate) =>
    hasLocalServiceArtifacts(candidate)
  );

  return existingInstallDirectory || uniqueDirectories[0] || resolveDefaultServiceBaseDirectory();
}

function createService(serviceBaseDirectory) {
  const resolvedBaseDirectory = serviceBaseDirectory || resolveDefaultServiceBaseDirectory();

  if (!fs.existsSync(resolvedBaseDirectory)) {
    fs.mkdirSync(resolvedBaseDirectory, { recursive: true });
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

  svc.directory(resolvedBaseDirectory);
  return svc;
}

function runPowerShell(command, options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 15000;
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { windowsHide: true, timeout: timeoutMs },
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

function buildServiceLookupScript() {
  return `
    $svc = $null
    try {
      $svc = Get-Service -Name '${SERVICE_INTERNAL_NAME}' -ErrorAction Stop
    } catch {}

    if (-not $svc) {
      try {
        $svc = Get-Service -DisplayName '${SERVICE_NAME}' -ErrorAction Stop
      } catch {}
    }
  `;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getInstalledServiceRecord() {
  const raw = await runPowerShell(
    `${buildServiceLookupScript()}
    $svcConfig = $null
    if ($svc) {
      try {
        $svcConfig = Get-CimInstance Win32_Service -Filter "Name='$($svc.Name)'" -ErrorAction Stop
      } catch {}
    }

    if ($svc) {
      [PSCustomObject]@{
        installed = $true
        name = [string]$svc.Name
        displayName = [string]$svc.DisplayName
        status = [string]$svc.Status
        canStop = [bool]$svc.CanStop
        pathName = if ($svcConfig) { [string]$svcConfig.PathName } else { '' }
      } | ConvertTo-Json -Compress
    } else {
      [PSCustomObject]@{
        installed = $false
        name = '${SERVICE_INTERNAL_NAME}'
        displayName = '${SERVICE_NAME}'
        status = 'not-installed'
        canStop = $false
        pathName = ''
      } | ConvertTo-Json -Compress
    }`
  );

  return JSON.parse(raw);
}

async function runElevatedScCommand(action, serviceName) {
  const raw = await runPowerShell(
    `$process = Start-Process -FilePath 'sc.exe' -ArgumentList '${action}', '${serviceName}' -Verb RunAs -Wait -PassThru
    if ($null -eq $process) {
      throw 'Failed to start elevated service command.'
    }

    [PSCustomObject]@{
      exitCode = [int]$process.ExitCode
    } | ConvertTo-Json -Compress`,
    { timeoutMs: 120000 }
  );

  const parsed = JSON.parse(raw);
  if (parsed.exitCode !== 0) {
    throw new Error(`sc.exe ${action} failed with exit code ${parsed.exitCode}`);
  }
}

async function waitForServiceStatus(targetStatus, timeoutMs = 15000) {
  const normalizedTargetStatus = String(targetStatus || '').toLowerCase();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = await getServiceStatus();
    if (String(status.status || '').toLowerCase() === normalizedTargetStatus) {
      return status;
    }

    await sleep(500);
  }

  return getServiceStatus();
}

async function getServiceStatus() {
  const parsed = await getInstalledServiceRecord();
  return {
    name: String(parsed.displayName || SERVICE_NAME),
    internalName: String(parsed.name || SERVICE_INTERNAL_NAME),
    installed: Boolean(parsed.installed),
    status: String(parsed.status || 'unknown'),
    running: String(parsed.status || '').toLowerCase() === 'running',
    canStop: Boolean(parsed.canStop),
  };
}

function installService() {
  return new Promise((resolve, reject) => {
    Promise.resolve()
      .then(resolveServiceBaseDirectory)
      .then((serviceBaseDirectory) => {
        const svc = createService(serviceBaseDirectory);

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
      })
      .catch(reject);
  });
}

function uninstallService() {
  return new Promise((resolve, reject) => {
    Promise.resolve()
      .then(resolveServiceBaseDirectory)
      .then((serviceBaseDirectory) => {
        const svc = createService(serviceBaseDirectory);

        svc.on('uninstall', async () => {
          resolve(await getServiceStatus());
        });

        svc.on('alreadyuninstalled', async () => {
          resolve(await getServiceStatus());
        });

        svc.on('error', reject);
        svc.uninstall();
      })
      .catch(reject);
  });
}

async function startService() {
  const service = await getInstalledServiceRecord();
  if (!service.installed) {
    throw new Error(`Service '${SERVICE_NAME}' is not installed.`);
  }

  if (String(service.status || '').toLowerCase() === 'running') {
    return getServiceStatus();
  }

  await runElevatedScCommand('start', String(service.name || SERVICE_INTERNAL_NAME));
  const status = await waitForServiceStatus('running');
  if (!status.running) {
    throw new Error(
      `Service '${SERVICE_NAME}' did not reach the running state. Current state: ${status.status}.`
    );
  }

  return status;
}

async function stopService() {
  const service = await getInstalledServiceRecord();
  if (!service.installed) {
    throw new Error(`Service '${SERVICE_NAME}' is not installed.`);
  }

  if (String(service.status || '').toLowerCase() === 'stopped') {
    return getServiceStatus();
  }

  await runElevatedScCommand('stop', String(service.name || SERVICE_INTERNAL_NAME));
  const status = await waitForServiceStatus('stopped');
  if (String(status.status || '').toLowerCase() !== 'stopped') {
    throw new Error(
      `Service '${SERVICE_NAME}' did not reach the stopped state. Current state: ${status.status}.`
    );
  }

  return status;
}

module.exports = {
  SERVICE_NAME,
  SERVICE_INTERNAL_NAME,
  installService,
  uninstallService,
  startService,
  stopService,
  getServiceStatus,
};
