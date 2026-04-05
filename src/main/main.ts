import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
const fs = require('fs');
const AgentManager = require(path.join(__dirname, '..', '..', 'src', 'service', 'agentManager.js'));
let agentManager: any = null;

let mainWindow: BrowserWindow | null;

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            // enableRemoteModule removed for compatibility with newer Electron
            nodeIntegration: false,
        },
    });

    const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../renderer/index.html')}`;
    mainWindow.loadURL(startUrl);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
};

app.on('ready', () => {
    createWindow();
    try {
        agentManager = new AgentManager();
        agentManager.on('status', (status: unknown) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('runtime-status-updated', status);
            }
        });
        agentManager.start();
    } catch (e) {
        console.warn('AgentManager failed to start: ' + String(e));
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

ipcMain.handle('runtime-login', async (_event, creds) => {
    try {
        const status = await agentManager.loginAndPersist(creds);
        return { ok: true, status };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
});

ipcMain.handle('runtime-status', async () => {
    try {
        const status = await agentManager.getStatusSnapshot();
        return { ok: true, status };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
});

ipcMain.handle('runtime-clear', async () => {
    try {
        const status = await agentManager.clearCredentials();
        return { ok: true, status };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
});

ipcMain.handle('runtime-restart', async () => {
    try {
        const status = await agentManager.restartRuntime();
        return { ok: true, status };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
});

ipcMain.handle('service-status', async () => {
    try {
        const status = await agentManager.getStatusSnapshot();
        return { ok: true, service: status.service };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
});

ipcMain.handle('service-install', async () => {
    try {
        const status = await agentManager.installService();
        return { ok: true, service: status };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
});

ipcMain.handle('service-uninstall', async () => {
    try {
        const status = await agentManager.uninstallService();
        return { ok: true, service: status };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
});

ipcMain.handle('service-start', async () => {
    try {
        const status = await agentManager.startService();
        return { ok: true, service: status };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
});

ipcMain.handle('service-stop', async () => {
    try {
        const status = await agentManager.stopService();
        return { ok: true, service: status };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
});

// Backwards-compatible aliases used by the existing renderer.
ipcMain.handle('credentials-store', async (_event, creds) => {
    try {
        const status = await agentManager.loginAndPersist(creds);
        return { ok: true, status };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
});

ipcMain.handle('credentials-has', async () => {
    try {
        const status = await agentManager.getStatusSnapshot();
        return {
            ok: true,
            has: Boolean(status.runtimeState?.serverUrl || status.hasStoredCredentials),
        };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
});

// Logs reading + watch support
const logsPath = path.join(__dirname, '..', '..', 'logs', 'agent.log');

ipcMain.handle('logs-read', async (_event, maxLines = 500) => {
    try {
        if (!fs.existsSync(logsPath)) return { ok: true, lines: [] };
        const content = fs.readFileSync(logsPath, 'utf8');
        const all = content.split(/\r?\n/).filter(Boolean);
        const start = Math.max(0, all.length - maxLines);
        const lines = all.slice(start);
        return { ok: true, lines };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
});

// Watch file and notify renderer on changes
try {
    fs.watchFile(logsPath, { interval: 1000 }, (curr: any, prev: any) => {
        if (!mainWindow || curr.mtimeMs === prev.mtimeMs) return;
        try {
            const content = fs.readFileSync(logsPath, 'utf8');
            const lines = content.split(/\r?\n/).filter(Boolean);
            const payload = lines.slice(-500);
            mainWindow.webContents.send('logs-updated', payload);
        } catch (e) {
            // ignore
        }
    });
} catch (e) {
    // ignore if cannot watch
}
