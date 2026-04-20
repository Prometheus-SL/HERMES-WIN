const fs = require('fs');
const fsPromises = require('fs').promises;
const os = require('os');
const { randomBytes, createHash, createCipheriv, createDecipheriv } = require('crypto');
const { normalizeServerUrl } = require('./serverUrl');
const {
  getRuntimeStateDirectory,
  getRuntimeStateFilePath,
} = require('./platform/paths');

const DEFAULT_MONITORING_INTERVAL_MS = 30000;
const DEFAULT_MEDIA_BRIDGE_PORT = 47653;
const PROGRAM_DATA_DIR = getRuntimeStateDirectory();
const RUNTIME_STATE_FILE = getRuntimeStateFilePath();
const DEBOUNCE_MS = 500;

let _cachedState = null;
let _writeTimer = null;
let _writing = false;
let _pendingStateToWrite = null;

function getRuntimeEncryptionKey() {
  const machineId = os.hostname() + os.userInfo().username;
  return createHash('sha256').update('hermes-runtime-' + machineId).digest();
}

function encryptField(value) {
  if (!value) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getRuntimeEncryptionKey(), iv);
  const ct = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `enc:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}

function decryptField(value) {
  if (!value || typeof value !== 'string') return value;
  if (!value.startsWith('enc:')) return value; // legacy plaintext
  const parts = value.split(':');
  if (parts.length !== 4) return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      getRuntimeEncryptionKey(),
      Buffer.from(parts[1], 'base64')
    );
    decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
    const pt = Buffer.concat([
      decipher.update(Buffer.from(parts[3], 'base64')),
      decipher.final(),
    ]);
    return pt.toString('utf8');
  } catch (_error) {
    return null;
  }
}

function ensureRuntimeDir() {
  fs.mkdirSync(PROGRAM_DATA_DIR, { recursive: true });
}

function sanitizeHostname(hostname) {
  return String(hostname || 'PC')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'PC';
}

function buildDefaultState() {
  return {
    agentId: `PC-${sanitizeHostname(os.hostname())}`,
    monitoringIntervalMs: DEFAULT_MONITORING_INTERVAL_MS,
    mediaTelemetryEnabled: false,
    mediaBridgePort: DEFAULT_MEDIA_BRIDGE_PORT,
    mediaBridgeToken: randomBytes(24).toString('hex'),
    mediaBridgeStatus: null,
  };
}

function normalizeState(candidate = {}) {
  const defaults = buildDefaultState();
  const monitoringIntervalMs = Number(candidate.monitoringIntervalMs);
  const mediaBridgePort = Number(candidate.mediaBridgePort);
  const normalizedManualRuntime =
    candidate.manualRuntime && typeof candidate.manualRuntime === 'object'
      ? { ...candidate.manualRuntime }
      : null;
  const normalizedServiceRuntime =
    candidate.serviceRuntime && typeof candidate.serviceRuntime === 'object'
      ? { ...candidate.serviceRuntime }
      : null;

  return {
    ...defaults,
    ...candidate,
    agentId: String(candidate.agentId || defaults.agentId),
    serverUrl: normalizeServerUrl(candidate.serverUrl || ''),
    monitoringIntervalMs:
      Number.isFinite(monitoringIntervalMs) && monitoringIntervalMs > 0
        ? monitoringIntervalMs
        : defaults.monitoringIntervalMs,
    mediaTelemetryEnabled:
      typeof candidate.mediaTelemetryEnabled === 'boolean'
        ? candidate.mediaTelemetryEnabled
        : defaults.mediaTelemetryEnabled,
    mediaBridgePort:
      Number.isFinite(mediaBridgePort) && mediaBridgePort > 0
        ? mediaBridgePort
        : defaults.mediaBridgePort,
    mediaBridgeToken: String(candidate.mediaBridgeToken || defaults.mediaBridgeToken),
    mediaBridgeStatus:
      candidate.mediaBridgeStatus && typeof candidate.mediaBridgeStatus === 'object'
        ? { ...candidate.mediaBridgeStatus }
        : null,
    manualRuntime: normalizedManualRuntime,
    serviceRuntime: normalizedServiceRuntime,
  };
}

function invalidateRuntimeStateCache() {
  _cachedState = null;
}

function loadRuntimeState(options = {}) {
  if (_cachedState && !options.force) return _cachedState;

  ensureRuntimeDir();

  try {
    if (!fs.existsSync(RUNTIME_STATE_FILE)) {
      _cachedState = normalizeState();
      return _cachedState;
    }

    const raw = fs.readFileSync(RUNTIME_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    // Decrypt token fields transparently
    if (parsed.accessToken) parsed.accessToken = decryptField(parsed.accessToken);
    if (parsed.refreshToken) parsed.refreshToken = decryptField(parsed.refreshToken);
    _cachedState = normalizeState(parsed);
    return _cachedState;
  } catch (_error) {
    _cachedState = normalizeState();
    return _cachedState;
  }
}

function _scheduleDiskWrite(stateToWrite) {
  _pendingStateToWrite = stateToWrite;
  if (_writeTimer) clearTimeout(_writeTimer);
  _writeTimer = setTimeout(async () => {
    _writeTimer = null;
    if (_writing) return;
    const nextStateToWrite = _pendingStateToWrite || stateToWrite;
    _pendingStateToWrite = null;
    _writing = true;
    try {
      await fsPromises.writeFile(RUNTIME_STATE_FILE, JSON.stringify(nextStateToWrite, null, 2));
    } catch (_error) {
      // Disk write failed — in-memory state still consistent
    } finally {
      _writing = false;
      if (_pendingStateToWrite) {
        const pending = _pendingStateToWrite;
        _pendingStateToWrite = null;
        _scheduleDiskWrite(pending);
      }
    }
  }, DEBOUNCE_MS);
}

function saveRuntimeState(patch = {}) {
  ensureRuntimeDir();

  const nextState = normalizeState({
    ...loadRuntimeState(),
    ...patch,
  });

  _cachedState = nextState;

  // Encrypt token fields before writing to disk
  const stateToWrite = { ...nextState };
  if (stateToWrite.accessToken) stateToWrite.accessToken = encryptField(stateToWrite.accessToken);
  if (stateToWrite.refreshToken) stateToWrite.refreshToken = encryptField(stateToWrite.refreshToken);

  _scheduleDiskWrite(stateToWrite);
  return nextState;
}

function ensureRuntimeState() {
  const state = loadRuntimeState();

  if (!fs.existsSync(RUNTIME_STATE_FILE)) {
    return saveRuntimeState(state);
  }

  return state;
}

function clearRuntimeSession() {
  const current = loadRuntimeState();
  const nextState = {
    agentId: current.agentId,
    serverUrl: current.serverUrl || '',
    monitoringIntervalMs: current.monitoringIntervalMs,
    mediaTelemetryEnabled: current.mediaTelemetryEnabled,
    mediaBridgePort: current.mediaBridgePort,
    mediaBridgeToken: current.mediaBridgeToken,
    mediaBridgeStatus: current.mediaBridgeStatus || null,
    manualRuntime: current.manualRuntime || null,
    serviceRuntime: current.serviceRuntime || null,
  };

  _cachedState = nextState;
  _scheduleDiskWrite(nextState);
  return nextState;
}

function getPublicRuntimeState(options = {}) {
  const state = loadRuntimeState(options);
  return {
    serverUrl: state.serverUrl || '',
    agentId: state.agentId,
    monitoringIntervalMs: state.monitoringIntervalMs,
    mediaTelemetryEnabled: Boolean(state.mediaTelemetryEnabled),
    mediaBridgePort: Number(state.mediaBridgePort || DEFAULT_MEDIA_BRIDGE_PORT),
    mediaBridgeToken: state.mediaBridgeToken || '',
    mediaBridgeStatus: state.mediaBridgeStatus || null,
    lastAuthAt: state.lastAuthAt || null,
    hasAccessToken: Boolean(state.accessToken),
    hasRefreshToken: Boolean(state.refreshToken),
    manualRuntime: state.manualRuntime || null,
    serviceRuntime: state.serviceRuntime || null,
  };
}

module.exports = {
  DEFAULT_MONITORING_INTERVAL_MS,
  DEFAULT_MEDIA_BRIDGE_PORT,
  PROGRAM_DATA_DIR,
  RUNTIME_STATE_FILE,
  ensureRuntimeDir,
  ensureRuntimeState,
  invalidateRuntimeStateCache,
  loadRuntimeState,
  saveRuntimeState,
  clearRuntimeSession,
  getPublicRuntimeState,
};
