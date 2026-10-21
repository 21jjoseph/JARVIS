import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge, Snapshot } from '../../../shared/contracts';

const bridge: DesktopBridge = {
  getSnapshot: () => ipcRenderer.invoke('jarvis:snapshot'),
  updateSettings: (patch) => ipcRenderer.invoke('jarvis:settings', patch),
  selectState: (state) => ipcRenderer.invoke('jarvis:state', state),
  openDashboard: () => ipcRenderer.invoke('jarvis:dashboard'),
  hideOverlay: () => ipcRenderer.invoke('jarvis:hide'),
  moveOverlay: (dx, dy) => ipcRenderer.invoke('jarvis:move', dx, dy),
  setInteractive: (interactive) => ipcRenderer.send('jarvis:interactive', interactive),
  claimAudio: (source) => ipcRenderer.invoke('jarvis:audio-claim', source),
  publishAmplitude: (value) => ipcRenderer.send('jarvis:amplitude', value),
  releaseAudio: () => ipcRenderer.invoke('jarvis:audio-release'),
  quit: () => ipcRenderer.invoke('jarvis:quit'),
  onSnapshot: (callback) => {
    const handler = (_event: unknown, value: Snapshot) => callback(value);
    ipcRenderer.on('jarvis:changed', handler);
    return () => {
      ipcRenderer.removeListener('jarvis:changed', handler);
    };
  },
  onAudioStop: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('jarvis:audio-stop', handler);
    return () => {
      ipcRenderer.removeListener('jarvis:audio-stop', handler);
    };
  },
};
contextBridge.exposeInMainWorld('jarvis', Object.freeze(bridge));
