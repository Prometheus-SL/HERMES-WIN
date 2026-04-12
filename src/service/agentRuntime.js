const EventEmitter = require('events');
const { io } = require('socket.io-client');
const logger = require('./logger');
const AuthManager = require('./auth');
const CommandExecutor = require('./commandExecutor');
const MediaBridgeManager = require('./mediaBridgeManager');
const { getPreferredSocketUrl } = require('./serverUrl');
const {
  ensureRuntimeState,
  loadRuntimeState,
  saveRuntimeState,
} = require('./runtimeState');
const { collectSystemSnapshot } = require('./systemSnapshot');

const RETRY_DELAY_MS = 15000;
const SNAPSHOT_AFTER_COMMANDS = new Set([
  'volume_set',
  'volume_mute',
  'volume_unmute',
  'volume_up',
  'volume_down',
  'audio_output_set',
  'get_audio_state',
]);
const MEDIA_COMMANDS = new Set([
  'media_refresh',
  'media_toggle_playback',
  'media_play',
  'media_pause',
  'media_next',
  'media_previous',
]);

class AgentRuntime extends EventEmitter {
  constructor(options = {}) {
    super();
    this.mode = options.mode || 'manual';
    this.auth = new AuthManager();
    this.mediaBridgeManager = new MediaBridgeManager({ mode: this.mode });
    this.commandExecutor = new CommandExecutor({
      mediaBridgeManager: this.mediaBridgeManager,
    });
    this.socket = null;
    this.running = false;
    this.monitorTimer = null;
    this.retryTimer = null;
    this.status = {
      mode: this.mode,
      lifecycle: 'idle',
      connected: false,
      authenticated: false,
      agentId: ensureRuntimeState().agentId,
      serverUrl: loadRuntimeState().serverUrl || '',
      monitoringIntervalMs: loadRuntimeState().monitoringIntervalMs,
      lastSnapshotAt: null,
      lastError: null,
      mediaBridge: this.mediaBridgeManager.getStatusSnapshot(),
    };

    this.mediaBridgeManager.on('status', (mediaBridgeStatus) => {
      this._setStatus({ mediaBridge: mediaBridgeStatus });
    });

    this.mediaBridgeManager.on('update', (snapshot) => {
      this._setStatus({
        mediaBridge: this.mediaBridgeManager.getStatusSnapshot(),
      });
      void this.sendMediaSnapshot(snapshot);
    });
  }

  getStatus() {
    const latest = loadRuntimeState();
    return {
      ...this.status,
      agentId: latest.agentId,
      serverUrl: latest.serverUrl || '',
      monitoringIntervalMs: latest.monitoringIntervalMs,
      hasAccessToken: Boolean(latest.accessToken),
      hasRefreshToken: Boolean(latest.refreshToken),
      lastAuthAt: latest.lastAuthAt || null,
      mediaBridge:
        this.status.mediaBridge ||
        latest.mediaBridgeStatus ||
        this.mediaBridgeManager.getStatusSnapshot(),
    };
  }

  _setStatus(patch = {}) {
    this.status = {
      ...this.status,
      ...patch,
      mode: this.mode,
    };
    const publicStatus = this.getStatus();
    saveRuntimeState({
      [`${this.mode}Runtime`]: publicStatus,
    });
    this.emit('status', publicStatus);
  }

  async start() {
    this.running = true;
    this._setStatus({ lifecycle: 'starting', lastError: null });
    await this.mediaBridgeManager.start();
    await this._connectOrWait();
  }

