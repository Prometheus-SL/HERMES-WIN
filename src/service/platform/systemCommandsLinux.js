const fs = require('fs');

const { commandExists, execFileText, spawnDetached } = require('./commandUtils');
const { createFeatureUnavailableError } = require('./errors');

function getSessionTargetArgs() {
  return process.env.XDG_SESSION_ID ? [process.env.XDG_SESSION_ID] : [];
}

async function lockScreen() {
  if (!commandExists('loginctl')) {
    throw createFeatureUnavailableError(
      'lock_screen',
      'loginctl is required to lock the screen on Linux.'
    );
  }

  await execFileText('loginctl', ['lock-session', ...getSessionTargetArgs()]);
}

async function openApp(params = {}) {
  const targetPath = params.path;
  const args = Array.isArray(params.args) ? params.args.map(String) : [];

  if (!targetPath) {
    throw new Error('Missing path');
  }

  if (fs.existsSync(targetPath) || commandExists(targetPath) || !commandExists('xdg-open')) {
    await spawnDetached(String(targetPath), args);
    return;
  }

  if (args.length > 0) {
    throw new Error('xdg-open does not support arbitrary arguments');
  }

  await spawnDetached('xdg-open', [String(targetPath)]);
}

async function sleepSystem(type = 'suspend') {
  if (!commandExists('systemctl')) {
    throw createFeatureUnavailableError(
      type,
      'systemctl is required for power management on Linux.'
    );
  }

  if (type === 'hibernate') {
    await execFileText('systemctl', ['hibernate']);
    return;
  }

  if (type === 'suspend') {
    await execFileText('systemctl', ['suspend']);
    return;
  }

  throw new Error('Unknown sleep type');
}

module.exports = {
  capabilities: {
    lockScreen: true,
    sleep: true,
    hibernate: true,
  },
  lockScreen,
  openApp,
  sleepSystem,
};
