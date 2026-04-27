const os = require('os');
const path = require('path');

const PRO_CHANNEL = 'pro';
const LOCAL_CHANNEL = 'local';
const LOCAL_CHANNEL_ALIASES = new Set(['local', 'dev', 'development']);

function getHermesChannel() {
  const rawChannel = String(process.env.HERMES_CHANNEL || process.env.HERMES_ENV || '')
    .trim()
    .toLowerCase();

  return LOCAL_CHANNEL_ALIASES.has(rawChannel) ? LOCAL_CHANNEL : PRO_CHANNEL;
}

function isLocalChannel(channel = getHermesChannel()) {
  return channel === LOCAL_CHANNEL;
}

function getWindowsDirectoryName(channel = getHermesChannel()) {
  return isLocalChannel(channel) ? 'HERMES-WIN-LOCAL' : 'HERMES-WIN';
}

function getUnixDirectoryName(channel = getHermesChannel()) {
  return isLocalChannel(channel) ? 'hermes-local' : 'hermes';
}

function getMacDirectoryName(channel = getHermesChannel()) {
  return isLocalChannel(channel) ? 'Prometeo Hermes Local' : 'Prometeo Hermes';
}

function getSystemdServiceName(channel = getHermesChannel()) {
  return isLocalChannel(channel) ? 'hermes-agent-local.service' : 'hermes-agent.service';
}

function getWindowsServiceName(channel = getHermesChannel()) {
  return isLocalChannel(channel) ? 'HermesNodeAgentLocal' : 'HermesNodeAgent';
}

function getCredentialServiceName(channel = getHermesChannel()) {
  return isLocalChannel(channel) ? 'HERMES-WIN-Agent-Local' : 'HERMES-WIN-Agent';
}

const SYSTEMD_SERVICE_NAME = getSystemdServiceName();

function getBaseDirectory(platform = process.platform) {
  if (process.env.HERMES_BASE_DIR) {
    return process.env.HERMES_BASE_DIR;
  }

  if (platform === 'win32') {
    return path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', getWindowsDirectoryName());
  }

  if (platform === 'darwin') {
    return path.join(
      os.homedir(),
      'Library',
      'Application Support',
      getMacDirectoryName()
    );
  }

  const xdgStateHome =
    process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
  return path.join(xdgStateHome, getUnixDirectoryName());
}

function getRuntimeStateDirectory(platform = process.platform) {
  return getBaseDirectory(platform);
}

function getRuntimeStateFilePath(platform = process.platform) {
  return path.join(getRuntimeStateDirectory(platform), 'runtime-state.json');
}

function getLogsDirectory(platform = process.platform) {
  return path.join(getBaseDirectory(platform), 'logs');
}

function getLogFilePath(platform = process.platform) {
  return path.join(getLogsDirectory(platform), 'agent.log');
}

function getCredentialsDirectory(platform = process.platform) {
  return getBaseDirectory(platform);
}

function getUserConfigFilePath(platform = process.platform) {
  return path.join(getCredentialsDirectory(platform), 'user_config.json');
}

function getTokensFilePath(platform = process.platform) {
  return path.join(getCredentialsDirectory(platform), 'tokens.json');
}

function getSystemdUserDirectory() {
  const xdgConfigHome =
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdgConfigHome, 'systemd', 'user');
}

function getSystemdServiceFilePath() {
  return path.join(getSystemdUserDirectory(), SYSTEMD_SERVICE_NAME);
}

function getPlatformDisplayName(platform = process.platform) {
  if (platform === 'win32') return 'Windows';
  if (platform === 'linux') return 'Linux';
  if (platform === 'darwin') return 'macOS';
  return platform;
}

module.exports = {
  LOCAL_CHANNEL,
  PRO_CHANNEL,
  SYSTEMD_SERVICE_NAME,
  getCredentialServiceName,
  getBaseDirectory,
  getHermesChannel,
  getCredentialsDirectory,
  getLogFilePath,
  getLogsDirectory,
  getPlatformDisplayName,
  getRuntimeStateDirectory,
  getRuntimeStateFilePath,
  getSystemdServiceName,
  getSystemdServiceFilePath,
  getSystemdUserDirectory,
  getTokensFilePath,
  getUserConfigFilePath,
  getWindowsServiceName,
  isLocalChannel,
};
