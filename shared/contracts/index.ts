export const AVATAR_STATES = [
  'IDLE',
  'LISTENING',
  'THINKING',
  'SPEAKING',
  'EXECUTING',
  'WARNING',
  'ERROR',
  'OFFLINE',
  'WAKE_DETECTED',
  'TRANSCRIBING',
  'MUTED',
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
  ttsProvider: 'piper' | 'system' | 'gemini';
  systemVoice: string;
  localModel: string;
  cloudModel: string;
  aiMode: 'local' | 'hybrid' | 'cloud';
  localBackend: 'llama' | 'ollama';
  localEndpoint: string;
  modelPath: string;
  modelDirectory: string;
  inferenceThreads: number;
  modelIdleSeconds: number;
  cloudProvider: 'gemini' | 'openai';
  cloudEnabled: boolean;
  hybridCloudConsent: boolean;
  shareContext: boolean;
  personality: 'casual' | 'professional';
  geminiModel: string;
  geminiSttModel: string;
  geminiTtsModel: string;
  sttProvider: 'local' | 'gemini';
  cloudAudioConsent: boolean;
  voiceCloudTextConsent:boolean;
  geminiVoice: string;
  speechVolume: number;
  technicalVocabulary: string[];
  inputTokenPrice: number;
  outputTokenPrice: number;
  spendingWarning: number;
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
  wakeWord: 'Twenty One',
  speechRate: 1,
  ttsProvider: 'piper',
  systemVoice: '',
  localModel: '',
  cloudModel: 'gpt-4.1-mini',
  aiMode:'local',localBackend:'llama',localEndpoint:'http://127.0.0.1:8080',
  modelPath:'',modelDirectory:'',inferenceThreads:2,modelIdleSeconds:600,
  cloudProvider:'gemini',cloudEnabled:false,hybridCloudConsent:false,shareContext:false,
  personality:'casual',geminiModel:'gemini-3.8-flash',geminiSttModel:'gemini-3.5-transcribe-live',
  geminiTtsModel:'gemini-3.8-flash-lite-tts',sttProvider:'local',cloudAudioConsent:false,voiceCloudTextConsent:false,
  geminiVoice:'Charon',speechVolume:1,inputTokenPrice:0,outputTokenPrice:0,spendingWarning:0,
  technicalVocabulary:['21Robotics','21fadeaway','Twenty One','Elegoo','Centauri Carbon','CoppeliaSim','NEMA17','Arduino','ESP32','ROS 2','Creo','Bambu Studio','Cycloidal gearbox','Reductor cicloidal','Stepper motor','G-code','STL','STEP','MQTT'],
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
        valid = typeof value === 'string' && /^[a-zA-Z]{2,20}( [a-zA-Z]{2,20}){0,2}$/.test(value);
        break;
      case 'speechRate':
        valid = inRange(value, 0.7, 1.4);
        break;
      case 'ttsProvider':
        valid = value === 'piper' || value === 'system' || value === 'gemini';
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
      case 'aiMode': valid=value==='local'||value==='hybrid'||value==='cloud';break;
      case 'localBackend': valid=value==='llama'||value==='ollama';break;
      case 'localEndpoint':
        if(typeof value==='string') {try {const url=new URL(value);valid=url.protocol==='http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname) && !!url.port && !url.username && !url.password && url.pathname==='/' && !url.search && !url.hash;}catch {valid=false;}}
        break;
      case 'modelPath': case 'modelDirectory': valid=typeof value==='string'&&value.length<=1500&&!/[\r\n\0]/.test(value);break;
      case 'inferenceThreads': valid=inRange(value,1,8)&&Number.isInteger(value);break;
      case 'modelIdleSeconds': valid=inRange(value,60,3600)&&Number.isInteger(value);break;
      case 'cloudProvider': valid=value==='gemini'||value==='openai';break;
      case 'cloudEnabled': case 'hybridCloudConsent': case 'shareContext': case 'cloudAudioConsent': case 'voiceCloudTextConsent': valid=typeof value==='boolean';break;
      case 'personality': valid=value==='casual'||value==='professional';break;
      case 'geminiModel': case 'geminiSttModel': case 'geminiTtsModel': case 'geminiVoice':
        valid=typeof value==='string'&&/^[a-zA-Z0-9_.:-]{1,150}$/.test(value);break;
      case 'sttProvider': valid=value==='local'||value==='gemini';break;
      case 'speechVolume': valid=inRange(value,0,1);break;
      case 'inputTokenPrice': case 'outputTokenPrice': case 'spendingWarning': valid=inRange(value,0,1000);break;
      case 'technicalVocabulary': valid=Array.isArray(value)&&value.length<=100&&value.every(v=>typeof v==='string'&&v.length>0&&v.length<=64&&!/[\r\n\0]/.test(v));break;
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
