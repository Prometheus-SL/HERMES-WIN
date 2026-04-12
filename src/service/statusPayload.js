const { getPlatformCapabilities } = require('./platform/platformInfo');
const { normalizeServiceStatus } = require('./serviceManager');

function buildStatusPayload({
  runtime = null,
  runtimeState = null,
  service = null,
  mediaBridge = null,
  hasStoredCredentials = false,
  platform = process.platform,
} = {}) {
  return {
    platform,
    capabilities: getPlatformCapabilities(platform),
    runtime,
    runtimeState,
    service: normalizeServiceStatus(service || {}, platform),
    mediaBridge:
      mediaBridge && typeof mediaBridge === 'object'
        ? { ...mediaBridge }
        : runtime?.mediaBridge || runtimeState?.mediaBridgeStatus || null,
    hasStoredCredentials: Boolean(hasStoredCredentials),
  };
}

module.exports = {
  buildStatusPayload,
};
