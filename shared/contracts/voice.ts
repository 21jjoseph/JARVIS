export type VoiceLanguage = 'ro' | 'en';
export type VoiceMode = 'push' | 'wake' | 'calibration' | 'calibration-cloud';
export type VoicePhase =
  | 'OFF'
  | 'STARTING'
  | 'WAKE_DETECTED'
  | 'ARMED'
  | 'LISTENING'
  | 'TRANSCRIBING'
  | 'SYNTHESIZING'
  | 'SPEAKING'
  | 'ERROR';
export interface VoiceStatus {
  phase: VoicePhase;
  mode: VoiceMode;
  modelsReady: boolean;
  installing: boolean;
  progress: number;
  message: string;
  heard: string;
  reply: string;
  error: string | null;
  cloudStreaming?:boolean;
  heardRaw?:string;
  partial?:string;
  recognitionProvider?:'local-whisper'|'gemini';
  outputProvider?:'piper'|'system'|'gemini';
  metrics?:{wake_processing_ms?:number;stt_ms?:number;tts_ready_ms?:number;turn_ms?:number};
}
export const INITIAL_VOICE: VoiceStatus = {
  phase: 'OFF',
  mode: 'push',
  modelsReady: false,
  installing: false,
  progress: 0,
  message: '',
  heard: '',
  reply: '',
  error: null,
};
export interface VoiceAudio {
  id: number;
  samples: Float32Array;
  sampleRate: number;
  playbackRate?:number;
}
export interface VoiceBridge {
  systemVoices(): Promise<Array<{ name: string; language: string }>>;
  status(): Promise<VoiceStatus>;
  install(): Promise<void>;
  start(mode: VoiceMode): Promise<void>;
  feed(samples: Float32Array): Promise<void>;
  stop(): Promise<void>;
  playbackEnded(id: number): Promise<void>;
  onStatus(callback: (status: VoiceStatus) => void): () => void;
  onAudio(callback: (audio: VoiceAudio) => void): () => void;
}
export function validatePcm(value: unknown, maxLength = 2048): Float32Array {
  if (!(value instanceof Float32Array) || value.length === 0 || value.length > maxLength)
    throw new Error('Invalid audio packet.');
  for (const sample of value)
    if (!Number.isFinite(sample) || Math.abs(sample) > 1.01)
      throw new Error('Invalid audio sample.');
  return value;
}
