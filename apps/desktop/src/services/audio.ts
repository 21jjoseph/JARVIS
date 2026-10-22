import type { AudioSource, DesktopBridge } from '../../../../shared/contracts';
export function rms(samples: Float32Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}
export function audioLevel(samples: Float32Array): number {
  return Math.min(1, Math.max(0, (rms(samples) - 0.008) * 4.5));
}

/** Raw audio stays in this renderer. Only scalar amplitude leaves it via IPC. */
export class AudioSession {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: AudioNode | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private endTimer: ReturnType<typeof setTimeout> | undefined;
  private active = false;
  private pending = false;
  private generation = 0;
  private claimed = false;
  constructor(
    private bridge: DesktopBridge,
    private onChange: (active: boolean) => void,
  ) {}
  get busy() {
    return this.active || this.pending;
  }
  async microphone(deviceId: string) {
    return this.start('microphone', async (context) => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      this.stream = stream;
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          void this.stop();
        };
      });
      return context.createMediaStreamSource(stream);
    });
  }
  async file(file: File) {
    if (file.size > 30 * 1024 * 1024) throw new Error('Choose an audio file smaller than 30 MB.');
    return this.start('playback', async (context) => {
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.onended = () => {
        void this.stop();
      };
      source.start();
      return source;
    });
  }
  async test() {
    return this.start('test', async (context) => {
      // This is an audible synthesized signal, analysed after the amplitude envelope.
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = 174;
      const gain = context.createGain();
      for (let i = 0; i < 32; i++) {
        const t = context.currentTime + i * 0.24;
        gain.gain.setValueAtTime(0.005, t);
        gain.gain.linearRampToValueAtTime(i % 4 === 3 ? 0.06 : 0.22, t + 0.08);
        gain.gain.linearRampToValueAtTime(0.005, t + 0.21);
      }
      oscillator.connect(gain);
      oscillator.start();
      this.endTimer = setTimeout(() => {
        void this.stop();
      }, 8000);
      return gain;
    });
  }
  private async start(
    source: Exclude<AudioSource, 'none'>,
    create: (context: AudioContext) => Promise<AudioNode>,
  ) {
    if (this.busy) throw new Error('Stop the current audio session first.');
    this.pending = true;
    const generation = ++this.generation;
    try {
      this.claimed = await this.bridge.claimAudio(source);
      if (!this.claimed)
        throw new Error('Audio is active in another 21 window. Stop it there first.');
      const context = new AudioContext();
      this.context = context;
      await context.resume();
      this.source = await create(context);
      if (generation !== this.generation) {
        await this.stop();
        return;
      }
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      this.source.connect(analyser);
      // Microphone capture is never monitored to speakers (avoids feedback).
      if (source !== 'microphone') analyser.connect(context.destination);
      else {
        const silent = context.createGain();
        silent.gain.value = 0;
        analyser.connect(silent);
        silent.connect(context.destination);
      }
      const samples = new Float32Array(analyser.fftSize);
      this.timer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        this.bridge.publishAmplitude(audioLevel(samples));
      }, 34);
      this.active = true;
      this.onChange(true);
    } catch (error) {
      await this.stop();
      throw error;
    } finally {
      this.pending = false;
    }
  }
  async stop() {
    this.generation++;
    clearInterval(this.timer);
    clearTimeout(this.endTimer);
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.stream = null;
    this.source?.disconnect();
    this.source = null;
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') await context.close();
    this.active = false;
    this.onChange(false);
    if (this.claimed) {
      this.claimed = false;
      await this.bridge.releaseAudio();
    }
  }
}
