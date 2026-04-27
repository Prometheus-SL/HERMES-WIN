import os from "os";
import path from "path";

const LOCAL_CHANNEL_ALIASES = new Set(["local", "dev", "development"]);

function getHermesChannel() {
  const rawChannel = String(process.env.HERMES_CHANNEL || process.env.HERMES_ENV || "")
    .trim()
    .toLowerCase();

  return LOCAL_CHANNEL_ALIASES.has(rawChannel) ? "local" : "pro";
}

function isLocalChannel() {
  return getHermesChannel() === "local";
}

function getWindowsDirectoryName() {
  return isLocalChannel() ? "HERMES-WIN-LOCAL" : "HERMES-WIN";
}

function getUnixDirectoryName() {
  return isLocalChannel() ? "hermes-local" : "hermes";
}

function getMacDirectoryName() {
  return isLocalChannel() ? "Prometeo Hermes Local" : "Prometeo Hermes";
}

function getBaseDirectory(platform = process.platform) {
  if (process.env.HERMES_BASE_DIR) {
    return process.env.HERMES_BASE_DIR;
  }

  if (platform === "win32") {
    return path.join(
      process.env.PROGRAMDATA || "C:\\ProgramData",
      getWindowsDirectoryName()
    );
  }

  if (platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      getMacDirectoryName()
    );
  }

  const xdgStateHome =
    process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
  return path.join(xdgStateHome, getUnixDirectoryName());
}

function getLogsDirectory(platform = process.platform) {
  return path.join(getBaseDirectory(platform), "logs");
}

export function getLogFilePath(platform = process.platform) {
  return path.join(getLogsDirectory(platform), "agent.log");
}
