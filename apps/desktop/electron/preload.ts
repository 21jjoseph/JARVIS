import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge, Snapshot } from '../../../shared/contracts';
import type { VoiceStatus, VoiceAudio } from '../../../shared/contracts/voice';

const bridge: DesktopBridge = {
  ai: {
    configureKey:(provider)=>ipcRenderer.invoke('ai:configure-key',provider),
    status: () => ipcRenderer.invoke('ai:status'),
    connection:(provider)=>ipcRenderer.invoke('ai:connection',provider),
    local:(action,options)=>ipcRenderer.invoke('ai:local',action,options),
    onDelta:(callback)=>{
      const handler=(_event:unknown,event:import('../../../shared/contracts/ai').AiDelta)=>callback(event);
      ipcRenderer.on('ai:delta',handler);return ()=>{ipcRenderer.removeListener('ai:delta',handler);};
    },
    lastReply: () => ipcRenderer.invoke('ai:last'),
    ask: (input) => ipcRenderer.invoke('ai:ask', input),
    cancel: () => ipcRenderer.invoke('ai:cancel'),
    resolve: (id, approve,shareResult) => ipcRenderer.invoke('ai:resolve', id, approve,shareResult),
    setKey: (key,provider) => ipcRenderer.invoke('ai:key', key,provider),
    onReply: (callback) => {
      const handler = (_event: unknown, reply: import('../../../shared/contracts/ai').AiReply) =>
        callback(reply);
      ipcRenderer.on('ai:reply', handler);
      return () => {
        ipcRenderer.removeListener('ai:reply', handler);
      };
    },
  },
  voice: {
    systemVoices: () => ipcRenderer.invoke('voice:system-voices'),
    status: () => ipcRenderer.invoke('voice:status'),
    install: () => ipcRenderer.invoke('voice:install'),
    start: (mode) => ipcRenderer.invoke('voice:start', mode),
    feed: (samples) => ipcRenderer.invoke('voice:feed', samples),
    stop: () => ipcRenderer.invoke('voice:stop'),
    playbackEnded: (id) => ipcRenderer.invoke('voice:played', id),
    onStatus: (callback) => {
      const handler = (_event: unknown, status: VoiceStatus) => callback(status);
      ipcRenderer.on('voice:status', handler);
      return () => {
        ipcRenderer.removeListener('voice:status', handler);
      };
    },
    onAudio: (callback) => {
      const handler = (_event: unknown, audio: VoiceAudio) => callback(audio);
      ipcRenderer.on('voice:audio', handler);
      return () => {
        ipcRenderer.removeListener('voice:audio', handler);
      };
    },
  },
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
