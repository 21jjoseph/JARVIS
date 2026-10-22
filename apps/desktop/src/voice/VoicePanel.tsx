import { useEffect, useState } from 'react';
import type { Settings } from '../../../../shared/contracts';
import type { VoiceStatus } from '../../../../shared/contracts/voice';
import type { VoiceSession } from './session';
import { bridge } from '../services/bridge';
import { Icon } from '../components/Icon';
import './voice.css';
import { ProviderSettings } from './ProviderSettings';

interface Props {
  settings: Settings;
  status: VoiceStatus;
  voice: VoiceSession;
  desktop: boolean;
  platform: string;
  run: (operation: () => Promise<unknown>) => Promise<void>;
}
const labels = {
  ro: {
    title: 'Spune „Jarvis”.',
    subtitle: 'Twenty One. O prezență care răspunde.',
    talk: 'Apasă și vorbește',
    wake: 'Activează „Jarvis”',
    stop: 'Oprește / mute',
    interrupt: 'Întrerupe și vorbește',
    install: 'Descarcă modelele vocale · 268 MB',
    verify: 'Verifică modelele',
    language: 'Limba conversației',
    word: 'Cuvânt de activare',
    rate: 'Viteza vocii',
    heard: 'AI SPUS',
    reply: '21',
    demo: 'Încearcă: „Cât este ceasul?”, „Deschide panoul de control”, „Salut”.',
    privacy:
      'Activarea este opțională. Microfonul rămâne local, fără înregistrări sau încărcări. Mute oprește capturarea.',
    hint: 'În modul de activare, spune „Jarvis”, așteaptă „Da, te ascult”, apoi vorbește. Pentru întrerupere, apasă butonul de mai sus.',
    WAKE_DETECTED:'Activare detectată',
    OFF: 'Microfon oprit',
    STARTING: 'Se pregătește vocea locală…',
    ARMED: 'Microfon activ · aștept „Jarvis”',
    LISTENING: 'Te ascult…',
    TRANSCRIBING: 'Transcriu pe dispozitiv…',
    SYNTHESIZING: 'Pregătesc răspunsul…',
    SPEAKING: 'Vorbesc',
    ERROR: 'Vocea s-a oprit',
  },
  en: {
    title: 'Say “Jarvis”.',
    subtitle: 'Twenty One. A presence that answers.',
    talk: 'Press to talk',
    wake: 'Enable “Jarvis”',
    stop: 'Stop / mute',
    interrupt: 'Interrupt and talk',
    install: 'Download voice models · 268 MB',
    verify: 'Verify models',
    language: 'Conversation language',
    word: 'Wake phrase',
    rate: 'Speech rate',
    heard: 'YOU SAID',
    reply: '21',
    demo: 'Try: “What time is it?”, “Open the control room”, “Hello”.',
    privacy:
      'Activation is optional. Microphone audio stays local, without recordings or uploads. Mute stops capture.',
    hint: 'In wake mode, say “Jarvis”, wait for “Yes, I am listening”, then speak. Use the button above to interrupt.',
    WAKE_DETECTED:'Wake detected',
    OFF: 'Microphone off',
    STARTING: 'Preparing local voice…',
    ARMED: 'Microphone active · waiting for “Jarvis”',
    LISTENING: 'Listening…',
    TRANSCRIBING: 'Transcribing on this device…',
    SYNTHESIZING: 'Preparing a reply…',
    SPEAKING: 'Speaking',
    ERROR: 'Voice stopped',
  },
};
export function VoicePanel({ settings, status, voice, desktop, platform, run }: Props) {
  const t = labels[settings.locale],
    active = status.phase !== 'OFF' && status.phase !== 'ERROR';
  const wakeLabel = settings.wakeWord.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  const wakeText = (text: string) => text.replaceAll('Jarvis', wakeLabel);
  const [pending, setPending] = useState(false);
  const [word, setWord] = useState(settings.wakeWord);
  const [systemVoices, setSystemVoices] = useState<Array<{ name: string; language: string }>>([]);
  useEffect(() => {
    void bridge.voice
      .systemVoices()
      .then(setSystemVoices)
      .catch(() => {});
  }, []);
  const action = (operation: () => Promise<unknown>) => {
    setPending(true);
    void run(operation).finally(() => setPending(false));
  };
  const disabled = !desktop || pending || status.installing;
  const update = (patch: Partial<Settings>) => action(() => bridge.updateSettings(patch));
  return (
    <section className="panel voice-panel" data-testid="voice-panel">
      <div className="voice-heading">
        <div>
          <span className="eyebrow">21 / VOICE</span>
          <h2>{wakeText(t.title)}</h2>
          <p>{t.subtitle}</p>
        </div>
        <div
          className={`voice-status ${active ? 'live' : ''}`}
          role="status"
          data-testid="voice-status"
        >
          <span className="dot" />
          {wakeText(t[status.phase])}
        </div>
      </div>
      <ProviderSettings settings={settings} status={status} voice={voice} run={run}/>
      <p className="voice-privacy">
        <Icon name="shield" size={16} />
        {status.cloudStreaming?(settings.locale==='ro'?'Microfonul transmite audio către Gemini cu acordul tău. Oprește pentru a încheia transmisia.':'Microphone audio is streaming to Gemini with your consent. Stop ends the stream.'):t.privacy}
      </p>
      {!status.modelsReady ? (
        <div className="voice-install">
          <button
            className="primary-button"
            disabled={disabled}
            onClick={() => action(() => bridge.voice.install())}
          >
            {status.installing ? `${status.progress}% · ${status.message}` : t.install}
          </button>
          <p>Whisper tiny · English wake word · Piper Mihai / Amy</p>
          {status.installing && (
            <progress value={status.progress} max="100" aria-label="Voice model download" />
          )}
        </div>
      ) : (
        <>
          <div className="voice-actions">
            <button
              className="primary-button"
              disabled={disabled || active}
              onClick={() => action(() => voice.start('push', settings))}
            >
              <Icon name="mic" />
              {t.talk}
            </button>
            <button
              className="secondary-button"
              disabled={disabled || active}
              onClick={() => action(() => voice.start('wake', settings))}
            >
              <Icon name="wave" />
              {wakeText(t.wake)}
            </button>
            <button
              className="secondary-button danger-button"
              disabled={!desktop || (!active && !pending)}
              onClick={() => {
                void run(() => bridge.voice.stop());
              }}
            >
              <Icon name="stop" size={14} />
              {t.stop}
            </button>
            {['TRANSCRIBING', 'SYNTHESIZING', 'SPEAKING'].includes(status.phase) && (
              <button
                className="secondary-button"
                disabled={disabled}
                onClick={() =>
                  action(async () => {
                    await bridge.voice.stop();
                    await voice.stop(false);
                    await voice.start('push', settings);
                  })
                }
              >
                {t.interrupt}
              </button>
            )}
          </div>
          <div className="voice-settings">
            <label>
              {t.language}
              <select
                value={settings.voiceLanguage}
                disabled={active || disabled}
                onChange={(e) =>
                  update({ voiceLanguage: e.target.value as Settings['voiceLanguage'] })
                }
              >
                <option value="ro">Română · Mihai</option>
                <option value="en">English · Amy</option>
              </select>
            </label>
            <label>
              {t.word}
              <input
                value={word}
                maxLength={41}
                disabled={active || disabled}
                onChange={(e) => setWord(e.target.value)}
                onBlur={() => {
                  if (word !== settings.wakeWord) update({ wakeWord: word.trim().toLowerCase() });
                }}
              />
            </label>
            <label>
              {t.rate}
              <select
                value={settings.speechRate}
                disabled={active || disabled}
                onChange={(e) => update({ speechRate: Number(e.target.value) })}
              >
                <option value="0.85">0.85×</option>
                <option value="1">1×</option>
                <option value="1.15">1.15×</option>
              </select>
            </label>
          </div>
          <div className="voice-settings">
            <label>
              {settings.locale === 'ro' ? 'Furnizor de voce' : 'Voice provider'}
              <select
                value={settings.ttsProvider}
                disabled={active || disabled}
                onChange={(e) => update({ ttsProvider: e.target.value as Settings['ttsProvider'] })}
              >
                <option value="piper">Piper · local</option>
                <option value="gemini">Gemini cloud · requires speech consent</option>
        <option value="system" disabled={platform !== 'darwin'}>
                  macOS · local
                </option>
              </select>
            </label>
            {settings.ttsProvider === 'system' && (
              <label>
                macOS voice
                <select
                  value={settings.systemVoice}
                  disabled={active || disabled}
                  onChange={(e) => update({ systemVoice: e.target.value })}
                >
                  <option value="">Auto</option>
                  {systemVoices
                    .filter((v) => v.language === settings.voiceLanguage)
                    .map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <p className="voice-hint">STT: {status.recognitionProvider||'local-whisper'} · {status.cloudStreaming?'CLOUD AUDIO ACTIVE':'local microphone path'}</p>
          </div>
          {status.partial&&<p aria-live="polite">{status.partial}</p>}
          {status.message&&<p className="voice-hint">{status.message}</p>}
          <div className="voice-conversation">
            <div>
              <span>{t.heard}</span>
              <p data-testid="voice-transcript">{status.heard || '—'}</p>
            </div>
            <div>
              <span>{t.reply}</span>
              <p data-testid="voice-reply">{status.reply || '—'}</p>
            </div>
          </div>
          <p className="voice-demo">{t.demo}</p>
          <p className="voice-hint">{wakeText(t.hint)}</p>
          <button
            className="text-button"
            disabled={active || disabled}
            onClick={() => action(() => bridge.voice.install())}
          >
            {t.verify}
          </button>
        </>
      )}
      {status.error && (
        <p className="error-banner" role="alert">
          {status.error}
        </p>
      )}
    </section>
  );
}
