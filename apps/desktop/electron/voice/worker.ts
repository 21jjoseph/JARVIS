import { parentPort, workerData } from 'node:worker_threads';
import { LocalSpeech } from './inference';
import type { VoiceLanguage } from '../../../../shared/contracts/voice';
const speech = new LocalSpeech((workerData as { root: string }).root);
parentPort!.on(
  'message',
  (message: {
    id: number;
    kind: string;
    samples?: Float32Array;
    language?: VoiceLanguage;
    word?: string;
    text?: string;
    rate?: number;
  }) => {
    try {
      let result: unknown;
      switch (message.kind) {
        case 'wake':
          speech.prepareWake(message.word!);
          result = true;
          break;
        case 'keyword':
          result = speech.keyword(message.samples!);
          break;
        case 'recognize':
          result = speech.recognize(message.samples!, message.language!);
          break;
        case 'synthesize':
          result = speech.synthesize(message.text!, message.language!, message.rate!);
          break;
        default:
          throw new Error('Unknown speech worker operation.');
      }
      parentPort!.postMessage({ id: message.id, result });
    } catch (error) {
      parentPort!.postMessage({
        id: message.id,
        error: error instanceof Error ? error.message : 'Local speech inference failed.',
      });
    }
  },
);
