import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    lockScreen: () => ipcRenderer.invoke('lock-screen'),
    // Aquí puedes exponer más funciones según sea necesario
});