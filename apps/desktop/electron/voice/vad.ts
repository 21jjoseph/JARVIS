/** Local energy VAD with pre-roll, hysteresis and hard duration limits. */
export class VoiceActivityDetector {
  private preRoll: Float32Array[] = [];
  private chunks: Float32Array[] = [];
  private speechSamples = 0;
  private silenceSamples = 0;
  private consecutiveSpeech = 0;
  private active = false;
  private voicedSamples = 0;
  constructor(
    private readonly threshold = 0.014,
    private readonly sampleRate = 16000,
  ) {}
  reset() {
    this.preRoll = [];
    this.chunks = [];
    this.speechSamples = 0;
    this.silenceSamples = 0;
    this.consecutiveSpeech = 0;
    this.active = false;
    this.voicedSamples = 0;
  }
  feed(samples: Float32Array): Float32Array | null {
    let energy = 0;
    for (const x of samples) energy += x * x;
    const voiced = Math.sqrt(energy / samples.length) >= this.threshold;
    if (!this.active) {
      this.preRoll.push(samples.slice());
      if (this.preRoll.length > 4) this.preRoll.shift();
      this.consecutiveSpeech = voiced ? this.consecutiveSpeech + samples.length : 0;
      if (this.consecutiveSpeech < this.sampleRate * 0.12) return null;
      this.active = true;
      this.chunks = this.preRoll;
      this.preRoll = [];
      this.voicedSamples = this.consecutiveSpeech;
      this.speechSamples = this.chunks.reduce((n, c) => n + c.length, 0);
    } else {
      this.chunks.push(samples.slice());
      this.speechSamples += samples.length;
      if (voiced) this.voicedSamples += samples.length;
    }
    this.silenceSamples = voiced ? 0 : this.silenceSamples + samples.length;
    if (this.silenceSamples >= this.sampleRate * 0.7 || this.speechSamples >= this.sampleRate * 12)
      return this.finish();
    return null;
  }
  finish(): Float32Array | null {
    if (!this.active || this.voicedSamples < this.sampleRate * 0.25) {
      this.reset();
      return null;
    }
    const result = new Float32Array(this.speechSamples);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    this.reset();
    return result;
  }
}
