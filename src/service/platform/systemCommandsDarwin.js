const { spawnDetached } = require('./commandUtils');
const { createFeatureUnavailableError } = require('./errors');

function unsupported(feature, message) {
  throw createFeatureUnavailableError(feature, message);
}

async function openApp(params = {}) {
  const targetPath = params.path;
  const args = Array.isArray(params.args) ? params.args.map(String) : [];

  if (!targetPath) {
    throw new Error('Missing path');
  }

  const openArgs = targetPath.endsWith('.app')
    ? ['-a', String(targetPath)]
    : [String(targetPath)];

  if (args.length > 0) {
    openArgs.push('--args', ...args);
  }

  await spawnDetached('open', openArgs);
}

module.exports = {
  capabilities: {
    lockScreen: false,
    sleep: false,
    hibernate: false,
  },
  lockScreen: () =>
    unsupported('lock_screen', 'Lock screen is not implemented on macOS yet.'),
  openApp,
  sleepSystem: (type = 'suspend') =>
    unsupported(type, `Power management '${type}' is not implemented on macOS yet.`),
};
