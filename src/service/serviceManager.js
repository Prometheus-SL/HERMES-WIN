const { getPlatformDisplayName } = require('./platform/paths');

function selectServiceImplementation(platform = process.platform) {
  if (platform === 'win32') {
    return require('./serviceWindows');
  }

  if (platform === 'linux') {
    return require('./platform/serviceLinux');
  }

  return require('./platform/serviceManual');
}

function getServiceKind(platform = process.platform) {
  if (platform === 'win32') {
    return 'windows-service';
  }

  if (platform === 'linux') {
    return 'systemd-user';
  }

  return 'manual';
}

function getServiceName(platform = process.platform) {
  if (platform === 'win32') {
    return 'HermesNodeAgent';
  }

  return 'Hermes Background Agent';
}

function getServiceDisplayName(platform = process.platform) {
  if (platform === 'win32') {
    return 'Windows service';
  }

  if (platform === 'linux') {
    return 'Linux user service';
  }

  return `${getPlatformDisplayName(platform)} manual runtime`;
}

function getServiceActions(platform = process.platform) {
  if (platform === 'darwin') {
    return {
      install: false,
      start: false,
      stop: false,
      uninstall: false,
    };
  }

  return {
    install: true,
    start: true,
    stop: true,
    uninstall: true,
  };
}

function normalizeServiceStatus(status = {}, platform = process.platform) {
  const actions = status.actions || getServiceActions(platform);
  const supported =
    typeof status.supported === 'boolean' ? status.supported : platform !== 'darwin';

  return {
    name: String(status.name || getServiceName(platform)),
    internalName: String(status.internalName || ''),
    displayName: String(status.displayName || getServiceDisplayName(platform)),
    kind: String(status.kind || getServiceKind(platform)),
    supported,
    installed: Boolean(status.installed),
    running: Boolean(status.running),
    status: String(status.status || (status.installed ? 'installed' : 'not-installed')),
    canStop:
      typeof status.canStop === 'boolean' ? status.canStop : Boolean(status.running),
    actions: {
      install: Boolean(actions.install),
      start: Boolean(actions.start),
      stop: Boolean(actions.stop),
      uninstall: Boolean(actions.uninstall),
    },
    ...(status.error ? { error: String(status.error) } : {}),
  };
}

async function invoke(methodName, args = [], platform = process.platform) {
  const implementation = selectServiceImplementation(platform);
  const result = await implementation[methodName](...args);
  return normalizeServiceStatus(result, platform);
}

module.exports = {
  selectServiceImplementation,
  normalizeServiceStatus,
  getServiceStatus: (platform) => invoke('getServiceStatus', [], platform),
  installService: (platform) => invoke('installService', [], platform),
  uninstallService: (platform) => invoke('uninstallService', [], platform),
  startService: (platform) => invoke('startService', [], platform),
  stopService: (platform) => invoke('stopService', [], platform),
};
