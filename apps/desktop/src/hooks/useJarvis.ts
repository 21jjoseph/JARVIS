import { useEffect, useMemo, useState } from 'react';
import type { Snapshot } from '../../../../shared/contracts';
import { bridge } from '../services/bridge';
import { AudioSession } from '../services/audio';
import { VoiceSession } from '../voice/session';
import { INITIAL_VOICE, type VoiceStatus } from '../../../../shared/contracts/voice';

export function useJarvis() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [audioActive, setAudioActive] = useState(false);
  const audio = useMemo(() => new AudioSession(bridge, setAudioActive), []);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>({ ...INITIAL_VOICE });
  const [voiceActive, setVoiceActive] = useState(false);
  const voice = useMemo(() => new VoiceSession(bridge, setVoiceActive, setError), []);
  useEffect(() => {
    const unsubscribe = bridge.onSnapshot(setSnapshot);
    void bridge
      .getSnapshot()
      .then(setSnapshot)
      .catch(() => setError('Cannot connect to the desktop process. Restart 21.'));
    const stop = () => {
      void audio.stop().catch(() => {});
      void voice.stop().catch(() => {});
    };
    const stopSubscription = bridge.onAudioStop(() => {
      void audio.stop().catch(() => {});
      void voice.stop(false).catch(() => {});
    });
    const updateVoice = (status: VoiceStatus) => {
      voice.update(status);
      setVoiceStatus(status);
    };
    const voiceSubscription = bridge.voice.onStatus(updateVoice);
    const playbackSubscription = bridge.voice.onAudio((audio) => {
      void voice.play(audio);
    });
    void bridge.voice
      .status()
      .then(updateVoice)
      .catch(() => {});
    const visibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', stop);
    return () => {
      unsubscribe();
      stopSubscription();
      voiceSubscription();
      playbackSubscription();
      stop();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', stop);
    };
  }, [audio, voice]);
  async function run(operation: () => Promise<unknown>) {
    setError('');
    try {
      await operation();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Operation failed.';
      setError(
        message.includes('Permission') ||
          message.includes('denied') ||
          message.includes('NotAllowed')
          ? 'Microfon blocat. Permite accesul în setările de confidențialitate ale sistemului, apoi încearcă din nou.'
          : message,
      );
    }
  }
  return { snapshot, error, audio, audioActive, run, bridge, voice, voiceStatus, voiceActive };
}
