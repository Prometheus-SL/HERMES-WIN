const { createFeatureUnavailableError } = require('./errors');

const SERVICE_NAME = 'Hermes Background Agent';

function buildStatus(platform = process.platform, overrides = {}) {
  return {
    name: SERVICE_NAME,
    internalName: 'manual',
    displayName: `${platform === 'darwin' ? 'macOS' : 'Manual'} background agent`,
    kind: 'manual',
    supported: false,
    installed: false,
    running: false,
    status: 'manual-only',
    canStop: false,
    actions: {
      install: false,
      start: false,
      stop: false,
      uninstall: false,
    },
    ...overrides,
  };
}

function unsupported() {
  throw createFeatureUnavailableError(
    'daemon_control',
    `Background daemon control is not available on ${process.platform}.`
  );
}

async function getServiceStatus() {
  return buildStatus();
}

module.exports = {
  SERVICE_NAME,
  buildStatus,
  getServiceStatus,
  installService: unsupported,
  uninstallService: unsupported,
  startService: unsupported,
  stopService: unsupported,
};
