const fs = require('fs');
const os = require('os');
const { randomBytes } = require('crypto');
const { normalizeServerUrl } = require('./serverUrl');
const {
  getRuntimeStateDirectory,
  getRuntimeStateFilePath,
} = require('./platform/paths');

const DEFAULT_MONITORING_INTERVAL_MS = 30000;
const DEFAULT_MEDIA_BRIDGE_PORT = 47653;
const PROGRAM_DATA_DIR = getRuntimeStateDirectory();
const RUNTIME_STATE_FILE = getRuntimeStateFilePath();

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

function loadRuntimeState() {
  ensureRuntimeDir();

  try {
    if (!fs.existsSync(RUNTIME_STATE_FILE)) {
      return normalizeState();
    }

    const raw = fs.readFileSync(RUNTIME_STATE_FILE, 'utf8');
    return normalizeState(JSON.parse(raw));
  } catch (_error) {
    return normalizeState();
  }
}

function saveRuntimeState(patch = {}) {
  ensureRuntimeDir();

  const nextState = normalizeState({
    ...loadRuntimeState(),
    ...patch,
  });

  fs.writeFileSync(RUNTIME_STATE_FILE, JSON.stringify(nextState, null, 2));
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

  fs.writeFileSync(RUNTIME_STATE_FILE, JSON.stringify(nextState, null, 2));
  return nextState;
}

function getPublicRuntimeState() {
  const state = loadRuntimeState();
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
  loadRuntimeState,
  saveRuntimeState,
  clearRuntimeSession,
  getPublicRuntimeState,
};
