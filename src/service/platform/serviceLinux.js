const fs = require('fs');
const path = require('path');

const { commandExists, execFileText } = require('./commandUtils');
const {
  SYSTEMD_SERVICE_NAME,
  getBaseDirectory,
  getHermesChannel,
  getPlatformDisplayName,
  getSystemdServiceFilePath,
  getSystemdUserDirectory,
  isLocalChannel,
} = require('./paths');

const SERVICE_NAME = isLocalChannel()
  ? 'Hermes Local Background Agent'
  : 'Hermes Background Agent';

function ensureSystemdAvailable() {
  if (!commandExists('systemctl')) {
    const error = new Error('systemctl is required for Linux background service support.');
    error.code = 'feature_unavailable';
    throw error;
  }
}

function resolveServiceScript() {
  const resourcesPath = process.resourcesPath;
  const candidates = resourcesPath
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
    candidates.find((candidate) => fs.existsSync(candidate)) ||
    path.join(__dirname, '..', 'agent.js')
  );
}

function resolveWorkingDirectory() {
  if (process.resourcesPath && fs.existsSync(process.resourcesPath)) {
    return process.resourcesPath;
  }

  return path.join(__dirname, '..', '..', '..');
}

function buildStatus(overrides = {}) {
  return {
    name: SERVICE_NAME,
    internalName: SYSTEMD_SERVICE_NAME,
    displayName: `${getPlatformDisplayName()} user service`,
    kind: 'systemd-user',
    supported: true,
    installed: false,
    running: false,
    status: 'not-installed',
    canStop: false,
    actions: {
      install: true,
      start: true,
      stop: true,
      uninstall: true,
    },
    ...overrides,
  };
}

async function runSystemctl(args) {
  ensureSystemdAvailable();
  return execFileText('systemctl', ['--user', ...args], { timeout: 120000 });
}

function buildUnitFile() {
  const baseDirectory = getBaseDirectory('linux');
  const workingDirectory = resolveWorkingDirectory();
  const execPath = process.execPath;
  const serviceScript = resolveServiceScript();
  const quote = (value) => `"${String(value).replace(/"/g, '\\"')}"`;

  return [
    '[Unit]',
    isLocalChannel()
      ? 'Description=Prometeo Hermes local background agent'
      : 'Description=Prometeo Hermes background agent',
    'After=default.target network-online.target',
    '',
    '[Service]',
    'Type=simple',
    `WorkingDirectory=${quote(workingDirectory)}`,
    'Environment=ELECTRON_RUN_AS_NODE=1',
    `Environment="HERMES_CHANNEL=${getHermesChannel()}"`,
    `ExecStart=${quote(execPath)} ${quote(serviceScript)}`,
    'Restart=always',
    'RestartSec=5',
    `Environment="HERMES_BASE_DIR=${String(baseDirectory).replace(/"/g, '\\"')}"`,
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

async function getServiceStatus() {
  ensureSystemdAvailable();

  const serviceFilePath = getSystemdServiceFilePath();
  const unitExists = fs.existsSync(serviceFilePath);

  try {
    const raw = await runSystemctl([
      'show',
      SYSTEMD_SERVICE_NAME,
      '--property=LoadState,ActiveState,SubState,UnitFileState',
      '--no-page',
    ]);

    const properties = {};
    for (const line of String(raw || '').split(/\r?\n/)) {
      const [key, ...rest] = line.split('=');
      if (!key) continue;
      properties[key] = rest.join('=').trim();
    }

    const installed =
      unitExists ||
      properties.LoadState === 'loaded' ||
      properties.UnitFileState === 'enabled' ||
      properties.UnitFileState === 'disabled';
    const running = properties.ActiveState === 'active';

    return buildStatus({
      installed,
      running,
      status:
        properties.SubState ||
        properties.ActiveState ||
        (installed ? 'installed' : 'not-installed'),
      canStop: running,
    });
  } catch (error) {
    if (/could not be found|not loaded|No such file/i.test(String(error.message || error))) {
      return buildStatus();
    }

    return buildStatus({
      status: 'unknown',
      error: error.message || String(error),
    });
  }
}

async function installService() {
  ensureSystemdAvailable();

  const unitDirectory = getSystemdUserDirectory();
  const unitPath = getSystemdServiceFilePath();

  fs.mkdirSync(unitDirectory, { recursive: true });
  fs.writeFileSync(unitPath, buildUnitFile(), 'utf8');

  await runSystemctl(['daemon-reload']);
  await runSystemctl(['enable', SYSTEMD_SERVICE_NAME]);

  try {
    await runSystemctl(['start', SYSTEMD_SERVICE_NAME]);
  } catch (_error) {
    // Keep installation valid even if start fails; status will surface it.
  }

  return getServiceStatus();
}

async function uninstallService() {
  ensureSystemdAvailable();

  try {
    await runSystemctl(['stop', SYSTEMD_SERVICE_NAME]);
  } catch (_error) {
    // Ignore stop failures for missing or inactive services.
  }

  try {
    await runSystemctl(['disable', SYSTEMD_SERVICE_NAME]);
  } catch (_error) {
    // Ignore disable failures if the unit was never enabled.
  }

  const unitPath = getSystemdServiceFilePath();
  if (fs.existsSync(unitPath)) {
    fs.unlinkSync(unitPath);
  }

  await runSystemctl(['daemon-reload']);
  return getServiceStatus();
}

async function startService() {
  await runSystemctl(['start', SYSTEMD_SERVICE_NAME]);
  return getServiceStatus();
}

async function stopService() {
  await runSystemctl(['stop', SYSTEMD_SERVICE_NAME]);
  return getServiceStatus();
}

module.exports = {
  SERVICE_NAME,
  buildStatus,
  getServiceStatus,
  installService,
  uninstallService,
  startService,
  stopService,
};
