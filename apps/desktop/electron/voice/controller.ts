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
import type { CloudCapture } from './cloud';
import { spokenIdentity } from '../../../../shared/contracts/identity';
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
  cloudCapture?(partial:(text:string)=>void,signal:AbortSignal):Promise<CloudCapture>;
  cloudSpeech?(text:string,signal:AbortSignal):Promise<{samples:Float32Array;sampleRate:number}>;
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
  private capture:CloudCapture|null=null;
  private turnStarted=0;
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
        if (this.status.mode === 'wake') {this.capture?.stop();this.capture=null;this.setPhase('ARMED');}
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
    this.patch({ phase: 'STARTING', mode, error: null,heard:'',heardRaw:'',reply:'',partial:'' });
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
      if(mode!=='wake')await this.prepareCloud(generation);
      if(generation!==this.generation)return;
      this.turnStarted=performance.now();
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
        const wakeStart=performance.now();
        const found = await this.worker.call<boolean>('keyword', { samples });
        if (generation !== this.generation) return;
        this.patch({metrics:{...this.status.metrics,wake_processing_ms:performance.now()-wakeStart}});
        if (found) {
          this.turnStarted=performance.now();
          this.setPhase('WAKE_DETECTED');
          await this.prepareCloud(generation);
          if(generation!==this.generation)return;
          await this.respond(
            this.hooks.settings().voiceLanguage === 'ro'
              ? 'Da, te ascult.'
              : 'Yes, I am listening.',
            'LISTENING',
            generation,
          );
        }
      } else if (this.status.phase === 'LISTENING') {
        if(this.capture&&!this.capture.available)this.patch({cloudStreaming:false,recognitionProvider:'local-whisper',message:'Cloud stream interrupted; local Whisper will transcribe this turn.'});
        this.capture?.feed(samples);
        const utterance = this.vad.feed(samples);
        if (utterance) await this.recognize(utterance, generation);
      }
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    } finally {
      if (generation === this.generation) this.busy = false;
    }
  }
  private async prepareCloud(generation:number){
    const settings=this.hooks.settings();
    this.patch({recognitionProvider:'local-whisper'});
    if(this.status.mode==='calibration')return;
    const requested=settings.sttProvider==='gemini'||this.status.mode==='calibration-cloud';
    if(!requested)return;
    if(!settings.cloudEnabled||!settings.cloudAudioConsent||settings.aiMode==='local'){
      if(this.status.mode==='calibration-cloud')throw new Error('Cloud calibration requires speech consent and Hybrid or Cloud mode.');
      this.patch({message:'Local privacy mode: microphone audio stays on this device.'});return;
    }
    try {
      const capture=await this.hooks.cloudCapture!(text=>{if(generation===this.generation)this.patch({partial:text});},this.abort!.signal);
      if(generation!==this.generation){capture.stop();return;}
      this.capture=capture;
      this.patch({recognitionProvider:'gemini',cloudStreaming:true,message:'Cloud microphone streaming enabled by your speech consent.'});
    }catch(error){
      if(generation!==this.generation)return;
      if(this.status.mode==='calibration-cloud')throw error;
      this.patch({message:'Cloud speech unavailable; using local Whisper.',recognitionProvider:'local-whisper'});
    }
  }
  private async recognize(samples: Float32Array, generation: number) {
    this.setPhase('TRANSCRIBING');
    const language = this.hooks.settings().voiceLanguage;
    const sttStarted=performance.now();
    let heard:string;
    const capture=this.capture;
    if(capture){
      try{heard=await capture.finish();}
      catch{if(generation!==this.generation)throw new Error('Voice session stopped.');this.patch({recognitionProvider:'local-whisper',message:'Cloud transcription unavailable; using local Whisper.'});heard=await this.worker!.call<string>('recognize',{samples,language});}
      finally{capture.stop();if(this.capture===capture){this.capture=null;this.patch({cloudStreaming:false});}}
    }else heard=await this.worker!.call<string>('recognize', { samples, language });
    if (generation !== this.generation) return;
    this.patch({ heard:heard.trim(),heardRaw:heard,partial:'',metrics:{...this.status.metrics,stt_ms:performance.now()-sttStarted} });
    if(this.status.mode==='calibration'||this.status.mode==='calibration-cloud'){this.stop();return;}
    if (!heard) {
      await this.prepareCloud(generation);
      if(generation!==this.generation)return;
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
    if(generation!==this.generation||this.owner===null)return;
    text=spokenIdentity(text);
    if (text.length > 400) text = text.slice(0, 397).replace(/\s+\S*$/, '') + '…';
    this.setPhase(next==='LISTENING'&&this.status.mode==='wake'?'WAKE_DETECTED':'SYNTHESIZING');
    this.patch({ reply: text });
    const {
      voiceLanguage: language,
      speechRate: rate,
      ttsProvider,
      systemVoice,
    } = this.hooks.settings();
    const ttsStart=performance.now();
    let audio:{samples:Float32Array;sampleRate:number;playbackRate?:number};
    let provider=ttsProvider;
    if(ttsProvider==='gemini'){
      try{audio={...await this.hooks.cloudSpeech!(text,this.abort!.signal),playbackRate:rate};}
      catch{if(generation!==this.generation)return;provider='piper';this.patch({message:'Cloud voice unavailable; local Piper voice is being used.'});audio=await this.worker!.call('synthesize',{text,language,rate});}
    }else audio=ttsProvider==='system'?await synthesizeSystem(text,language,systemVoice,rate,this.hooks.root,this.abort!.signal):await this.worker!.call('synthesize',{text,language,rate});
    if(generation!==this.generation)return;
    this.patch({outputProvider:provider,metrics:{...this.status.metrics,tts_ready_ms:performance.now()-ttsStart}});
    if (generation !== this.generation || this.owner === null) return;
    if (
      !(audio.samples instanceof Float32Array) ||
      audio.samples.length === 0 ||
      audio.samples.length / audio.sampleRate / (audio.playbackRate||1) > 90
    )
      throw new Error('The local voice returned invalid audio.');
    this.next = next;
    const id = ++this.audioId;
    this.expectedAudio = id;
    this.setPhase('SPEAKING');
    this.hooks.audio(this.owner, { ...audio, id });
    this.timer = setTimeout(
      () => this.fail(new Error('Speech playback stopped responding.')),
      Math.ceil((audio.samples.length / audio.sampleRate / (audio.playbackRate||1)) * 1000) + 10_000,
    );
  }
  playbackEnded(owner: number, id: number) {
    if (this.owner !== owner || this.expectedAudio !== id || this.status.phase !== 'SPEAKING')
      return;
    this.expectedAudio = null;
    if(this.next!=='LISTENING')this.patch({metrics:{...this.status.metrics,turn_ms:performance.now()-this.turnStarted}});
    this.vad.reset();
    if (this.next === 'OFF') this.stop();
    else this.setPhase(this.next);
  }
  stop() {
    this.capture?.stop();this.capture=null;
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
    this.patch({ phase: 'OFF',cloudStreaming:false,partial:'' });
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
