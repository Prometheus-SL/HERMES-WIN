const http = require('http');
const EventEmitter = require('events');
const { randomUUID } = require('crypto');

const logger = require('./logger');
const {
  DEFAULT_MEDIA_BRIDGE_PORT,
  ensureRuntimeState,
  loadRuntimeState,
  saveRuntimeState,
} = require('./runtimeState');

const LOOPBACK_HOST = '127.0.0.1';
const MEDIA_HEARTBEAT_MS = 15000;
const MEDIA_COMMAND_TTL_MS = 30000;
const MAX_PENDING_COMMANDS = 20;
const MEDIA_COMMANDS = new Set([
  'media_refresh',
  'media_toggle_playback',
  'media_play',
  'media_pause',
  'media_next',
  'media_previous',
]);

function coerceString(value, fallback = '') {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value).trim();
}

function coerceUrl(value) {
  const candidate = coerceString(value);
  if (!candidate) return '';

  try {
    const parsed = new URL(candidate);
    return parsed.toString();
  } catch (_error) {
    return '';
  }
}

function coerceNumber(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric;
}

function normalizePlaybackStatus(value) {
  const candidate = coerceString(value).toLowerCase();
  if (candidate === 'playing') return 'playing';
  if (candidate === 'paused') return 'paused';
  if (candidate === 'stopped') return 'stopped';
  if (candidate === 'buffering') return 'buffering';
  return 'unknown';
}

function normalizeProvider(value) {
  const candidate = coerceString(value).toLowerCase();
  if (candidate === 'youtube') return 'youtube';
  if (candidate === 'twitch') return 'twitch';
  if (candidate === 'soundcloud') return 'soundcloud';
  return candidate || 'unknown';
}

function inferSourceAppId(provider, canonicalUrl, sourceAppId) {
  const explicit = coerceString(sourceAppId);
  if (explicit) return explicit;

  const url = coerceUrl(canonicalUrl);
  if (!url) return provider || 'browser';

  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch (_error) {
    return provider || 'browser';
  }
}

function inferSourceAppName(provider, sourceAppName, canonicalUrl) {
  const explicit = coerceString(sourceAppName);
  if (explicit) return explicit;

  if (provider === 'youtube') return 'YouTube';
  if (provider === 'twitch') return 'Twitch';
  if (provider === 'soundcloud') return 'SoundCloud';

  const url = coerceUrl(canonicalUrl);
  if (!url) return 'Browser media';

  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./i, '');
  } catch (_error) {
    return 'Browser media';
  }
}

function buildUnavailableSnapshot(mode, reason = null) {
  return {
    dataType: 'media_update',
    schemaVersion: 1,
    sampledAt: new Date().toISOString(),
    mode,
    error: coerceString(reason) || null,
    media: {
      available: false,
      sourceAppId: '',
      sourceAppName: '',
      provider: 'unknown',
      canonicalUrl: '',
      title: '',
      artist: '',
      album: '',
      artworkUrl: '',
      playbackStatus: 'unknown',
      positionMs: 0,
      durationMs: 0,
      canPlay: false,
      canPause: false,
      canNext: false,
      canPrevious: false,
      detectedVia: 'browser-extension',
    },
  };
}

function normalizeMediaUpdate(update = {}, mode = 'service') {
  const provider = normalizeProvider(update.provider);
  const canonicalUrl = coerceUrl(update.canonicalUrl || update.url);
  const playbackStatus = normalizePlaybackStatus(update.playbackStatus);
  const title = coerceString(update.title);
  const artist = coerceString(update.artist || update.channel);
  const album = coerceString(update.album);
  const artworkUrl = coerceUrl(update.artworkUrl || update.artwork);
  const sourceAppId = inferSourceAppId(provider, canonicalUrl, update.sourceAppId);
  const sourceAppName = inferSourceAppName(
    provider,
    update.sourceAppName,
    canonicalUrl
  );
  const positionMs = Math.max(0, Math.round(coerceNumber(update.positionMs)));
  const durationMs = Math.max(0, Math.round(coerceNumber(update.durationMs)));
  const available =
    typeof update.available === 'boolean'
      ? update.available
      : Boolean(title || canonicalUrl || playbackStatus === 'playing');

  return {
    dataType: 'media_update',
    schemaVersion: 1,
    sampledAt: new Date().toISOString(),
    mode,
    error: coerceString(update.error) || null,
    media: {
      available,
      sourceAppId,
      sourceAppName,
      provider,
      canonicalUrl,
      title,
      artist,
      album,
      artworkUrl,
      playbackStatus,
      positionMs,
      durationMs,
      canPlay:
        typeof update.canPlay === 'boolean'
          ? update.canPlay
          : playbackStatus !== 'playing',
      canPause:
        typeof update.canPause === 'boolean'
          ? update.canPause
          : playbackStatus === 'playing',
      canNext: Boolean(update.canNext),
      canPrevious: Boolean(update.canPrevious),
      detectedVia: coerceString(update.detectedVia || 'browser-extension'),
    },
  };
}

class MediaBridgeManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.platform = options.platform || process.platform;
    this.mode = options.mode || 'service';
    this.server = null;
    this.pendingCommands = [];
    this.currentSnapshot = buildUnavailableSnapshot(this.mode);
    this.heartbeatTimer = null;
    this.settingsPollTimer = null;
    this.lastClientSeenAt = null;
    this.status = 'disabled';
    this.lastError = null;
    this.boundPort = null;
  }

  _getSettings() {
    const state = ensureRuntimeState();
    const enabled =
      this.platform === 'win32' && Boolean(state.mediaTelemetryEnabled);
    const port =
      Number.isFinite(Number(state.mediaBridgePort)) &&
      Number(state.mediaBridgePort) > 0
        ? Number(state.mediaBridgePort)
        : DEFAULT_MEDIA_BRIDGE_PORT;

    if (!state.mediaBridgeToken) {
      const nextState = saveRuntimeState({});
      return {
        enabled,
        port,
        token: nextState.mediaBridgeToken,
      };
    }

    return {
      enabled,
      port,
      token: String(state.mediaBridgeToken),
    };
  }

  getStatusSnapshot() {
    const settings = this._getSettings();
    return {
      enabled: settings.enabled,
      port: this.boundPort || settings.port,
      status: this.status,
      lastError: this.lastError,
      lastClientSeenAt: this.lastClientSeenAt,
      hasClient: Boolean(
        this.lastClientSeenAt &&
          Date.now() - new Date(this.lastClientSeenAt).getTime() < 30000
      ),
      currentProvider: this.currentSnapshot?.media?.provider || 'unknown',
      currentTitle: this.currentSnapshot?.media?.title || '',
    };
  }

  _saveStatus() {
    saveRuntimeState({
      mediaBridgeStatus: this.getStatusSnapshot(),
    });
  }

  _setStatus(status, error = null) {
    this.status = status;
    this.lastError = error ? coerceString(error) : null;
    this._saveStatus();
    this.emit('status', this.getStatusSnapshot());
  }

  _clearTimers() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.settingsPollTimer) {
      clearInterval(this.settingsPollTimer);
      this.settingsPollTimer = null;
    }
  }

  _clearExpiredCommands() {
    const now = Date.now();
    this.pendingCommands = this.pendingCommands.filter((command) => {
      return now - new Date(command.issuedAt).getTime() < MEDIA_COMMAND_TTL_MS;
    });
  }

  _acknowledgeCommands(commandIds = []) {
    const idSet = new Set(
      (Array.isArray(commandIds) ? commandIds : [commandIds])
        .map((value) => coerceString(value))
        .filter(Boolean)
    );

    if (idSet.size === 0) return;
    this.pendingCommands = this.pendingCommands.filter(
      (command) => !idSet.has(command.id)
    );
  }

  _sendJson(res, statusCode, payload) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
  }

  _readJsonBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];

      req.on('data', (chunk) => {
        chunks.push(chunk);
      });

      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8').trim();
          resolve(raw ? JSON.parse(raw) : {});
        } catch (error) {
          reject(error);
        }
      });

      req.on('error', reject);
    });
  }

  _isAuthorized(req) {
    const settings = this._getSettings();
    const authHeader = coerceString(req.headers.authorization || '');
    return authHeader === `Bearer ${settings.token}`;
  }

  async _handleUpdate(req, res) {
    if (!this._isAuthorized(req)) {
      this._sendJson(res, 401, { ok: false, error: 'Unauthorized' });
      return;
    }

    try {
      const body = await this._readJsonBody(req);
      this._acknowledgeCommands(body.acknowledgedCommandIds);
      this._clearExpiredCommands();

      this.currentSnapshot = normalizeMediaUpdate(body, this.mode);
      this.lastClientSeenAt = new Date().toISOString();
      this._setStatus('running');
      this.emit('update', this.currentSnapshot);

      this._sendJson(res, 200, {
        ok: true,
        pendingCommands: this.pendingCommands,
      });
    } catch (error) {
      this._setStatus('error', error.message || String(error));
      this._sendJson(res, 400, {
        ok: false,
        error: error.message || 'Invalid media update payload',
      });
    }
  }

  async _handleStatus(req, res) {
    if (!this._isAuthorized(req)) {
      this._sendJson(res, 401, { ok: false, error: 'Unauthorized' });
      return;
    }

    this._clearExpiredCommands();
    this._sendJson(res, 200, {
      ok: true,
      status: this.getStatusSnapshot(),
      currentSnapshot: this.currentSnapshot,
      pendingCommands: this.pendingCommands,
    });
  }

  async _handleRequest(req, res) {
    const url = new URL(req.url || '/', `http://${LOOPBACK_HOST}`);

    if (req.method === 'POST' && url.pathname === '/v1/media/update') {
      await this._handleUpdate(req, res);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/media/status') {
      await this._handleStatus(req, res);
      return;
    }

    this._sendJson(res, 404, { ok: false, error: 'Not found' });
  }

  async _startServer() {
    const settings = this._getSettings();
    if (!settings.enabled) {
      this._setStatus('disabled');
      return;
    }

    if (this.server && this.boundPort === settings.port) {
      return;
    }

    if (this.server) {
      await this._stopServer();
    }

    this.server = http.createServer((req, res) => {
      void this._handleRequest(req, res).catch((error) => {
        logger.warn(`Media bridge request failed: ${error.message || error}`);
        this._sendJson(res, 500, { ok: false, error: 'Internal media bridge error' });
      });
    });

    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(settings.port, LOOPBACK_HOST, () => {
        this.server.removeListener('error', reject);
        resolve();
      });
    });

    this.boundPort = settings.port;
    this._setStatus('starting');
    logger.info(`Media bridge listening on http://${LOOPBACK_HOST}:${settings.port}`);
  }

  async _stopServer() {
    if (!this.server) {
      this.boundPort = null;
      return;
    }

    await new Promise((resolve) => {
      this.server.close(() => resolve());
    });

    this.server = null;
    this.boundPort = null;
  }

  async _refreshSettings() {
    const settings = this._getSettings();

    if (!settings.enabled) {
      await this._stopServer();
      this._setStatus('disabled');
      return;
    }

    try {
      await this._startServer();
      if (this.status !== 'running') {
        this._setStatus('running');
      }
    } catch (error) {
      logger.warn(`Media bridge failed to start: ${error.message || error}`);
      this._setStatus('error', error.message || String(error));
    }
  }

  async start() {
    if (this.platform !== 'win32') {
      this._setStatus('disabled', 'Media bridge is only available on Windows.');
      return;
    }

    await this._refreshSettings();

    this.heartbeatTimer = setInterval(() => {
      if (this.currentSnapshot?.media?.available) {
        const heartbeat = {
          ...this.currentSnapshot,
          sampledAt: new Date().toISOString(),
        };
        this.currentSnapshot = heartbeat;
        this.emit('update', heartbeat);
      }
    }, MEDIA_HEARTBEAT_MS);

    this.settingsPollTimer = setInterval(() => {
      void this._refreshSettings();
    }, 5000);
  }

  async stop() {
    this._clearTimers();
    await this._stopServer();
    this._setStatus('disabled');
  }

  getCurrentSnapshot() {
    return this.currentSnapshot;
  }

  hasActiveMedia() {
    return Boolean(this.currentSnapshot?.media?.available);
  }

  queueCommand(command, parameters = {}) {
    if (!MEDIA_COMMANDS.has(command)) {
      throw new Error('Unsupported media command');
    }

    const settings = this._getSettings();
    if (!settings.enabled) {
      throw new Error('Media telemetry is disabled on this machine.');
    }

    this._clearExpiredCommands();

    const queuedCommand = {
      id: randomUUID(),
      command,
      parameters,
      issuedAt: new Date().toISOString(),
    };

    this.pendingCommands.push(queuedCommand);
    this.pendingCommands = this.pendingCommands.slice(-MAX_PENDING_COMMANDS);

    return {
      queued: true,
      commandId: queuedCommand.id,
      media: this.currentSnapshot?.media || null,
    };
  }
}

module.exports = MediaBridgeManager;
module.exports.normalizeMediaUpdate = normalizeMediaUpdate;
module.exports.buildUnavailableSnapshot = buildUnavailableSnapshot;
