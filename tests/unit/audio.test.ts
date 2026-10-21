import { describe, expect, it } from 'vitest';
import { audioLevel, rms } from '../../apps/desktop/src/services/audio';
import { damp, PROFILES } from '../../apps/desktop/src/avatar/profiles';
import { AVATAR_STATES } from '../../shared/contracts';
describe('signal and animation', () => {
  it('measures real audio energy, clamps clipping and ignores the noise floor', () => {
    expect(rms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5);
    expect(audioLevel(new Float32Array(512))).toBe(0);
    expect(audioLevel(new Float32Array([0.001, -0.001]))).toBe(0);
    expect(audioLevel(new Float32Array([1, -1]))).toBe(1);
    expect(rms(new Float32Array())).toBe(0);
  });
  it('smooths independently of frame rate and never overshoots', () => {
    const a = damp(0, 1, 1 / 30),
      b = damp(damp(0, 1, 1 / 60), 1, 1 / 60);
    expect(a).toBeCloseTo(b, 10);
    expect(damp(0, 1, 10)).toBeLessThanOrEqual(1);
  });
  it('defines finite, distinct profiles for every supported state', () => {
    for (const state of AVATAR_STATES)
      Object.values(PROFILES[state]).forEach((value) => expect(Number.isFinite(value)).toBe(true));
    expect(PROFILES.OFFLINE.speed).toBeLessThan(PROFILES.IDLE.speed);
    expect(PROFILES.THINKING.speed).toBeGreaterThan(PROFILES.IDLE.speed);
  });
});
