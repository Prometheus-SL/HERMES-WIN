const EventEmitter = require('events');
const credentials = require('./credentials');
const logger = require('./logger');
const AuthManager = require('./auth');
const AgentRuntime = require('./agentRuntime');
const serviceWindows = require('./serviceWindows');
const {
    ensureRuntimeState,
    getPublicRuntimeState,
    loadRuntimeState,
} = require('./runtimeState');

class AgentManager extends EventEmitter {
    constructor() {
        super();
        this.started = false;
        this.statusPoller = null;
        this.manualRuntime = new AgentRuntime({ mode: 'manual' });
        this.manualRuntime.on('status', () => {
            this.emit('status', this.getStatusSnapshotSync());
        });
    }

    async start() {
        if (this.started) return;
        this.started = true;
        ensureRuntimeState();
        await this._syncManualRuntimeWithService();
        this.statusPoller = setInterval(() => {
            void this._syncManualRuntimeWithService();
        }, 5000);
        this.emit('status', await this.getStatusSnapshot());
    }

    async stop() {
        if (this.statusPoller) {
            clearInterval(this.statusPoller);
            this.statusPoller = null;
        }
        await this.manualRuntime.stop();
        this.emit('status', await this.getStatusSnapshot());
    }

    async loginAndPersist(creds) {
        await credentials.storeCredentials(creds);
        const auth = new AuthManager();
        await auth.loginWithCredentials({
            email: creds.email,
            password: creds.password,
            serverUrl: creds.server_url,
        });

        await this._syncManualRuntimeWithService();
        this.emit('status', await this.getStatusSnapshot());
        return this.getStatusSnapshot();
    }

    async clearCredentials() {
        const auth = new AuthManager();
        await auth.clearCredentials();
        await this._syncManualRuntimeWithService();
        this.emit('status', await this.getStatusSnapshot());
        return this.getStatusSnapshot();
    }

    async restartRuntime() {
        const serviceStatus = await this._safeGetServiceStatus();
        if (serviceStatus.installed) {
            this.emit('status', await this.getStatusSnapshot());
            return this.getStatusSnapshot();
        }

        await this.manualRuntime.restart();
        this.emit('status', await this.getStatusSnapshot());
        return this.getStatusSnapshot();
    }

    async installService() {
        const result = await serviceWindows.installService();
        await this._syncManualRuntimeWithService();
        this.emit('status', await this.getStatusSnapshot());
        return result;
    }

    async uninstallService() {
        const result = await serviceWindows.uninstallService();
        await this._syncManualRuntimeWithService();
        this.emit('status', await this.getStatusSnapshot());
        return result;
    }

    async startService() {
        const result = await serviceWindows.startService();
        await this._syncManualRuntimeWithService();
        this.emit('status', await this.getStatusSnapshot());
        return result;
    }

    async stopService() {
        const result = await serviceWindows.stopService();
        await this._syncManualRuntimeWithService();
        this.emit('status', await this.getStatusSnapshot());
        return result;
    }

    async getStatusSnapshot() {
        const service = await this._safeGetServiceStatus();
        const runtimeState = getPublicRuntimeState();
        return {
            runtime: this._selectRuntimeStatus(service, runtimeState),
            runtimeState,
            service,
            hasStoredCredentials: await credentials.hasCredentials(),
        };
    }

    getStatusSnapshotSync() {
        const service = {
            installed: false,
            running: false,
            status: 'unknown',
        };
        const runtimeState = getPublicRuntimeState();
        return {
            runtime: this._selectRuntimeStatus(service, runtimeState),
            runtimeState,
        };
    }

    async _syncManualRuntimeWithService() {
        const serviceStatus = await this._safeGetServiceStatus();
        const runtimeState = loadRuntimeState();
        const publicRuntimeState = getPublicRuntimeState();

        if (serviceStatus.installed) {
            if (this.manualRuntime.running) {
                logger.info('Service detected, stopping manual runtime to avoid duplicate agents.');
                await this.manualRuntime.stop();
            }
            this.emit('status', {
                runtime: this._selectRuntimeStatus(serviceStatus, publicRuntimeState),
                runtimeState: publicRuntimeState,
                service: serviceStatus,
            });
            return;
        }

        if (!runtimeState.serverUrl) {
            if (!this.manualRuntime.running) {
                await this.manualRuntime.start();
            }
            return;
        }

        if (!this.manualRuntime.running) {
            await this.manualRuntime.start();
        }
    }

    async _safeGetServiceStatus() {
        try {
            return await serviceWindows.getServiceStatus();
        } catch (error) {
            logger.warn(`Service status check failed: ${error.message || error}`);
            return {
                name: serviceWindows.SERVICE_NAME,
                installed: false,
                status: 'unknown',
                running: false,
                canStop: false,
                error: error.message || String(error),
            };
        }
    }

    _selectRuntimeStatus(serviceStatus, runtimeState) {
        const manualRuntime = runtimeState?.manualRuntime;
        const serviceRuntime = runtimeState?.serviceRuntime;

        if (serviceStatus?.installed) {
            if (serviceRuntime) {
                return serviceRuntime;
            }

            return {
                ...this.manualRuntime.getStatus(),
                mode: 'service',
                lifecycle: serviceStatus.running ? 'running' : 'stopped',
                connected: false,
                authenticated: Boolean(
                    runtimeState?.hasAccessToken || runtimeState?.hasRefreshToken
                ),
                agentId: runtimeState?.agentId || this.manualRuntime.getStatus().agentId,
                serverUrl: runtimeState?.serverUrl || this.manualRuntime.getStatus().serverUrl,
                monitoringIntervalMs:
                    runtimeState?.monitoringIntervalMs ||
                    this.manualRuntime.getStatus().monitoringIntervalMs,
                lastAuthAt: runtimeState?.lastAuthAt || null,
                lastError: null,
            };
        }

        return manualRuntime || this.manualRuntime.getStatus();
    }
}

module.exports = AgentManager;
