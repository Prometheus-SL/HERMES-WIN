import { app, BrowserWindow, ipcMain, shell } from "electron";
import { createServer, IncomingMessage, ServerResponse } from "http";
import path from "path";
import {
  installMediaExtension,
  openPreparedMediaExtensionFolder,
  reopenMediaExtensionBrowserPage,
} from "./mediaExtensionInstaller";
import { getLogFilePath } from "./runtimePaths";

const fs = require("fs");
const axios = require("axios");
const { normalizeServerUrl } = require("../service/serverUrl");

const projectRoot = path.join(__dirname, "..", "..");
const agentManagerPathCandidates = [
  path.join(projectRoot, "dist", "service", "agentManager.js"),
  path.join(projectRoot, "src", "service", "agentManager.js"),
];
const AgentManager = require(
  agentManagerPathCandidates.find((candidate) => fs.existsSync(candidate)) ||
    agentManagerPathCandidates[1]
);

let agentManager: any = null;
let mainWindow: BrowserWindow | null = null;
let activeBrowserLogin: Promise<{ ok: boolean; status?: unknown; error?: string }> | null = null;

type BrowserLoginProvider = "google" | "github" | "discord";
type BrowserLoginRequest = {
  provider?: BrowserLoginProvider;
  server_url?: string;
};

type OAuthFragmentPayload = {
  status: "success" | "error";
  error?: string;
  accessToken?: string;
  refreshToken?: string;
};

const BROWSER_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_DESKTOP_OAUTH_CALLBACK_PORT = 46389;
const parsedDesktopOAuthCallbackPort = Number(
  process.env.HERMES_OAUTH_CALLBACK_PORT || DEFAULT_DESKTOP_OAUTH_CALLBACK_PORT
);
const DESKTOP_OAUTH_CALLBACK_PORT =
  Number.isInteger(parsedDesktopOAuthCallbackPort) &&
  parsedDesktopOAuthCallbackPort > 0 &&
  parsedDesktopOAuthCallbackPort <= 65535
    ? parsedDesktopOAuthCallbackPort
    : DEFAULT_DESKTOP_OAUTH_CALLBACK_PORT;
const SUPPORTED_BROWSER_PROVIDERS: BrowserLoginProvider[] = [
  "google",
  "github",
  "discord",
];

function resolveWindowIcon() {
  const candidates = [
    path.join(projectRoot, "build", "icon.ico"),
    path.join(projectRoot, "build", "icon.png"),
    path.join(app.getAppPath(), "build", "icon.ico"),
    path.join(app.getAppPath(), "build", "icon.png"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function normalizeOrigin(value: string) {
  try {
    const parsed = new URL(String(value || ""));
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch (_error) {
    return null;
  }
}

function decodeJwtPayload(token: string) {
  const parts = String(token || "").split(".");
  if (parts.length < 2) {
    return null;
  }

  const rawPayload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const paddedPayload = rawPayload.padEnd(
    rawPayload.length + ((4 - (rawPayload.length % 4)) % 4),
    "="
  );

  try {
    return JSON.parse(Buffer.from(paddedPayload, "base64").toString("utf8"));
  } catch (_error) {
    return null;
  }
}

function extractReturnOriginFromAuthorizeUrl(authorizeUrl: string) {
  try {
    const parsed = new URL(authorizeUrl);
    const state = parsed.searchParams.get("state");
    if (!state) {
      return null;
    }

    const payload = decodeJwtPayload(state);
    if (!payload?.returnOrigin) {
      return null;
    }

    return normalizeOrigin(payload.returnOrigin);
  } catch (_error) {
    return null;
  }
}

function parseOAuthFragment(fragment: string): OAuthFragmentPayload {
  const serialized = String(fragment || "").replace(/^#/, "");
  const params = new URLSearchParams(serialized);
  const status = params.get("status") === "success" ? "success" : "error";

  return {
    status,
    error: params.get("error") || undefined,
    accessToken: params.get("accessToken") || undefined,
    refreshToken: params.get("refreshToken") || undefined,
  };
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request: IncomingMessage) {
  return new Promise<any>((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("error", (error) => reject(error));
    request.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }

      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(raw));
      } catch (_error) {
        reject(new Error("Invalid callback payload"));
      }
    });
  });
}

function buildOAuthCallbackBridgeHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Prometeo Hermes Login</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #060d18;
      color: #e2e8f0;
      font-family: "Segoe UI", sans-serif;
    }
    .card {
      width: min(540px, calc(100vw - 32px));
      padding: 24px;
      border-radius: 16px;
      border: 1px solid rgba(148, 163, 184, 0.3);
      background: rgba(15, 23, 42, 0.75);
      line-height: 1.5;
    }
    .title { margin: 0 0 12px; font-size: 1.1rem; }
    .muted { margin: 0; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <h1 class="title">Prometeo Hermes</h1>
    <p id="message" class="muted">Finishing sign in...</p>
  </div>
  <script>
    (async () => {
      const messageNode = document.getElementById("message");
      const fragment = window.location.hash ? window.location.hash.slice(1) : "";

      try {
        const response = await fetch("/oauth/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fragment })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "Desktop handoff failed.");
        }

        messageNode.textContent = "Login completed. You can close this window.";
        window.setTimeout(() => window.close(), 900);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Desktop handoff failed.";
        messageNode.textContent = reason;
      }
    })();
  </script>
</body>
</html>`;
}

async function requestOAuthAuthorizeUrl(options: {
  provider: BrowserLoginProvider;
  serverUrl: string;
  returnOrigin: string;
}) {
  const endpoint = `${options.serverUrl}/auth/oauth/${options.provider}/authorize`;
  const response = await axios.post(
    endpoint,
    {
      returnOrigin: options.returnOrigin,
    },
    {
      timeout: 30000,
      headers: {
        Accept: "application/json",
      },
    }
  );

  const authorizeUrl =
    response?.data?.data?.authorizeUrl || response?.data?.authorizeUrl || "";
  if (!authorizeUrl) {
    throw new Error("Could not build OAuth authorize URL.");
  }

  return String(authorizeUrl);
}

async function runBrowserLoginFlow(request: BrowserLoginRequest = {}) {
  const provider = String(request.provider || "google").toLowerCase() as BrowserLoginProvider;
  const serverUrl = normalizeServerUrl(request.server_url || process.env.AUTH_SERVER_URL || "");

  if (!SUPPORTED_BROWSER_PROVIDERS.includes(provider)) {
    throw new Error(
      `Unsupported OAuth provider "${provider}". Use: ${SUPPORTED_BROWSER_PROVIDERS.join(", ")}.`
    );
  }

  if (!serverUrl) {
    throw new Error("Missing server URL.");
  }

  let server: ReturnType<typeof createServer> | null = null;
  let timeoutHandle: NodeJS.Timeout | null = null;
  let settled = false;
  let completeLogin: ((value: { accessToken: string; refreshToken: string }) => void) | null = null;
  let failLogin: ((reason?: any) => void) | null = null;

  const loginResult = new Promise<{ accessToken: string; refreshToken: string }>(
    (resolve, reject) => {
      completeLogin = resolve;
      failLogin = reject;
    }
  );

  const closeListener = async () => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }

    if (!server) {
      return;
    }

    const current = server;
    server = null;
    await new Promise<void>((resolve) => {
      current.close(() => resolve());
    });
  };

  const settleOnce = (settle: "resolve" | "reject", payload: any) => {
    if (settled) {
      return;
    }
    settled = true;

    if (settle === "resolve") {
      completeLogin?.(payload);
    } else {
      failLogin?.(payload);
    }
  };

  server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");

    if (req.method === "GET" && requestUrl.pathname === "/oauth/callback") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(buildOAuthCallbackBridgeHtml());
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/favicon.ico") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/oauth/complete") {
      try {
        const body = await readJsonBody(req);
        const payload = parseOAuthFragment(String(body?.fragment || ""));

        if (payload.status !== "success") {
          const error = payload.error || "OAuth login was cancelled or denied.";
          sendJson(res, 400, { ok: false, error });
          settleOnce("reject", new Error(error));
          return;
        }

        if (!payload.accessToken || !payload.refreshToken) {
          const error = "OAuth callback did not include session tokens.";
          sendJson(res, 400, { ok: false, error });
          settleOnce("reject", new Error(error));
          return;
        }

        sendJson(res, 200, { ok: true });
        settleOnce("resolve", {
          accessToken: payload.accessToken,
          refreshToken: payload.refreshToken,
        });
        return;
      } catch (error: any) {
        const reason = error?.message || String(error);
        sendJson(res, 400, { ok: false, error: reason });
        settleOnce("reject", new Error(reason));
        return;
      }
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  });

  await new Promise<void>((resolve, reject) => {
    server?.once("error", reject);
    server?.listen(DESKTOP_OAUTH_CALLBACK_PORT, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await closeListener();
    throw new Error("Could not reserve OAuth callback listener.");
  }

  const returnOrigin = `http://127.0.0.1:${address.port}`;
  timeoutHandle = setTimeout(() => {
    settleOnce(
      "reject",
      new Error("Browser login timed out. Please retry and complete the browser flow.")
    );
  }, BROWSER_LOGIN_TIMEOUT_MS);

  try {
    const authorizeUrl = await requestOAuthAuthorizeUrl({
      provider,
      serverUrl,
      returnOrigin,
    });
    const callbackOriginFromState = extractReturnOriginFromAuthorizeUrl(authorizeUrl);

    if (callbackOriginFromState && callbackOriginFromState !== returnOrigin) {
      throw new Error(
        `Backend callback origin mismatch (${callbackOriginFromState}). Add ${returnOrigin} to CORS_ORIGINS and try again.`
      );
    }

    await shell.openExternal(authorizeUrl);

    const tokens = await loginResult;
    const status = await getAgentManager().loginWithOAuthTokens({
      serverUrl,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });

    return { ok: true, status };
  } finally {
    await closeListener();
  }
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

ipcMain.handle("runtime-login-browser", async (_event, request: BrowserLoginRequest) => {
  if (activeBrowserLogin) {
    return {
      ok: false,
      error: "A browser login is already in progress.",
    };
  }

  activeBrowserLogin = runBrowserLoginFlow(request)
    .catch((error: any) => ({
      ok: false,
      error: error?.message || String(error),
    }))
    .finally(() => {
      activeBrowserLogin = null;
    }) as Promise<{ ok: boolean; status?: unknown; error?: string }>;

  return activeBrowserLogin;
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

ipcMain.handle("media-settings-update", async (_event, settings) => {
  try {
    const status = await getAgentManager().updateMediaSettings(settings || {});
    return { ok: true, status };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle("media-extension-install", async () => {
  try {
    const status = await getAgentManager().updateMediaSettings({
      mediaTelemetryEnabled: true,
    });
    const bridgePort = Number(status?.runtimeState?.mediaBridgePort || 47653);
    const bridgeToken = String(status?.runtimeState?.mediaBridgeToken || "");

    const installer = await installMediaExtension({
      projectRoot,
      bridgePort,
      bridgeToken,
    });

    return { ok: true, status, installer };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle("media-extension-open-folder", async (_event, extensionDir) => {
  try {
    const result = await openPreparedMediaExtensionFolder(String(extensionDir || ""));
    return result;
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

ipcMain.handle("media-extension-open-browser", async () => {
  try {
    const installer = await reopenMediaExtensionBrowserPage();
    return { ok: true, installer };
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