  async stop() {
    this.running = false;
    this._clearMonitoring();
    this._clearRetry();

    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.disconnect();
      } catch (_error) {
        // noop
      }
      this.socket = null;
    }

    await this.mediaBridgeManager.stop();

    this._setStatus({
      lifecycle: 'stopped',
      connected: false,
      authenticated: false,
    });
  }

  async restart() {
    await this.stop();
    await this.start();
  }

  async _connectOrWait() {
    if (!this.running) return;

    const state = ensureRuntimeState();
    this._setStatus({
      agentId: state.agentId,
      serverUrl: state.serverUrl || '',
      monitoringIntervalMs: state.monitoringIntervalMs,
    });

    if (!state.serverUrl) {
      this._setStatus({
        lifecycle: 'waiting-auth',
        authenticated: false,
        connected: false,
        lastError: 'No server configured yet.',
      });
      this._scheduleRetry();
      return;
    }

    let token = null;
    try {
      token = await this.auth.ensureValidToken();
    } catch (error) {
      logger.warn(`Auth ensure failed: ${error.message || error}`);
    }

    if (!token) {
      this._setStatus({
        lifecycle: 'waiting-auth',
        authenticated: false,
        connected: false,
        lastError: 'No valid session available. Waiting for app login.',
      });
      this._scheduleRetry();
      return;
    }

    this._clearRetry();
    await this._connectSocket(state.serverUrl, state.agentId, token);
  }

  async _connectSocket(serverUrl, agentId, token) {
    const socketUrl = getPreferredSocketUrl(serverUrl);
    this._setStatus({
      lifecycle: 'connecting',
      connected: false,
      authenticated: true,
      lastError: null,
      serverUrl: socketUrl,
    });

    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.disconnect();
      } catch (_error) {
        // noop
      }
      this.socket = null;
    }

    const socket = io(socketUrl, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelayMax: 15000,
      timeout: 20000,
    });

    this.socket = socket;

    socket.on('connect', async () => {
      const latestState = loadRuntimeState();
      const identifyToken = (await this.auth.ensureValidToken()) || token;

      logger.info(`Runtime connected (${this.mode}) to ${socketUrl}`);
      socket.emit('identify', {
        type: 'agent',
        agentId: latestState.agentId || agentId,
        mode: this.mode,
        token: identifyToken,
      });

      this._setStatus({
        lifecycle: 'running',
        connected: true,
        authenticated: true,
        lastError: null,
      });

      this._startMonitoring();

      setTimeout(() => {
        void this.sendSystemSnapshot();
      }, 200);
      setTimeout(() => {
        void this.sendMediaSnapshot();
      }, 350);
    });

    socket.on('disconnect', (reason) => {
      logger.warn(`Runtime disconnected (${this.mode}): ${reason}`);
      this._clearMonitoring();
      this._setStatus({
        connected: false,
        lifecycle: this.running ? 'reconnecting' : 'stopped',
      });

      if (reason === 'io server disconnect') {
        void this._handleRecoverableAuthFailure('Server closed the connection.');
      }
    });

    socket.on('connect_error', (error) => {
      logger.warn(`Runtime connect error (${this.mode}): ${error.message || error}`);
      this._setStatus({
        connected: false,
        lifecycle: 'reconnecting',
        lastError: error.message || String(error),
      });
    });

    socket.on('error', (payload = {}) => {
      const message = payload.message || String(payload);
      logger.warn(`Runtime socket error (${this.mode}): ${message}`);

      if (/token|auth|autentic/i.test(message)) {
        void this._handleRecoverableAuthFailure(message);
      } else {
        this._setStatus({ lastError: message });
      }
    });

    socket.on('command', async (command) => {
      const commandId = command?.commandId || command?.request_id || null;
      const commandType = command?.command_type || command?.command || null;
      const startedAt = Date.now();

      try {
        if (commandId) {
          socket.emit('command-received', { commandId });
        }

        const result = await this.commandExecutor.execute(command);
        socket.emit('command-response', {
          commandId,
          success: Boolean(result?.success),
          result: result?.data ?? result?.result ?? result ?? null,
          error: result?.error || null,
          errorCode: result?.errorCode || null,
          executionTime: Date.now() - startedAt,
        });

        if (Boolean(result?.success) && SNAPSHOT_AFTER_COMMANDS.has(commandType)) {
          setTimeout(() => {
            void this.sendSystemSnapshot();
          }, 100);
        }

        if (Boolean(result?.success) && MEDIA_COMMANDS.has(commandType)) {
          setTimeout(() => {
            void this.sendMediaSnapshot();
          }, 100);
        }
      } catch (error) {
        socket.emit('command-response', {
          commandId,
          success: false,
          error: error.message || String(error),
          errorCode: error.code || null,
          executionTime: Date.now() - startedAt,
        });
      }
    });
  }

  async _handleRecoverableAuthFailure(message) {
    this.auth.invalidateSessionTokens();
    this._clearMonitoring();

    if (this.socket) {
      try {
        this.socket.disconnect();
      } catch (_error) {
        // noop
      }
    }

    this._setStatus({
      connected: false,
      authenticated: false,
      lifecycle: 'waiting-auth',
      lastError: message,
    });
    this._scheduleRetry();
  }

  _startMonitoring() {
    this._clearMonitoring();

    const { monitoringIntervalMs } = loadRuntimeState();
    this.monitorTimer = setInterval(() => {
      void this.sendSystemSnapshot();
    }, monitoringIntervalMs);
  }

  _clearMonitoring() {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }

  _scheduleRetry() {
    if (!this.running || this.retryTimer) {
      return;
    }

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this._connectOrWait();
    }, RETRY_DELAY_MS);
  }

  _clearRetry() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  async sendSystemSnapshot() {
    if (!this.running || !this.socket || !this.socket.connected) {
      return null;
    }

    try {
      const snapshot = await collectSystemSnapshot(this.mode);
      this.socket.emit('agent-data', snapshot);
      this._setStatus({
        lastSnapshotAt: snapshot.sampledAt,
        lastError: null,
        serverUrl: getPreferredSocketUrl(loadRuntimeState().serverUrl || ''),
      });
      return snapshot;
    } catch (error) {
      logger.warn(`Failed to collect snapshot: ${error.message || error}`);
      this._setStatus({
        lastError: error.message || String(error),
      });
      return null;
    }
  }

  async sendMediaSnapshot(snapshotOverride = null) {
    if (!this.running || !this.socket || !this.socket.connected) {
      return null;
    }

    try {
      const snapshot = snapshotOverride || this.mediaBridgeManager.getCurrentSnapshot();
      if (!snapshot?.media) {
        return null;
      }

      this.socket.emit('agent-data', {
        ...snapshot,
        mode: this.mode,
      });
      this._setStatus({
        mediaBridge: this.mediaBridgeManager.getStatusSnapshot(),
        lastError: null,
      });
      return snapshot;
    } catch (error) {
      logger.warn(`Failed to publish media snapshot: ${error.message || error}`);
      this._setStatus({
        mediaBridge: this.mediaBridgeManager.getStatusSnapshot(),
        lastError: error.message || String(error),
      });
      return null;
    }
  }
}

module.exports = AgentRuntime;
