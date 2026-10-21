import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, validateDelta, validateSettingsPatch } from '../../shared/contracts';
describe('privileged input validation', () => {
  it('accepts complete defaults and partial settings', () => {
    expect(validateSettingsPatch(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(validateSettingsPatch({ color: '#aAbB00', size: 220 })).toEqual({
      color: '#aAbB00',
      size: 220,
    });
  });
  it.each([
    null,
    [],
    true,
    { unknown: true },
    { __proto__: null, size: 10000 },
    { size: NaN },
    { size: 320.2 },
    { intensity: Infinity },
    { reducedMotion: 'yes' },
    { color: 'url(secret)' },
    { quality: 'ultra' },
    { position: { x: 10 } },
    { position: { x: 0, y: 0, z: 1 } },
  ])('rejects malformed input %j', (value) => {
    expect(() => validateSettingsPatch(value)).toThrow();
  });
  it('rejects oversized or non-finite window movement', () => {
    expect(validateDelta(5.4, -3)).toEqual({ dx: 5, dy: -3 });
    expect(() => validateDelta(Infinity, 0)).toThrow();
    expect(() => validateDelta(0, 5001)).toThrow();
  });
});
