export const AVATAR_STATES = [
  'IDLE',
  'LISTENING',
  'THINKING',
  'SPEAKING',
  'EXECUTING',
  'WARNING',
  'ERROR',
  'OFFLINE',
] as const;
export type AvatarState = (typeof AVATAR_STATES)[number];
export type Quality = 'auto' | 'low' | 'high';
import type { AiBridge } from './ai';
import type { VoiceBridge, VoiceLanguage } from './voice';
export type AudioSource = 'none' | 'microphone' | 'playback' | 'test' | 'voice';
export interface Settings {
  version: 1;
  color: string;
  size: number;
  intensity: number;
  quality: Quality;
  reducedMotion: boolean;
  alwaysOnTop: boolean;
  launchAtLogin: boolean;
  clickThrough: boolean;
  microphoneDeviceId: string;
  locale: 'ro' | 'en';
  voiceLanguage: VoiceLanguage;
  wakeWord: string;
  speechRate: number;
  ttsProvider: 'piper' | 'system';
  systemVoice: string;
  localModel: string;
  cloudModel: string;
  position: { x: number; y: number } | null;
}
export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  version: 1,
  color: '#62e5e5',
  size: 320,
  intensity: 0.8,
  quality: 'auto',
  reducedMotion: false,
  alwaysOnTop: true,
  launchAtLogin: false,
  clickThrough: true,
  microphoneDeviceId: '',
  locale: 'ro',
  voiceLanguage: 'ro',
  wakeWord: 'jarvis',
  speechRate: 1,
  ttsProvider: 'piper',
  systemVoice: '',
  localModel: '',
  cloudModel: 'gpt-4.1-mini',
  position: null,
});
export interface Runtime {
  state: AvatarState;
  source: AudioSource;
  amplitude: number;
  notice: string | null;
}
export interface Capabilities {
  desktop: boolean;
  platform: string;
  loginItem: boolean;
  clickThrough: boolean;
  shortcut: boolean;
}
export interface Snapshot {
  settings: Settings;
  runtime: Runtime;
  capabilities: Capabilities;
}
export interface DesktopBridge {
  ai: AiBridge;
  voice: VoiceBridge;
  getSnapshot(): Promise<Snapshot>;
  updateSettings(patch: Partial<Settings>): Promise<Snapshot>;
  selectState(state: AvatarState): Promise<Snapshot>;
  openDashboard(): Promise<void>;
  hideOverlay(): Promise<void>;
  moveOverlay(dx: number, dy: number): Promise<void>;
  setInteractive(interactive: boolean): void;
  claimAudio(source: Exclude<AudioSource, 'none'>): Promise<boolean>;
  publishAmplitude(amplitude: number): void;
  releaseAudio(): Promise<void>;
  quit(): Promise<void>;
  onSnapshot(callback: (snapshot: Snapshot) => void): () => void;
  onAudioStop(callback: () => void): () => void;
}
export function isState(value: unknown): value is AvatarState {
  return typeof value === 'string' && (AVATAR_STATES as readonly string[]).includes(value);
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
/** Validate every privileged settings value in the main process; reject unknown keys. */
export function validateSettingsPatch(input: unknown): Partial<Settings> {
  if (!isRecord(input)) throw new Error('Settings must be an object.');
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    let valid = false;
    switch (key) {
      case 'version':
        valid = value === 1;
        break;
      case 'color':
        valid = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
        break;
      case 'size':
        valid = inRange(value, 220, 520) && Number.isInteger(value);
        break;
      case 'intensity':
        valid = inRange(value, 0, 1.5);
        break;
      case 'quality':
        valid = value === 'auto' || value === 'low' || value === 'high';
        break;
      case 'reducedMotion':
      case 'alwaysOnTop':
      case 'launchAtLogin':
      case 'clickThrough':
        valid = typeof value === 'boolean';
        break;
      case 'microphoneDeviceId':
        valid = typeof value === 'string' && value.length <= 256;
        break;
      case 'locale':
      case 'voiceLanguage':
        valid = value === 'ro' || value === 'en';
        break;
      case 'wakeWord':
        valid = typeof value === 'string' && /^[a-zA-Z]{2,20}( [a-zA-Z]{2,20})?$/.test(value);
        break;
      case 'speechRate':
        valid = inRange(value, 0.7, 1.4);
        break;
      case 'ttsProvider':
        valid = value === 'piper' || value === 'system';
        break;
      case 'localModel':
        valid =
          typeof value === 'string' && value.length <= 100 && /^[a-zA-Z0-9_.:/-]*$/.test(value);
        break;
      case 'cloudModel':
        valid =
          typeof value === 'string' && value.length <= 100 && /^[a-zA-Z0-9_.:-]+$/.test(value);
        break;
      case 'systemVoice':
        valid = typeof value === 'string' && value.length <= 100 && !/[\r\n\0]/.test(value);
        break;
      case 'position':
        valid =
          value === null ||
          (isRecord(value) &&
            Object.keys(value).length === 2 &&
            inRange(value.x, -100_000, 100_000) &&
            inRange(value.y, -100_000, 100_000));
        break;
      default:
        throw new Error(`Unknown setting: ${key}`);
    }
    if (!valid) throw new Error(`Invalid setting: ${key}`);
    result[key] = value;
  }
  return result as Partial<Settings>;
}
export function validateDelta(dx: unknown, dy: unknown): { dx: number; dy: number } {
  if (!inRange(dx, -5000, 5000) || !inRange(dy, -5000, 5000))
    throw new Error('Invalid window movement.');
  return { dx: Math.round(dx), dy: Math.round(dy) };
}
