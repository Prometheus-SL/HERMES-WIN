const { exec } = require('child_process');
const winvol = require('./win_volume');

class CommandExecutor {
  constructor(config) {
    this.config = config || { allowed_commands: ['volume', 'open_app', 'lock_screen', 'sleep'] };
  }

  isAllowed(commandType) {
    return this.config.allowed_commands.includes(commandType);
  }

  async execute(command) {
    if (!this.isAllowed(command.command_type)) {
      return { success: false, error: 'Command not allowed' };
    }

    try {
      switch (command.command_type) {
        case 'lock_screen':
          await this.lockScreen();
          return { success: true };
        case 'volume':
          await this.handleVolume(command.parameters);
          return { success: true };
        case 'open_app':
          await this.openApp(command.parameters);
          return { success: true };
        case 'sleep':
          await this.sleepSystem(command.parameters);
          return { success: true };
        default:
          return { success: false, error: 'Unknown command' };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  lockScreen() {
    return new Promise((resolve, reject) => {
      exec('rundll32.exe user32.dll,LockWorkStation', (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  handleVolume(params) {
    if (!params || !params.action) return Promise.reject(new Error('Invalid params'));
    if (params.action === 'mute' || params.action === 'unmute') {
      // Try native addon first
      if (winvol && typeof winvol.mute === 'function') {
        try {
          winvol.mute();
          return Promise.resolve();
        } catch (e) {
          // fallback
        }
      }
      return new Promise((resolve, reject) => {
        const cmd = `(New-Object -comObject 'WScript.Shell').SendKeys([char]173)`;
        exec(`powershell -Command "${cmd}"`, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }
    if (params.action === 'set' && typeof params.level === 'number') {
      // Placeholder: implement set with external tool or WASAPI binding later
      return Promise.reject(new Error('Set volume not implemented'));
    }
    return Promise.reject(new Error('Unknown volume action'));
  }

  openApp(params) {
    const path = params?.path;
    const args = params?.args || [];
    if (!path) return Promise.reject(new Error('Missing path'));
    return new Promise((resolve, reject) => {
      const child = exec(`"${path}" ${args.map(a=>`"${a}"`).join(' ')}`, (err) => {
        if (err) return reject(err);
        resolve();
      });
      // No window console for GUI apps is not trivial from node; accept default behavior for now
    });
  }

  sleepSystem(params) {
    const type = params?.type || 'suspend';
    if (type === 'suspend') {
      return new Promise((resolve, reject) => {
        exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0', (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }
    if (type === 'hibernate') {
      return new Promise((resolve, reject) => {
        exec('rundll32.exe powrprof.dll,SetSuspendState 1,1,0', (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }
    return Promise.reject(new Error('Unknown sleep type'));
  }
}

module.exports = CommandExecutor;
