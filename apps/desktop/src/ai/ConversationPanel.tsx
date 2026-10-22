import { useEffect, useRef, useState } from 'react';
import type { Settings } from '../../../../shared/contracts';
import type { AiReply, AiStatus } from '../../../../shared/contracts/ai';
import { bridge } from '../services/bridge';
import './conversation.css';
import { IntelligenceSettings } from './IntelligenceSettings';

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
  const [route, setRoute] = useState<'local' | 'cloud' | 'auto'>('auto');
  const [privateRequest,setPrivateRequest]=useState(false);
  const [shareContext,setShareContext]=useState(false);
  const [shareResult,setShareResult]=useState(false);
  const [partial,setPartial]=useState('');
  const [routeLabel,setRouteLabel]=useState('');
  const [routeReason,setRouteReason]=useState('');
  const requestId=useRef('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
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
    const replySubscription=bridge.ai.onReply((value) => {
      setReply(value);setPartial('');setShareResult(false);
      setResult('');
    });
    const streamSubscription=bridge.ai.onDelta(event=>{
      if(event.requestId!==requestId.current){requestId.current=event.requestId;setPartial('');}
      if(event.text)setPartial(current=>(current+event.text).slice(0,4000));
      if(event.provider)setRouteLabel(event.provider.toUpperCase()+(event.model?' · '+event.model:''));
      if(event.reason)setRouteReason(event.reason);
    });
    return ()=>{replySubscription();streamSubscription();};
  }, []);
  async function send() {
    setError('');
    setBusy(true);
    setResult('');
    setReply(null);setPartial('');setRouteLabel('');setRouteReason('');
    try {
      await bridge.ai.ask({ text, route:privateRequest?'local':route,cloudConsent:!privateRequest&&((route==='cloud'||settings.aiMode==='cloud')?consent:settings.hybridCloudConsent),private:privateRequest,shareContext });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI request failed.');
    } finally {
      setBusy(false);
      setConsent(false);setShareContext(false);
    }
  }
  async function resolve(approve: boolean) {
    if (!reply?.tool) return;
    setBusy(true);
    setError('');
    const id = reply.tool.id;
    setReply({ ...reply, tool: null });
    try {
      setResult(await bridge.ai.resolve(id, approve,shareResult));
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
          <span className="eyebrow">21 / AI INTELLIGENCE</span>
          <h2>{ro ? 'Conversație' : 'Conversation'}</h2>
        </div>
        <span className="source-tag">{routeLabel||settings.aiMode.toUpperCase()}</span>
      </div>
      <p>
        {ro
          ? 'Scrie un mesaj sau folosește vocea locală. Acțiunile cer aprobarea ta.'
          : 'Type a message or use local voice. Actions require your approval.'}
      </p>
      <IntelligenceSettings settings={settings} update={update} desktop={desktop} refresh={refresh}/>
      <p role="status">{status?.message}</p>
      <label>
        {ro ? 'Destinația mesajului' : 'Message destination'}
        <select
          aria-label="Message destination"
          value={route}
          onChange={(e) => {
            setRoute(e.target.value as 'local' | 'cloud' | 'auto');
            setConsent(false);
          }}
          disabled={busy}
        >
          <option value="auto">{ro?'Modul AI selectat':'Use selected AI mode'}</option>
          <option value="local">{ro ? 'Local / offline' : 'Local / offline'}</option>
          <option value="cloud" disabled={!settings.cloudEnabled||settings.aiMode==='local'}>{settings.cloudProvider.toUpperCase()} cloud</option>
        </select>
      </label>
      <label>
        {ro ? 'Mesaj către Twenty One' : 'Message Twenty One'}
        <textarea
          aria-label="Message Twenty One"
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
      <label className="ai-consent"><input type="checkbox" checked={privateRequest} onChange={e=>{setPrivateRequest(e.target.checked);setConsent(false);}}/><span>{ro?'Cerere privată — doar local':'Private request — local only'}</span></label>
      {settings.shareContext&&!privateRequest&&settings.cloudEnabled&&<label className="ai-consent"><input type="checkbox" checked={shareContext} onChange={e=>setShareContext(e.target.checked)}/><span>{ro?'Permite contextul recent în cloud pentru această cerere':'Allow recent context in cloud for this request'}</span></label>}
      {(route === 'cloud'||(route==='auto'&&settings.aiMode==='cloud')) && !privateRequest && (
        <label className="ai-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            disabled={busy}
          />
          <span>
            {ro
              ? 'Permit trimiterea acestui mesaj către furnizorul cloud. Fișierele rămân locale.'
              : 'Send this message to the selected cloud provider. Files stay local.'}
          </span>
        </label>
      )}
      <div className="ai-actions">
        <button
          className="primary-button"
          onClick={() => void send()}
          disabled={!desktop || busy || !text.trim() || ((route === 'cloud'||(route==='auto'&&settings.aiMode==='cloud')) && !privateRequest && !consent)}
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
          ? 'Fără AI conectat: „Cât este ceasul?”, „Arată informații despre sistem”, „Deschide calculator”, „Deschide downloads”, „Citește un fișier”. Vocea folosește AI local până când autorizezi separat cloud.'
          : 'Without AI: “What time is it?”, “Show system info”, “Open calculator”, “Open downloads”, “Read a file”. Voice uses local AI unless you separately authorize cloud reasoning.'}
      </p>
      {routeReason&&<p className="muted">{routeReason}</p>}
      {partial&&<div className="ai-reply" data-testid="streaming-reply" aria-live="polite"><span className="eyebrow">{routeLabel}</span><p>{partial}</p></div>}
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {reply && (
        <div className="ai-reply" aria-live="polite">
          <span className="eyebrow">{reply.provider.toUpperCase()} {reply.provider_name&&' · '+reply.provider_name} {reply.model&&' · '+reply.model}</span>
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
              ? 'Aprobarea expiră în 60 de secunde. AI local poate primi rezultatul; cloud cere aprobare separată.'
              : 'Approval expires after 60 seconds. Local AI can receive the result; cloud sharing requires the separate checkbox.'}
          </p>
          {reply.tool.cloudResultConsentRequired&&<label className="ai-consent"><input type="checkbox" checked={shareResult} onChange={e=>setShareResult(e.target.checked)}/><span>{ro?'Permite trimiterea rezultatului acestei acțiuni la modelul cloud. Altfel rezultatul rămâne local.':'Allow this action result to be sent to the cloud model. Otherwise it stays local.'}</span></label>}
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
      {reply?.metrics&&<p className="muted">TTFT: {reply.metrics.ttft_ms===null?'not streamed':`${reply.metrics.ttft_ms.toFixed(0)} ms`} · Total: {reply.metrics.total_ms.toFixed(0)} ms · Throughput: {reply.metrics.tokens_per_second?.toFixed(1)??'—'} tokens/s · Tokens: {reply.usage?.input_tokens??'—'} / {reply.usage?.output_tokens??'—'} · Reasoning: {reply.usage?.reasoning_tokens??'—'}{reply.estimated_cost!==null&&reply.estimated_cost!==undefined?` · Estimated cost: ${reply.estimated_cost.toFixed(6)}`:''}</p>}
      {reply?.spend_warning&&<p role="alert">Configured spending warning reached. This is not a provider billing cap.</p>}
      {result && (
        <div className="ai-result" data-testid="tool-result">
          <span className="eyebrow">{ro ? 'REZULTAT LOCAL' : 'LOCAL RESULT'}</span>
          <pre>{result}</pre>
        </div>
      )}
    </section>
  );
}
