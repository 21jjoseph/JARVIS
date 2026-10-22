import type { DesktopBridge, Settings } from '../../../../shared/contracts';
import type { VoiceAudio, VoiceMode, VoiceStatus } from '../../../../shared/contracts/voice';
import { audioLevel } from '../services/audio';

/** Capture/playback lifecycle. All microphone data and speech synthesis stay local. */
export class VoiceSession {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private capture: AudioWorkletNode | null = null;
  private output: AudioBufferSourceNode | null = null;
  private meter: ReturnType<typeof setInterval> | undefined;
  private generation = 0;
  private ownsSession = false;
  private busy = false;
  private packets: Float32Array[] = [];
  private status: VoiceStatus | null = null;
  private volume=1;
  constructor(
    private bridge: DesktopBridge,
    private changed: (active: boolean) => void,
    private report: (message: string) => void,
  ) {}
  update(status: VoiceStatus) {
    this.status = status;
  }
  get active() {
    return this.ownsSession;
  }
  async start(mode: VoiceMode, settings: Settings) {
    if (this.ownsSession) await this.stop();
    const generation = ++this.generation;
    this.volume=settings.speechVolume;
    try {
      await this.bridge.voice.start(mode);
      this.ownsSession = true;
      if (generation !== this.generation) {
        await this.stop();
        return;
      }
      const context = new AudioContext({ sampleRate: 16000 });
      this.context = context;
      await context.resume();
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(settings.microphoneDeviceId
            ? { deviceId: { exact: settings.microphoneDeviceId } }
            : {}),
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      if (generation !== this.generation) {
        await this.stop();
        return;
      }
      if (context.sampleRate !== 16000)
        throw new Error(
          'This audio device cannot provide 16 kHz capture. Select another microphone.',
        );
      await context.audioWorklet.addModule(new URL('./capture.worklet.js', import.meta.url).href);
      this.capture = new AudioWorkletNode(context, 'jarvis-capture');
      const silent = context.createGain();
      silent.gain.value = 0;
      context.createMediaStreamSource(this.stream).connect(this.capture);
      this.capture.connect(silent);
      silent.connect(context.destination);
      this.stream.getTracks().forEach((track) => {
        track.onended = () => {
          void this.stop();
        };
      });
      this.capture.port.onmessage = (event: MessageEvent<Float32Array>) => {
        if (!this.ownsSession || !['ARMED', 'LISTENING'].includes(this.status?.phase ?? '')) return;
        const samples = event.data;
        this.bridge.publishAmplitude(audioLevel(samples));
        if (this.packets.length >= 16) {
          this.report('Local speech processing cannot keep up. Select Eco graphics and try again.');
          void this.stop();
          return;
        }
        this.packets.push(samples);
        void this.drain(generation);
      };
      this.changed(true);
    } catch (error) {
      await this.stop();
      throw error;
    }
  }
  private async drain(generation: number) {
    if (this.busy) return;
    this.busy = true;
    try {
      while (generation === this.generation && this.ownsSession && this.packets.length) {
        if (!['ARMED', 'LISTENING'].includes(this.status?.phase ?? '')) {
          this.packets = [];
          break;
        }
        await this.bridge.voice.feed(this.packets.shift()!);
      }
    } catch (error) {
      if (generation === this.generation) {
        this.report(error instanceof Error ? error.message : 'Voice input failed.');
        await this.stop();
      }
    } finally {
      if (generation === this.generation) this.busy = false;
    }
  }
  async play(audio: VoiceAudio) {
    if (!this.ownsSession || !this.context) return;
    const context = this.context,
      generation = this.generation;
    try {
      const buffer = context.createBuffer(1, audio.samples.length, audio.sampleRate);
      buffer.copyToChannel(new Float32Array(audio.samples), 0);
      this.output?.stop();
      const source = context.createBufferSource();
      this.output = source;
      source.buffer = buffer;
      source.playbackRate.value=audio.playbackRate||1;
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      const gain=context.createGain();gain.gain.value=this.volume;
      source.connect(gain);gain.connect(analyser);
      analyser.connect(context.destination);
      clearInterval(this.meter);
      const samples = new Float32Array(analyser.fftSize);
      this.meter = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        this.bridge.publishAmplitude(audioLevel(samples));
      }, 34);
      source.onended = () => {
        clearInterval(this.meter);
        this.output = null;
        if (generation === this.generation)
          void this.bridge.voice.playbackEnded(audio.id).catch(() => {});
      };
      await context.resume();
      source.start();
    } catch (error) {
      this.report(error instanceof Error ? error.message : 'Speech playback failed.');
      await this.stop();
    }
  }
  async stop(notify = true) {
    this.generation++;
    this.busy = false;
    this.packets = [];
    clearInterval(this.meter);
    if (this.output) {
      this.output.onended = null;
      try {
        this.output.stop();
      } catch {
        /* already stopped */
      }
    }
    this.output = null;
    if (this.capture) {
      this.capture.port.onmessage = null;
      this.capture.disconnect();
      this.capture.port.close();
    }
    this.capture = null;
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.stream = null;
    const context = this.context;
    this.context = null;
    const owned = this.ownsSession;
    this.ownsSession = false;
    this.changed(false);
    if (notify && owned) await this.bridge.voice.stop();
    if (context && context.state !== 'closed') await context.close();
  }
}
