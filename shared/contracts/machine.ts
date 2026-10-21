import { isState, type AvatarState, type AudioSource, type Runtime } from './index';
export type Event =
  | { type: 'SELECT'; state: AvatarState }
  | { type: 'AUDIO_START'; source: Exclude<AudioSource, 'none'> }
  | { type: 'AMPLITUDE'; value: number }
  | { type: 'AUDIO_STOP' }
  | { type: 'VOICE_PHASE'; state: AvatarState }
  | { type: 'ERROR'; message: string };
export const INITIAL_RUNTIME: Runtime = {
  state: 'IDLE',
  source: 'none',
  amplitude: 0,
  notice: null,
};
/** A single reducer owns state and audio ownership. Preview states never imply active audio. */
export function transition(current: Runtime, event: Event): Runtime {
  switch (event.type) {
    case 'SELECT':
      if (!isState(event.state)) throw new Error('Unknown avatar state.');
      if (current.source !== 'none')
        throw new Error('Stop the active audio session before previewing a state.');
      return { state: event.state, source: 'none', amplitude: 0, notice: null };
    case 'AUDIO_START':
      if (current.source !== 'none') throw new Error('An audio session is already active.');
      return {
        state: event.source === 'microphone' || event.source === 'voice' ? 'LISTENING' : 'SPEAKING',
        source: event.source,
        amplitude: 0,
        notice: null,
      };
    case 'AMPLITUDE':
      return current.source === 'none' || !Number.isFinite(event.value)
        ? current
        : { ...current, amplitude: Math.max(0, Math.min(1, event.value)) };
    case 'AUDIO_STOP':
      return { ...INITIAL_RUNTIME };
    case 'VOICE_PHASE':
      return current.source === 'voice'
        ? { ...current, state: event.state, amplitude: 0 }
        : current;
    case 'ERROR':
      return { state: 'ERROR', source: 'none', amplitude: 0, notice: event.message.slice(0, 200) };
  }
}
