declare module 'sherpa-onnx' {
  export interface Stream {
    acceptWaveform(rate: number, samples: Float32Array): void;
    free(): void;
  }
  export interface Recognizer {
    handle: number;
    createStream(): Stream;
    decode(stream: Stream): void;
    getResult(stream: Stream): { text: string };
    free(): void;
  }
  export interface Kws {
    handle: number;
    createStream(): Stream;
    isReady(stream: Stream): boolean;
    decode(stream: Stream): void;
    getResult(stream: Stream): { keyword: string };
    reset(stream: Stream): void;
    free(): void;
  }
  export interface Tts {
    handle: number;
    generate(options: { text: string; sid: number; speed: number }): {
      samples: Float32Array;
      sampleRate: number;
    };
    free(): void;
  }
  export function createOfflineRecognizer(config: unknown): Recognizer;
  export function createKws(config: unknown): Kws;
  export function createOfflineTts(config: unknown): Tts;
  export function readWave(path: string): { samples: Float32Array; sampleRate: number };
}
