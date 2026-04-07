import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";

const fs = require("fs");

const projectRoot = path.join(__dirname, "..", "..");
const agentManagerPathCandidates = [
  path.join(projectRoot, "dist", "service", "agentManager.js"),
  path.join(projectRoot, "src", "service", "agentManager.js"),
];
const AgentManager = require(
  agentManagerPathCandidates.find((candidate) => fs.existsSync(candidate)) ||
    agentManagerPathCandidates[1]
);
const { getLogFilePath } = require(path.join(
  projectRoot,
  "src",
  "service",
  "platform",
  "paths.js"
));

let agentManager: any = null;
let mainWindow: BrowserWindow | null = null;

function resolveWindowIcon() {
  const candidates = [
    path.join(projectRoot, "build", "icon.ico"),
    path.join(projectRoot, "build", "icon.png"),
    path.join(app.getAppPath(), "build", "icon.ico"),
    path.join(app.getAppPath(), "build", "icon.png"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function getAgentManager() {
  if (!agentManager) {
    throw new Error("Agent manager is not ready yet");
  }

  return agentManager;
}

function createWindow() {
  const iconPath = resolveWindowIcon();

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    center: true,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#07111f",
    title: "Prometeo Hermes Console",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const startUrl =
    process.env.ELECTRON_START_URL ||
    `file://${path.join(__dirname, "../renderer/index.html")}`;

  mainWindow.loadURL(startUrl);
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("ready", () => {
  app.setName("Prometeo Hermes");
  createWindow();

  try {
    agentManager = new AgentManager();
    agentManager.on("status", (status: unknown) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("runtime-status-updated", status);
      }
    });
    agentManager.start();
  } catch (error) {
    console.warn("AgentManager failed to start: " + String(error));
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

ipcMain.handle("runtime-login", async (_event, creds) => {
  try {
    const status = await getAgentManager().loginAndPersist(creds);
    return { ok: true, status };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle("runtime-status", async () => {
  try {
    const status = await getAgentManager().getStatusSnapshot();
    return { ok: true, status };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle("runtime-clear", async () => {
  try {
    const status = await getAgentManager().clearCredentials();
    return { ok: true, status };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle("runtime-restart", async () => {
  try {
    const status = await getAgentManager().restartRuntime();
    return { ok: true, status };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle("service-status", async () => {
  try {
    const status = await getAgentManager().getStatusSnapshot();
    return { ok: true, service: status.service };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle("service-install", async () => {
  try {
    const status = await getAgentManager().installService();
    return { ok: true, service: status };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle("service-uninstall", async () => {
  try {
    const status = await getAgentManager().uninstallService();
    return { ok: true, service: status };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle("service-start", async () => {
  try {
    const status = await getAgentManager().startService();
    return { ok: true, service: status };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle("service-stop", async () => {
  try {
    const status = await getAgentManager().stopService();
    return { ok: true, service: status };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle("credentials-store", async (_event, creds) => {
  try {
    const status = await getAgentManager().loginAndPersist(creds);
    return { ok: true, status };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle("credentials-has", async () => {
  try {
    const status = await getAgentManager().getStatusSnapshot();
    return {
      ok: true,
      has: Boolean(status.runtimeState?.serverUrl || status.hasStoredCredentials),
    };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

const logsPath = getLogFilePath();

ipcMain.handle("logs-read", async (_event, maxLines = 500) => {
  try {
    if (!fs.existsSync(logsPath)) {
      return { ok: true, lines: [] };
    }

    const content = fs.readFileSync(logsPath, "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);
    const start = Math.max(0, lines.length - maxLines);
    return { ok: true, lines: lines.slice(start) };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

try {
  fs.watchFile(logsPath, { interval: 1000 }, (current: any, previous: any) => {
    if (!mainWindow || current.mtimeMs === previous.mtimeMs) {
      return;
    }

    try {
      const content = fs.readFileSync(logsPath, "utf8");
      const lines = content.split(/\r?\n/).filter(Boolean).slice(-500);
      mainWindow.webContents.send("logs-updated", lines);
    } catch (_error) {
      // Ignore log read errors from watcher updates.
    }
  });
} catch (_error) {
  // Ignore watch failures on first run when the log file does not exist yet.
}
