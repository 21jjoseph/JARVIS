import { useEffect, useState } from 'react';
import type { Settings } from '../../../../shared/contracts';
import type { AiReply, AiStatus } from '../../../../shared/contracts/ai';
import { bridge } from '../services/bridge';
import './conversation.css';

export function ConversationPanel({
  settings,
  update,
  desktop,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  desktop: boolean;
}) {
  const ro = settings.locale === 'ro';
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [reply, setReply] = useState<AiReply | null>(null);
  const [text, setText] = useState('');
  const [route, setRoute] = useState<'local' | 'cloud'>('local');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [key, setKey] = useState('');
  const refresh = () => {
    void bridge.ai
      .status()
      .then(setStatus)
      .catch(() => setError('AI service is unavailable.'));
  };
  useEffect(() => {
    refresh();
    void bridge.ai
      .lastReply()
      .then(setReply)
      .catch(() => {});
    return bridge.ai.onReply((value) => {
      setReply(value);
      setResult('');
    });
  }, []);
  async function send() {
    setError('');
    setBusy(true);
    setResult('');
    setReply(null);
    try {
      await bridge.ai.ask({ text, route, cloudConsent: route === 'cloud' && consent });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI request failed.');
    } finally {
      setBusy(false);
      setConsent(false);
    }
  }
  async function resolve(approve: boolean) {
    if (!reply?.tool) return;
    setBusy(true);
    setError('');
    const id = reply.tool.id;
    setReply({ ...reply, tool: null });
    try {
      setResult(await bridge.ai.resolve(id, approve));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel conversation-panel" data-testid="conversation-panel">
      <div className="section-header">
        <div>
          <span className="eyebrow">JARVIS / AI & TOOLS</span>
          <h2>{ro ? 'Conversație' : 'Conversation'}</h2>
        </div>
        <span className="source-tag">{route === 'local' ? 'LOCAL' : 'OPENAI'}</span>
      </div>
      <p>
        {ro
          ? 'Scrie un mesaj sau folosește vocea locală. Acțiunile cer aprobarea ta.'
          : 'Type a message or use local voice. Actions require your approval.'}
      </p>
      <details className="ai-settings" open={!settings.localModel}>
        <summary>{ro ? 'Conexiuni AI' : 'AI connections'}</summary>
        <p role="status">
          {status?.message || (ro ? 'Verific serviciul local…' : 'Checking local service…')}
        </p>
        <label>
          {ro ? 'Model local Ollama' : 'Local Ollama model'}
          <select
            aria-label="Local Ollama model"
            value={settings.localModel}
            onChange={(e) => update({ localModel: e.target.value })}
            disabled={busy}
          >
            <option value="">{ro ? 'Alege un model instalat' : 'Choose an installed model'}</option>
            {Array.from(
              new Set([
                ...(status?.models || []),
                ...(settings.localModel ? [settings.localModel] : []),
              ]),
            ).map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <button className="text-button" onClick={refresh} disabled={busy}>
          {ro ? 'Verifică din nou' : 'Refresh connection'}
        </button>
        <p className="muted">
          {ro
            ? 'Folosește un server Ollama compatibil cu Monterey. Instrucțiuni în docs/ai.md. Niciun model nu este descărcat automat.'
            : 'Use a Monterey-compatible Ollama server. See docs/ai.md. Models are never downloaded automatically.'}
        </p>
        <label>
          {ro ? 'Model OpenAI' : 'OpenAI model'}
          <input
            aria-label="OpenAI model"
            value={settings.cloudModel}
            maxLength={100}
            onChange={(e) => update({ cloudModel: e.target.value })}
            disabled={busy}
          />
        </label>
        <label>
          {ro ? 'Cheie API OpenAI' : 'OpenAI API key'}
          <input
            aria-label="OpenAI API key"
            type="password"
            autoComplete="off"
            value={key}
            maxLength={512}
            onChange={(e) => setKey(e.target.value)}
            placeholder={status?.keyStored ? 'Saved securely' : 'Optional'}
          />
        </label>
        <div className="ai-actions">
          <button
            className="text-button"
            disabled={!key || busy}
            onClick={() => {
              setBusy(true);
              void bridge.ai
                .setKey(key)
                .then(() => {
                  setKey('');
                  refresh();
                })
                .catch((e) => setError(String(e)))
                .finally(() => setBusy(false));
            }}
          >
            {ro ? 'Salvează cheia securizat' : 'Save key securely'}
          </button>
          <button
            className="text-button"
            disabled={busy || !status?.keyStored}
            onClick={() => {
              void bridge.ai
                .setKey('')
                .then(refresh)
                .catch((e) => setError(String(e)));
            }}
          >
            {ro ? 'Șterge cheia salvată' : 'Remove saved key'}
          </button>
        </div>
        <p className="muted">
          {ro
            ? 'Cheia este criptată prin sistemul de operare. JARVIS nu păstrează conversațiile pe disc.'
            : 'The operating system encrypts your saved key. JARVIS does not save conversations to disk.'}
        </p>
      </details>
      <label>
        {ro ? 'Destinația mesajului' : 'Message destination'}
        <select
          aria-label="Message destination"
          value={route}
          onChange={(e) => {
            setRoute(e.target.value as 'local' | 'cloud');
            setConsent(false);
          }}
          disabled={busy}
        >
          <option value="local">{ro ? 'Local / offline' : 'Local / offline'}</option>
          <option value="cloud">OpenAI cloud</option>
        </select>
      </label>
      <label>
        {ro ? 'Mesaj către JARVIS' : 'Message JARVIS'}
        <textarea
          aria-label="Message JARVIS"
          maxLength={4000}
          rows={3}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setConsent(false);
          }}
          placeholder={ro ? 'Arată informații despre sistem' : 'Show system info'}
          disabled={busy}
        />
      </label>
      {route === 'cloud' && (
        <label className="ai-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            disabled={busy}
          />
          <span>
            {ro
              ? 'Permit trimiterea acestui mesaj către OpenAI. Fișierele și mesajele anterioare rămân locale.'
              : 'Send this message to OpenAI. Files and earlier messages stay local.'}
          </span>
        </label>
      )}
      <div className="ai-actions">
        <button
          className="primary-button"
          onClick={() => void send()}
          disabled={!desktop || busy || !text.trim() || (route === 'cloud' && !consent)}
        >
          {busy ? (ro ? 'Lucrez…' : 'Working…') : ro ? 'Trimite' : 'Send'}
        </button>
        <button
          className="text-button"
          onClick={() => {
            void bridge.ai.cancel();
            setReply(null);
          }}
          disabled={!desktop}
        >
          {ro ? 'Oprește' : 'Stop'}
        </button>
      </div>
      <p className="muted">
        {ro
          ? 'Fără AI conectat: „Cât este ceasul?”, „Arată informații despre sistem”, „Deschide calculator”, „Deschide downloads”, „Citește un fișier”. Vocea folosește numai AI local.'
          : 'Without AI: “What time is it?”, “Show system info”, “Open calculator”, “Open downloads”, “Read a file”. Voice uses local AI only.'}
      </p>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {reply && (
        <div className="ai-reply" aria-live="polite">
          <span className="eyebrow">{reply.provider.toUpperCase()}</span>
          <p>{reply.text || reply.error}</p>
          {reply.error && reply.text && <p>{reply.error}</p>}
        </div>
      )}
      {reply?.tool && (
        <div className="ai-approval" role="region" aria-label="Action approval">
          <strong>
            {ro ? 'Permiți această acțiune o singură dată?' : 'Allow this action once?'}
          </strong>
          <p>{reply.tool.name}</p>
          <pre>{JSON.stringify(reply.tool.arguments, null, 2)}</pre>
          <p>
            {ro
              ? 'Aprobarea expiră în 60 de secunde. Rezultatele rămân pe dispozitiv.'
              : 'Approval expires after 60 seconds. Results stay on this device.'}
          </p>
          <div className="ai-actions">
            <button className="primary-button" onClick={() => void resolve(true)} disabled={busy}>
              {ro ? 'Permite o dată' : 'Allow once'}
            </button>
            <button className="text-button" onClick={() => void resolve(false)} disabled={busy}>
              {ro ? 'Refuză' : 'Deny'}
            </button>
          </div>
        </div>
      )}
      {result && (
        <div className="ai-result" data-testid="tool-result">
          <span className="eyebrow">{ro ? 'REZULTAT LOCAL' : 'LOCAL RESULT'}</span>
          <pre>{result}</pre>
        </div>
      )}
    </section>
  );
}
