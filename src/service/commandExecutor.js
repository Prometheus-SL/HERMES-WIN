const { exec } = require('child_process');
const winvol = require('./win_volume');
const {
    adjustVolume,
    getAudioState,
    setDefaultOutputDevice,
    setMuted,
    setVolume,
} = require('./audioControl');
const systemCommands = require('./platform/systemCommands');
const { collectSystemSnapshot } = require('./systemSnapshot');

class CommandExecutor {
    constructor(config) {
        this.config = config || {
            allowed_commands: [
                'volume_set',
                'volume_mute',
                'volume_unmute',
                'volume_up',
                'volume_down',
                'audio_output_set',
                'get_audio_state',
                'open_app',
                'lock_screen',
                'sleep',
                'hibernate',
                'get_system_info',
                'get_performance',
                'get_network_info',
                'restart_agent',
            ],
        };
    }

    isAllowed(commandType) {
        return this.config.allowed_commands.includes(commandType);
    }

    async execute(command) {
        const commandType = command?.command_type || command?.command || '';

        if (!this.isAllowed(commandType)) {
            return { success: false, error: 'Command not allowed' };
        }

        try {
            switch (commandType) {
                case 'lock_screen':
                    await systemCommands.lockScreen();
                    return { success: true };
                case 'volume_mute':
                    return { success: true, data: { audio: await this.handleVolume({ action: 'mute' }) } };
                case 'volume_unmute':
                    return { success: true, data: { audio: await this.handleVolume({ action: 'unmute' }) } };
                case 'volume_up':
                    return { success: true, data: { audio: await this.stepVolume('up') } };
                case 'volume_down':
                    return { success: true, data: { audio: await this.stepVolume('down') } };
                case 'volume_set':
                    return {
                        success: true,
                        data: { audio: await this.handleVolume({ action: 'set', level: command.parameters?.level }) }
                    };
                case 'audio_output_set':
                    return {
                        success: true,
                        data: {
                            audio: await setDefaultOutputDevice(
                                command.parameters?.deviceId || command.parameters?.id
                            )
                        }
                    };
                case 'get_audio_state':
                    return { success: true, data: { audio: await getAudioState() } };
                case 'open_app':
                    await systemCommands.openApp(command.parameters);
                    return { success: true };
                case 'sleep':
                    await systemCommands.sleepSystem(command.parameters?.type || 'suspend');
                    return { success: true };
                case 'hibernate':
                    await systemCommands.sleepSystem('hibernate');
                    return { success: true };
                case 'get_system_info': {
                    const snapshot = await collectSystemSnapshot('command');
                    return { success: true, data: snapshot.system };
                }
                case 'get_performance': {
                    const snapshot = await collectSystemSnapshot('command');
                    return { success: true, data: snapshot.resources };
                }
                case 'get_network_info': {
                    const snapshot = await collectSystemSnapshot('command');
                    return { success: true, data: snapshot.network };
                }
                case 'restart_agent':
                    process.nextTick(() => process.exit(0));
                    return { success: true, data: { restarting: true } };
                default:
                    return { success: false, error: 'Unknown command' };
            }
        } catch (e) {
            return {
                success: false,
                error: e.message,
                errorCode: e.code || null,
            };
        }
    }

    handleVolume(params) {
        if (!params || !params.action) return Promise.reject(new Error('Invalid params'));
        if (params.action === 'mute' || params.action === 'unmute') {
            return setMuted(params.action === 'mute').catch(() => {
                if (process.platform !== 'win32') {
                    throw new Error('Audio mute fallback is only available on Windows.');
                }

                if (winvol && typeof winvol.mute === 'function') {
                    try {
                        winvol.mute();
                        return getAudioState();
                    } catch (_error) {
                        // fallback below
                    }
                }

                return new Promise((resolve, reject) => {
                    const cmd = `(New-Object -comObject 'WScript.Shell').SendKeys([char]173)`;
                    exec(`powershell -Command "${cmd}"`, (err) => {
                        if (err) return reject(err);
                        void getAudioState().then(resolve).catch(reject);
                    });
                });
            });
        }
        if (params.action === 'set' && typeof params.level === 'number') {
            return setVolume(params.level);
        }
        return Promise.reject(new Error('Unknown volume action'));
    }

    stepVolume(direction) {
        const delta = direction === 'up' ? 5 : -5;
        if (Number.isFinite(delta)) {
            return adjustVolume(delta).catch(() => this.stepVolumeFallback(direction));
        }

        return this.stepVolumeFallback(direction);
    }

    stepVolumeFallback(direction) {
        if (process.platform !== 'win32') {
            return Promise.reject(new Error('Audio step fallback is only available on Windows.'));
        }

        if (direction === 'up' && winvol && typeof winvol.volume_up === 'function') {
            try {
                winvol.volume_up();
                return getAudioState();
            } catch (_error) {
                // fallback below
            }
        }

        if (direction === 'down' && winvol && typeof winvol.volume_down === 'function') {
            try {
                winvol.volume_down();
                return getAudioState();
            } catch (_error) {
                // fallback below
            }
        }

        const key = direction === 'up' ? 175 : 174;
        return new Promise((resolve, reject) => {
            const cmd = `(New-Object -comObject 'WScript.Shell').SendKeys([char]${key})`;
            exec(`powershell -Command "${cmd}"`, (err) => {
                if (err) return reject(err);
                void getAudioState().then(resolve).catch(reject);
            });
        });
    }

}

module.exports = CommandExecutor;
