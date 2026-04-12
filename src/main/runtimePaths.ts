import os from "os";
import path from "path";

const WINDOWS_DIRECTORY_NAME = "HERMES-WIN";
const UNIX_DIRECTORY_NAME = "hermes";
const MAC_DIRECTORY_NAME = "Prometeo Hermes";

function getBaseDirectory(platform = process.platform) {
  if (process.env.HERMES_BASE_DIR) {
    return process.env.HERMES_BASE_DIR;
  }

  if (platform === "win32") {
    return path.join(
      process.env.PROGRAMDATA || "C:\\ProgramData",
      WINDOWS_DIRECTORY_NAME
    );
  }

  if (platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      MAC_DIRECTORY_NAME
    );
  }

  const xdgStateHome =
    process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
  return path.join(xdgStateHome, UNIX_DIRECTORY_NAME);
}

function getLogsDirectory(platform = process.platform) {
  return path.join(getBaseDirectory(platform), "logs");
}

export function getLogFilePath(platform = process.platform) {
  return path.join(getLogsDirectory(platform), "agent.log");
}
