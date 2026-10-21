import { useEffect, useMemo, useState } from 'react';
import type { Snapshot } from '../../../../shared/contracts';
import { bridge } from '../services/bridge';
import { AudioSession } from '../services/audio';

export function useJarvis() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [audioActive, setAudioActive] = useState(false);
  const audio = useMemo(() => new AudioSession(bridge, setAudioActive), []);
  useEffect(() => {
    const unsubscribe = bridge.onSnapshot(setSnapshot);
    void bridge
      .getSnapshot()
      .then(setSnapshot)
      .catch(() => setError('Cannot connect to the desktop process. Restart JARVIS.'));
    const stop = () => {
      void audio.stop().catch(() => {});
    };
    const stopSubscription = bridge.onAudioStop(stop);
    const visibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', stop);
    return () => {
      unsubscribe();
      stopSubscription();
      stop();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', stop);
    };
  }, [audio]);
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
  return { snapshot, error, audio, audioActive, run, bridge };
}
