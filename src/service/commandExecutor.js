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
        this.mediaBridgeManager = config?.mediaBridgeManager || null;
        this.config = config || {
            allowed_commands: [
                'volume_set',
                'volume_mute',
                'volume_unmute',
                'volume_up',
                'volume_down',
                'audio_output_set',
                'get_audio_state',
                'media_refresh',
                'media_toggle_playback',
                'media_play',
                'media_pause',
                'media_next',
                'media_previous',
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

        if (typeof commandType !== 'string' || !this.isAllowed(commandType)) {
            return { success: false, error: 'Command not allowed' };
        }

        const parameters = command?.parameters && typeof command.parameters === 'object'
            ? command.parameters
            : {};

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
                case 'volume_set': {
                    const level = Number(parameters.level);
                    if (!Number.isFinite(level) || level < 0 || level > 100) {
                        return { success: false, error: 'Volume level must be a number between 0 and 100' };
                    }
                    return {
                        success: true,
                        data: { audio: await this.handleVolume({ action: 'set', level }) }
                    };
                }
                case 'audio_output_set': {
                    const deviceId = String(parameters.deviceId || parameters.id || '').trim();
                    if (!deviceId) {
                        return { success: false, error: 'deviceId is required for audio_output_set' };
                    }
                    return {
                        success: true,
                        data: { audio: await setDefaultOutputDevice(deviceId) }
                    };
                }
                case 'get_audio_state':
                    return { success: true, data: { audio: await getAudioState() } };
                case 'media_refresh':
                    return { success: true, data: { media: await this.getMediaState() } };
                case 'media_toggle_playback':
                case 'media_play':
                case 'media_pause':
                case 'media_next':
                case 'media_previous':
                    return {
                        success: true,
                        data: {
                            media: await this.queueMediaCommand(commandType, parameters)
                        }
                    };
                case 'open_app': {
                    if (!parameters || typeof parameters !== 'object') {
                        return { success: false, error: 'Parameters are required for open_app' };
                    }
                    const appName = String(parameters.name || parameters.app || '').trim();
                    if (!appName || /[;&|`$]/.test(appName)) {
                        return { success: false, error: 'Invalid or missing app name' };
                    }
                    await systemCommands.openApp(parameters);
                    return { success: true };
                }
                case 'sleep': {
                    const sleepType = String(parameters.type || 'suspend').trim();
                    if (!['suspend', 'hibernate'].includes(sleepType)) {
                        return { success: false, error: 'Invalid sleep type. Use "suspend" or "hibernate".' };
                    }
                    await systemCommands.sleepSystem(sleepType);
                    return { success: true };
                }
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

    async getMediaState() {
        if (!this.mediaBridgeManager) {
            throw new Error('Media bridge manager is not available.');
        }

        return this.mediaBridgeManager.getCurrentSnapshot()?.media || null;
    }

    async queueMediaCommand(commandType, parameters = {}) {
        if (!this.mediaBridgeManager) {
            throw new Error('Media bridge manager is not available.');
        }

        const result = this.mediaBridgeManager.queueCommand(commandType, parameters);
        return {
            ...(result.media || {}),
            queued: Boolean(result.queued),
            queuedCommandId: result.commandId || null,
        };
    }

}

module.exports = CommandExecutor;
