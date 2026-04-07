const { execFile, spawn, spawnSync } = require('child_process');

function execFileText(file, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        windowsHide: true,
        timeout: options.timeout || 15000,
        cwd: options.cwd,
        env: options.env,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(String(stderr || error.message || 'Command failed').trim()));
          return;
        }

        resolve(String(stdout || '').trim());
      }
    );
  });
}

function commandExists(command) {
  const lookupCommand = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(lookupCommand, [command], {
    stdio: 'ignore',
    windowsHide: true,
  });
  return result.status === 0;
}

function spawnDetached(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: false,
    });

    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

module.exports = {
  commandExists,
  execFileText,
  spawnDetached,
};
