import * as sherpa from 'sherpa-onnx';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { VoiceLanguage } from '../../../../shared/contracts/voice';
import { MODEL_MANIFEST } from './models';
import { keywordTokens } from './keywords';

/** Portable WASM inference; used only inside a dedicated worker. No network or shell. */
export class LocalSpeech {
  private recognizer: sherpa.Recognizer | null = null;
  private recognizerLanguage: VoiceLanguage | null = null;
  private tts: sherpa.Tts | null = null;
  private ttsLanguage: VoiceLanguage | null = null;
  private kws: sherpa.Kws | null = null;
  private stream: sherpa.Stream | null = null;
  constructor(private root: string) {}
  private directory(id: string) {
    return join(this.root, MODEL_MANIFEST.models.find((m) => m.id === id)!.directory);
  }
  prepareWake(word: string) {
    this.stream?.free();
    this.kws?.free();
    const dir = this.directory('wake');
    const keywords = Array.from(new Set([word.toLowerCase(),'yo twenty one','hey twenty one','twenty one'])).map(phrase=>{
      const tokens=keywordTokens(phrase,readFileSync(join(dir,'tokens.txt'),'utf8'),readFileSync(join(dir,'bpe.model')));
      // Sherpa's keyword label is whitespace-delimited even for multiword speech.
      return `${tokens} @${phrase.replaceAll(' ','_')}`;
    }).join('\n')+'\n';
    this.kws = sherpa.createKws({
      featConfig: { samplingRate: 16000, featureDim: 80 },
      modelConfig: {
        transducer: {
          encoder: join(dir, 'encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx'),
          decoder: join(dir, 'decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx'),
          joiner: join(dir, 'joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx'),
        },
        tokens: join(dir, 'tokens.txt'),
        numThreads: 1,
        provider: 'cpu',
        debug: 0,
        modelType: 'zipformer2',
        modelingUnit: 'bpe',
        bpeVocab: '',
      },
      keywords: '',
      keywordsBuf: keywords,
      keywordsBufSize: Buffer.byteLength(keywords),
      keywordsScore: 2,
      keywordsThreshold: 0.22,
      maxActivePaths: 4,
      numTrailingBlanks: 2,
    });
    if (!this.kws.handle) throw new Error('The local keyword model could not be initialized.');
    this.stream = this.kws.createStream();
    // Prime the streaming feature context before the first spoken sample.
    // Without this pre-roll, a wake word at frame zero can lose its initial phoneme.
    this.stream.acceptWaveform(16000, new Float32Array(4000));
    while (this.kws.isReady(this.stream)) this.kws.decode(this.stream);
  }
  keyword(samples: Float32Array): boolean {
    if (!this.kws || !this.stream) return false;
    this.stream.acceptWaveform(16000, samples);
    while (this.kws.isReady(this.stream)) {
      this.kws.decode(this.stream);
      if (this.kws.getResult(this.stream).keyword) {
        this.kws.reset(this.stream);
        return true;
      }
    }
    return false;
  }
  recognize(samples: Float32Array, language: VoiceLanguage): string {
    if (!this.recognizer || this.recognizerLanguage !== language) {
      this.recognizer?.free();
      const dir = this.directory('whisper');
      this.recognizer = sherpa.createOfflineRecognizer({
        featConfig: { sampleRate: 16000, featureDim: 80 },
        modelConfig: {
          whisper: {
            encoder: join(dir, 'tiny-encoder.int8.onnx'),
            decoder: join(dir, 'tiny-decoder.int8.onnx'),
            language,
            task: 'transcribe',
            tailPaddings: -1,
          },
          tokens: join(dir, 'tiny-tokens.txt'),
          provider: 'cpu',
          numThreads: 1,
          debug: 0,
        },
      });
      this.recognizerLanguage = language;
      if (!this.recognizer.handle)
        throw new Error('The local speech recognizer could not be initialized.');
    }
    const stream = this.recognizer.createStream();
    try {
      stream.acceptWaveform(16000, samples);
      this.recognizer.decode(stream);
      return this.recognizer.getResult(stream).text.trim().slice(0, 1000);
    } finally {
      stream.free();
    }
  }
  synthesize(text: string, language: VoiceLanguage, speed: number) {
    if (!this.tts || this.ttsLanguage !== language) {
      this.tts?.free();
      const dir = this.directory(language);
      this.tts = sherpa.createOfflineTts({
        offlineTtsModelConfig: {
          offlineTtsVitsModelConfig: {
            model: join(dir, language === 'ro' ? 'ro_RO-mihai-medium.onnx' : 'en_US-amy-low.onnx'),
            tokens: join(dir, 'tokens.txt'),
            dataDir: join(dir, 'espeak-ng-data'),
            noiseScale: 0.333,
            noiseScaleW: 0.5,
            lengthScale: 1,
          },
          provider: 'cpu',
          debug: 0,
          numThreads: 1,
        },
        maxNumSentences: 1,
      });
      this.ttsLanguage = language;
      if (!this.tts.handle) throw new Error('The local speech voice could not be initialized.');
    }
    return this.tts.generate({ text: text.slice(0, 400), sid: 0, speed });
  }
  dispose() {
    this.stream?.free();
    this.kws?.free();
    this.recognizer?.free();
    this.tts?.free();
  }
}
