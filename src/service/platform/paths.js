const os = require('os');
const path = require('path');

const WINDOWS_DIRECTORY_NAME = 'HERMES-WIN';
const UNIX_DIRECTORY_NAME = 'hermes';
const MAC_DIRECTORY_NAME = 'Prometeo Hermes';
const SYSTEMD_SERVICE_NAME = 'hermes-agent.service';

function getBaseDirectory(platform = process.platform) {
  if (process.env.HERMES_BASE_DIR) {
    return process.env.HERMES_BASE_DIR;
  }

  if (platform === 'win32') {
    return path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', WINDOWS_DIRECTORY_NAME);
  }

  if (platform === 'darwin') {
    return path.join(
      os.homedir(),
      'Library',
      'Application Support',
      MAC_DIRECTORY_NAME
    );
  }

  const xdgStateHome =
    process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
  return path.join(xdgStateHome, UNIX_DIRECTORY_NAME);
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
  SYSTEMD_SERVICE_NAME,
  getBaseDirectory,
  getCredentialsDirectory,
  getLogFilePath,
  getLogsDirectory,
  getPlatformDisplayName,
  getRuntimeStateDirectory,
  getRuntimeStateFilePath,
  getSystemdServiceFilePath,
  getSystemdUserDirectory,
  getTokensFilePath,
  getUserConfigFilePath,
};
