import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    lockScreen: () => ipcRenderer.invoke('lock-screen'),
    storeCredentials: (creds: { email: string; password: string; server_url: string }) => ipcRenderer.invoke('credentials-store', creds),
    hasCredentials: () => ipcRenderer.invoke('credentials-has'),
    runtimeLogin: (creds: { email: string; password: string; server_url: string }) => ipcRenderer.invoke('runtime-login', creds),
    runtimeLoginBrowser: (payload: { server_url: string; provider?: "google" | "github" | "discord" }) =>
        ipcRenderer.invoke('runtime-login-browser', payload),
    runtimeStatus: () => ipcRenderer.invoke('runtime-status'),
    runtimeClear: () => ipcRenderer.invoke('runtime-clear'),
    runtimeRestart: () => ipcRenderer.invoke('runtime-restart'),
    installMediaExtension: () => ipcRenderer.invoke('media-extension-install'),
    openMediaExtensionFolder: (extensionDir: string) =>
        ipcRenderer.invoke('media-extension-open-folder', extensionDir),
    openMediaExtensionBrowser: () => ipcRenderer.invoke('media-extension-open-browser'),
    updateMediaSettings: (settings: { mediaTelemetryEnabled?: boolean; mediaBridgePort?: number; mediaBridgeToken?: string }) =>
        ipcRenderer.invoke('media-settings-update', settings),
    serviceStatus: () => ipcRenderer.invoke('service-status'),
    serviceInstall: () => ipcRenderer.invoke('service-install'),
    serviceUninstall: () => ipcRenderer.invoke('service-uninstall'),
    serviceStart: () => ipcRenderer.invoke('service-start'),
    serviceStop: () => ipcRenderer.invoke('service-stop'),
    readLogs: (maxLines?: number) => ipcRenderer.invoke('logs-read', maxLines || 500),
    onLogsUpdated: (cb: (lines: string[]) => void) => {
        const handler = (_event: any, payload: any) => cb(payload as string[]);
        ipcRenderer.on('logs-updated', handler);
        return () => ipcRenderer.removeListener('logs-updated', handler);
    },
    onRuntimeStatusUpdated: (cb: (status: unknown) => void) => {
        const handler = (_event: any, payload: unknown) => cb(payload);
        ipcRenderer.on('runtime-status-updated', handler);
        return () => ipcRenderer.removeListener('runtime-status-updated', handler);
    },
});
