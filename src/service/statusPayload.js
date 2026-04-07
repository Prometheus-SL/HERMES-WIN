const { getPlatformCapabilities } = require('./platform/platformInfo');
const { normalizeServiceStatus } = require('./serviceManager');

function buildStatusPayload({
  runtime = null,
  runtimeState = null,
  service = null,
  hasStoredCredentials = false,
  platform = process.platform,
} = {}) {
  return {
    platform,
    capabilities: getPlatformCapabilities(platform),
    runtime,
    runtimeState,
    service: normalizeServiceStatus(service || {}, platform),
    hasStoredCredentials: Boolean(hasStoredCredentials),
  };
}

module.exports = {
  buildStatusPayload,
};
