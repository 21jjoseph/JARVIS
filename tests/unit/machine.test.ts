import { describe, expect, it } from 'vitest';
import { AVATAR_STATES, type AvatarState } from '../../shared/contracts';
import { INITIAL_RUNTIME, transition } from '../../shared/contracts/machine';
describe('avatar state machine', () => {
  it.each(AVATAR_STATES)('previews %s without implying an audio session', (state) => {
    expect(transition(INITIAL_RUNTIME, { type: 'SELECT', state })).toEqual({
      state,
      source: 'none',
      amplitude: 0,
      notice: null,
    });
  });
  it('moves through actual input capture and releases amplitude on stop', () => {
    const listening = transition(INITIAL_RUNTIME, { type: 'AUDIO_START', source: 'microphone' });
    expect(listening.state).toBe('LISTENING');
    expect(transition(listening, { type: 'AMPLITUDE', value: 2 }).amplitude).toBe(1);
    expect(transition(listening, { type: 'AMPLITUDE', value: -2 }).amplitude).toBe(0);
    expect(transition(listening, { type: 'AMPLITUDE', value: NaN })).toBe(listening);
    expect(transition(listening, { type: 'AUDIO_STOP' })).toEqual(INITIAL_RUNTIME);
  });
  it('requires audio to stop before preview and prevents overlapping sessions', () => {
    const speaking = transition(INITIAL_RUNTIME, { type: 'AUDIO_START', source: 'playback' });
    expect(speaking.state).toBe('SPEAKING');
    expect(() => transition(speaking, { type: 'SELECT', state: 'IDLE' })).toThrow();
    expect(() => transition(speaking, { type: 'AUDIO_START', source: 'test' })).toThrow();
  });
  it('does not accept unsolicited amplitudes and rejects unknown states', () => {
    expect(transition(INITIAL_RUNTIME, { type: 'AMPLITUDE', value: 1 })).toBe(INITIAL_RUNTIME);
    expect(() =>
      transition(INITIAL_RUNTIME, { type: 'SELECT', state: 'EXEC' as AvatarState }),
    ).toThrow();
  });
  it('clears capture on errors and limits notices', () => {
    const current = transition(INITIAL_RUNTIME, { type: 'AUDIO_START', source: 'test' });
    const failed = transition(current, { type: 'ERROR', message: 'x'.repeat(300) });
    expect(failed.source).toBe('none');
    expect(failed.state).toBe('ERROR');
    expect(failed.notice).toHaveLength(200);
  });
});
