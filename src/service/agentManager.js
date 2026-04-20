const EventEmitter = require('events');
const fs = require('fs');
const credentials = require('./credentials');
const logger = require('./logger');
const AuthManager = require('./auth');
const AgentRuntime = require('./agentRuntime');
const serviceManager = require('./serviceManager');
const { buildStatusPayload } = require('./statusPayload');
const {
    ensureRuntimeState,
    getPublicRuntimeState,
    invalidateRuntimeStateCache,
    loadRuntimeState,
    saveRuntimeState,
    RUNTIME_STATE_FILE,
} = require('./runtimeState');

const SERVICE_CHECK_INTERVAL_MS = 30_000;

class AgentManager extends EventEmitter {
    constructor() {
        super();
        this.started = false;
        this.statusPoller = null;
        this._fileWatcher = null;
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
        }, SERVICE_CHECK_INTERVAL_MS);
        this._startFileWatcher();
        this.emit('status', await this.getStatusSnapshot());
    }

    _startFileWatcher() {
        if (this._fileWatcher) return;
        try {
            this._fileWatcher = fs.watch(RUNTIME_STATE_FILE, { persistent: false }, () => {
                invalidateRuntimeStateCache();
                void this._syncManualRuntimeWithService();
            });
            this._fileWatcher.on('error', () => {
                this._stopFileWatcher();
            });
        } catch (_error) {
            // File may not exist yet; polling will cover it
        }
    }

    _stopFileWatcher() {
        if (this._fileWatcher) {
            this._fileWatcher.close();
            this._fileWatcher = null;
        }
    }

    async stop() {
        if (this.statusPoller) {
            clearInterval(this.statusPoller);
            this.statusPoller = null;
        }
        this._stopFileWatcher();
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
        const result = await serviceManager.installService();
        await this._syncManualRuntimeWithService();
        this.emit('status', await this.getStatusSnapshot());
        return result;
    }

    async uninstallService() {
        const result = await serviceManager.uninstallService();
        await this._syncManualRuntimeWithService();
        this.emit('status', await this.getStatusSnapshot());
        return result;
    }

    async startService() {
        const result = await serviceManager.startService();
        await this._syncManualRuntimeWithService();
        this.emit('status', await this.getStatusSnapshot());
        return result;
    }

    async stopService() {
        const result = await serviceManager.stopService();
        await this._syncManualRuntimeWithService();
        this.emit('status', await this.getStatusSnapshot());
        return result;
    }

    async updateMediaSettings(settings = {}) {
        const current = loadRuntimeState();
        const patch = {};

        if (typeof settings.mediaTelemetryEnabled === 'boolean') {
            patch.mediaTelemetryEnabled = settings.mediaTelemetryEnabled;
        }

        if (Number.isFinite(Number(settings.mediaBridgePort)) && Number(settings.mediaBridgePort) > 0) {
            patch.mediaBridgePort = Number(settings.mediaBridgePort);
        }

        if (typeof settings.mediaBridgeToken === 'string' && settings.mediaBridgeToken.trim()) {
            patch.mediaBridgeToken = settings.mediaBridgeToken.trim();
        }

        saveRuntimeState({
            ...current,
            ...patch,
        });

        if (this.manualRuntime.running) {
            this.manualRuntime._setStatus({
                mediaBridge: this.manualRuntime.mediaBridgeManager.getStatusSnapshot(),
            });
        }

        this.emit('status', await this.getStatusSnapshot());
        return this.getStatusSnapshot();
    }

    async getStatusSnapshot() {
        const service = await this._safeGetServiceStatus();
        const runtimeState = getPublicRuntimeState();
        return buildStatusPayload({
            runtime: this._selectRuntimeStatus(service, runtimeState),
            runtimeState,
            service,
            hasStoredCredentials: await credentials.hasCredentials(),
        });
    }

    getStatusSnapshotSync() {
        const service = serviceManager.normalizeServiceStatus({
            installed: false,
            running: false,
            status: 'unknown',
        });
        const runtimeState = getPublicRuntimeState();
        return buildStatusPayload({
            runtime: this._selectRuntimeStatus(service, runtimeState),
            runtimeState,
        });
    }

    async _syncManualRuntimeWithService() {
        const serviceStatus = await this._safeGetServiceStatus();
        const runtimeState = loadRuntimeState({ force: true });
        const publicRuntimeState = getPublicRuntimeState();

        if (serviceStatus.installed && serviceStatus.supported) {
            if (this.manualRuntime.running) {
                logger.info('Service detected, stopping manual runtime to avoid duplicate agents.');
                await this.manualRuntime.stop();
            }
            this.emit('status', buildStatusPayload({
                runtime: this._selectRuntimeStatus(serviceStatus, publicRuntimeState),
                runtimeState: publicRuntimeState,
                service: serviceStatus,
            }));
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
            return await serviceManager.getServiceStatus();
        } catch (error) {
            logger.warn(`Service status check failed: ${error.message || error}`);
            return serviceManager.normalizeServiceStatus({
                installed: false,
                status: 'unknown',
                running: false,
                canStop: false,
                error: error.message || String(error),
            });
        }
    }

    _selectRuntimeStatus(serviceStatus, runtimeState) {
        const manualRuntime = runtimeState?.manualRuntime;
        const serviceRuntime = runtimeState?.serviceRuntime;

        if (serviceStatus?.installed && serviceStatus?.supported) {
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
