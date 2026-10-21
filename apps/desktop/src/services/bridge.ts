import { DEFAULT_SETTINGS, type DesktopBridge, type Snapshot } from '../../../../shared/contracts';
import { INITIAL_RUNTIME, transition } from '../../../../shared/contracts/machine';
import { INITIAL_VOICE } from '../../../../shared/contracts/voice';
declare global {
  interface Window {
    jarvis?: DesktopBridge;
  }
}

/** Browser mode is an explicit graphics/audio workbench, with no desktop privileges. */
function browserBridge(): DesktopBridge {
  let value: Snapshot = {
    settings: { ...DEFAULT_SETTINGS },
    runtime: { ...INITIAL_RUNTIME },
    capabilities: {
      desktop: false,
      platform: 'browser',
      loginItem: false,
      clickThrough: false,
      shortcut: false,
    },
  };
  const subscribers = new Set<(snapshot: Snapshot) => void>();
  function emit() {
    subscribers.forEach((fn) => fn(structuredClone(value)));
  }
  return {
    voice: {
      systemVoices: async () => [],
      status: async () => ({ ...INITIAL_VOICE }),
      install: async () => {
        throw new Error('Local voice models require the Electron desktop app.');
      },
      start: async () => {
        throw new Error('Voice interaction requires the Electron desktop app.');
      },
      stop: async () => {},
      feed: async () => {},
      playbackEnded: async () => {},
      onStatus: () => () => {},
      onAudio: () => () => {},
    },
    getSnapshot: async () => structuredClone(value),
    updateSettings: async (patch) => {
      value = { ...value, settings: { ...value.settings, ...patch } };
      emit();
      return value;
    },
    selectState: async (state) => {
      value = { ...value, runtime: transition(value.runtime, { type: 'SELECT', state }) };
      emit();
      return value;
    },
    openDashboard: async () => {
      location.hash = 'dashboard';
      location.reload();
    },
    hideOverlay: async () => {},
    moveOverlay: async () => {},
    setInteractive: () => {},
    claimAudio: async (source) => {
      if (value.runtime.source !== 'none') return false;
      value = { ...value, runtime: transition(value.runtime, { type: 'AUDIO_START', source }) };
      emit();
      return true;
    },
    publishAmplitude: (amplitude) => {
      value = {
        ...value,
        runtime: transition(value.runtime, { type: 'AMPLITUDE', value: amplitude }),
      };
      emit();
    },
    releaseAudio: async () => {
      value = { ...value, runtime: transition(value.runtime, { type: 'AUDIO_STOP' }) };
      emit();
    },
    quit: async () => {},
    onSnapshot: (fn) => {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
    onAudioStop: () => () => {},
  };
}
export const bridge = window.jarvis ?? browserBridge();
