const { spawnDetached, execFileText } = require('./commandUtils');

async function lockScreen() {
  await execFileText('rundll32.exe', ['user32.dll,LockWorkStation']);
}

async function openApp(params = {}) {
  const targetPath = params.path;
  const args = Array.isArray(params.args) ? params.args.map(String) : [];

  if (!targetPath) {
    throw new Error('Missing path');
  }

  await spawnDetached(String(targetPath), args);
}

async function sleepSystem(type = 'suspend') {
  if (type === 'hibernate') {
    await execFileText('rundll32.exe', ['powrprof.dll,SetSuspendState', '1,1,0']);
    return;
  }

  if (type === 'suspend') {
    await execFileText('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']);
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
