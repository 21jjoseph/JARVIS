import type { Settings } from '../../../../shared/contracts';
import {
  INITIAL_VOICE,
  type VoiceAudio,
  type VoiceMode,
  type VoicePhase,
  type VoiceStatus,
} from '../../../../shared/contracts/voice';
import { VoiceActivityDetector } from './vad';
import { SpeechWorker } from './client';
import { interpretCommand } from './commands';
import { installModels, modelsReady, verifyModels } from './models';
import { synthesizeSystem } from './system-speech';

interface Hooks {
  root: string;
  workerPath: string;
  settings(): Settings;
  claim(owner: number): void;
  release(): void;
  changed(status: VoiceStatus): void;
  phase(phase: VoicePhase): void;
  audio(owner: number, audio: VoiceAudio): void;
  openDashboard(): void;
  answer?(owner: number, text: string, signal: AbortSignal): Promise<string>;
}
export class VoiceController {
  private status: VoiceStatus = { ...INITIAL_VOICE };
  private worker: SpeechWorker | null = null;
  private owner: number | null = null;
  private generation = 0;
  private audioId = 0;
  private next: 'LISTENING' | 'ARMED' | 'OFF' = 'OFF';
  private expectedAudio: number | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private busy = false;
  private abort: AbortController | null = null;
  private vad = new VoiceActivityDetector();
  constructor(private hooks: Hooks) {}
  get active() {
    return this.owner !== null;
  }
  get snapshot() {
    return { ...this.status };
  }
  async initialize() {
    this.patch({ modelsReady: await modelsReady(this.hooks.root) });
  }
  private patch(patch: Partial<VoiceStatus>) {
    this.status = { ...this.status, ...patch };
    this.hooks.changed(this.snapshot);
    if (patch.phase) this.hooks.phase(patch.phase);
  }
  private setPhase(phase: VoicePhase) {
    clearTimeout(this.timer);
    this.patch({ phase });
    if (phase === 'LISTENING')
      this.timer = setTimeout(() => {
        this.vad.reset();
        if (this.status.mode === 'wake') this.setPhase('ARMED');
        else this.stop();
      }, 25_000);
  }
  async install(download?: typeof fetch) {
    if (this.status.installing) return;
    if (this.active) throw new Error('Stop the voice session before installing models.');
    this.patch({ installing: true, error: null, progress: 0 });
    let previous = -1;
    try {
      await installModels(
        this.hooks.root,
        (percent, message) => {
          const progress = Math.floor(percent);
          if (progress !== previous || message !== this.status.message) {
            this.patch({ progress, message });
            previous = progress;
          }
        },
        download,
      );
      this.patch({ modelsReady: true });
    } catch (error) {
      this.patch({ error: error instanceof Error ? error.message : 'Model installation failed.' });
      throw error;
    } finally {
      this.patch({ installing: false });
    }
  }
  async start(owner: number, mode: VoiceMode) {
    if (this.status.installing) throw new Error('Wait for model installation to finish.');
    if (this.active) throw new Error('Stop the active voice session first.');
    if (!this.status.modelsReady)
      throw new Error('Install the local voice models in Audio & privacy first.');
    this.hooks.claim(owner);
    this.owner = owner;
    const generation = ++this.generation;
    this.abort = new AbortController();
    this.patch({ phase: 'STARTING', mode, error: null });
    try {
      if (!(await verifyModels(this.hooks.root))) {
        this.patch({ modelsReady: false });
        throw new Error('Voice model integrity check failed. Reinstall the models.');
      }
      if (generation !== this.generation) return;
      this.worker = new SpeechWorker(this.hooks.workerPath, this.hooks.root);
      if (mode === 'wake') await this.worker.call('wake', { word: this.hooks.settings().wakeWord });
      if (generation !== this.generation) return;
      this.vad.reset();
      this.setPhase(mode === 'wake' ? 'ARMED' : 'LISTENING');
    } catch (error) {
      if (generation === this.generation) this.fail(error);
      throw error;
    }
  }
  async feed(owner: number, samples: Float32Array) {
    if (owner !== this.owner || !this.worker || this.busy) return;
    const generation = this.generation;
    this.busy = true;
    try {
      if (this.status.phase === 'ARMED') {
        const found = await this.worker.call<boolean>('keyword', { samples });
        if (generation !== this.generation) return;
        if (found)
          await this.respond(
            this.hooks.settings().voiceLanguage === 'ro'
              ? 'Da, te ascult.'
              : 'Yes, I am listening.',
            'LISTENING',
            generation,
          );
      } else if (this.status.phase === 'LISTENING') {
        const utterance = this.vad.feed(samples);
        if (utterance) await this.recognize(utterance, generation);
      }
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    } finally {
      if (generation === this.generation) this.busy = false;
    }
  }
  private async recognize(samples: Float32Array, generation: number) {
    this.setPhase('TRANSCRIBING');
    const language = this.hooks.settings().voiceLanguage;
    const heard = await this.worker!.call<string>('recognize', { samples, language });
    if (generation !== this.generation) return;
    this.patch({ heard });
    if (!heard) {
      this.setPhase('LISTENING');
      return;
    }
    const response = interpretCommand(heard, language);
    if (response.action === 'stop') {
      this.stop();
      return;
    }
    if (response.action === 'dashboard') this.hooks.openDashboard();
    const reply =
      !response.handled && this.hooks.answer
        ? await this.hooks.answer(this.owner!, heard, this.abort!.signal)
        : response.text;
    if (generation !== this.generation) return;
    await this.respond(
      reply.slice(0, 900),
      this.status.mode === 'wake' ? 'ARMED' : 'OFF',
      generation,
    );
  }
  private async respond(text: string, next: 'LISTENING' | 'ARMED' | 'OFF', generation: number) {
    if (text.length > 400) text = text.slice(0, 397).replace(/\s+\S*$/, '') + '…';
    this.setPhase('SYNTHESIZING');
    this.patch({ reply: text });
    const {
      voiceLanguage: language,
      speechRate: rate,
      ttsProvider,
      systemVoice,
    } = this.hooks.settings();
    const audio =
      ttsProvider === 'system'
        ? await synthesizeSystem(
            text,
            language,
            systemVoice,
            rate,
            this.hooks.root,
            this.abort!.signal,
          )
        : await this.worker!.call<{ samples: Float32Array; sampleRate: number }>('synthesize', {
            text,
            language,
            rate,
          });
    if (generation !== this.generation || this.owner === null) return;
    if (
      !(audio.samples instanceof Float32Array) ||
      audio.samples.length === 0 ||
      audio.samples.length / audio.sampleRate > 90
    )
      throw new Error('The local voice returned invalid audio.');
    this.next = next;
    const id = ++this.audioId;
    this.expectedAudio = id;
    this.setPhase('SPEAKING');
    this.hooks.audio(this.owner, { ...audio, id });
    this.timer = setTimeout(
      () => this.fail(new Error('Speech playback stopped responding.')),
      Math.ceil((audio.samples.length / audio.sampleRate) * 1000) + 10_000,
    );
  }
  playbackEnded(owner: number, id: number) {
    if (this.owner !== owner || this.expectedAudio !== id || this.status.phase !== 'SPEAKING')
      return;
    this.expectedAudio = null;
    this.vad.reset();
    if (this.next === 'OFF') this.stop();
    else this.setPhase(this.next);
  }
  stop() {
    this.abort?.abort();
    this.abort = null;
    this.generation++;
    clearTimeout(this.timer);
    this.expectedAudio = null;
    this.busy = false;
    this.vad.reset();
    const worker = this.worker;
    this.worker = null;
    if (worker) void worker.stop();
    const wasActive = this.owner !== null;
    this.owner = null;
    this.patch({ phase: 'OFF' });
    if (wasActive) this.hooks.release();
  }
  private fail(error: unknown) {
    this.stop();
    this.patch({
      phase: 'ERROR',
      error: error instanceof Error ? error.message : 'Voice processing failed.',
    });
  }
}
