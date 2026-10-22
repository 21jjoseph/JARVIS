import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type DesktopBridge } from '../../shared/contracts';
import { INITIAL_VOICE } from '../../shared/contracts/voice';
import { VoiceSession } from '../../apps/desktop/src/voice/session';

afterEach(() => vi.unstubAllGlobals());
it('preserves continuous microphone packets while inference is busy, and clears pending audio on stop', async () => {
  const port = {
    onmessage: null as ((event: { data: Float32Array }) => void) | null,
    close: () => {},
  };
  vi.stubGlobal(
    'AudioContext',
    class {
      sampleRate = 16000;
      state = 'running';
      destination = {};
      audioWorklet = { addModule: async () => {} };
      async resume() {}
      async close() {
        this.state = 'closed';
      }
      createGain() {
        return { gain: { value: 0 }, connect: () => {} };
      }
      createMediaStreamSource() {
        return { connect: () => {} };
      }
    },
  );
  vi.stubGlobal(
    'AudioWorkletNode',
    class {
      port = port;
      connect() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('navigator', {
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) },
  });
  const received: number[] = [];
  let unblock = () => {};
  const blocked = new Promise<void>((done) => {
    unblock = done;
  });
  const bridge = {
    voice: {
      start: async () => {},
      stop: async () => {},
      feed: async (data: Float32Array) => {
        received.push(data[0]!);
        if (received.length === 1) await blocked;
      },
    },
    publishAmplitude: () => {},
  } as unknown as DesktopBridge;
  const voice = new VoiceSession(
    bridge,
    () => {},
    () => {},
  );
  voice.update({ ...INITIAL_VOICE, phase: 'LISTENING' });
  await voice.start('push', { ...DEFAULT_SETTINGS });
  port.onmessage!({ data: new Float32Array([0.1]) });
  port.onmessage!({ data: new Float32Array([0.2]) });
  port.onmessage!({ data: new Float32Array([0.3]) });
  expect(received).toHaveLength(1);
  unblock();
  await vi.waitFor(() => expect(received).toHaveLength(3));
  expect(received.map((x) => Math.round(x * 10))).toEqual([1, 2, 3]);
  await voice.stop();
  expect(port.onmessage).toBeNull();
});
