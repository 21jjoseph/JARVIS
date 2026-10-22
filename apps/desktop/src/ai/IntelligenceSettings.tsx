import { useEffect,useState } from 'react';
import type { Settings } from '../../../../shared/contracts';
import type { ConnectionStatus,LocalModelStatus,ModelRelease } from '../../../../shared/contracts/ai';
import { bridge } from '../services/bridge';

export function IntelligenceSettings({settings,update,desktop,refresh}:{settings:Settings;update:(patch:Partial<Settings>)=>void;desktop:boolean;refresh:()=>void}) {
  const ro=settings.locale==='ro';
  const [local,setLocal]=useState<LocalModelStatus|null>(null);
  const [connection,setConnection]=useState<ConnectionStatus|null>(null);
  const [repositories,setRepositories]=useState<Array<{id:string;gated:boolean|string}>>([]);
  const [releases,setReleases]=useState<ModelRelease[]>([]);
  const [release,setRelease]=useState('');
  const [approval,setApproval]=useState(false);
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const [importNote,setImportNote]=useState('');
  const [legacyModels,setLegacyModels]=useState<string[]>([]);
  const [keyConfigured,setKeyConfigured]=useState(false);
  const poll=()=>{void bridge.ai.local('status').then(value=>setLocal(value as LocalModelStatus)).catch(()=>{});};
  useEffect(()=>{poll();const timer=setInterval(poll,4000);return()=>clearInterval(timer);},[]);
  const run=async(operation:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await operation();poll();refresh();}catch(e){setError(e instanceof Error?e.message:'Configuration failed.');}finally{setBusy(false);}};
  useEffect(()=>{setConnection(null);void bridge.ai.status().then(s=>setKeyConfigured(s.keyStored)).catch(()=>{});},[settings.cloudProvider]);
  const selected=releases.find(file=>file.id===release);
  const mib=(value:number|null|undefined)=>value===null||value===undefined?'—':`${(value/1024**2).toFixed(0)} MiB`;
  return <details className="ai-settings" open={!settings.modelPath && !settings.localModel}>
    <summary>AI Intelligence · {ro?'Configurare':'Configuration'}</summary>
    <label>{ro?'Mod AI':'AI mode'}<select aria-label="AI mode" value={settings.aiMode} onChange={e=>update({aiMode:e.target.value as Settings['aiMode']})} disabled={busy}>
      <option value="local">LOCAL</option><option value="hybrid" disabled={!settings.cloudEnabled||!settings.hybridCloudConsent}>HYBRID</option><option value="cloud" disabled={!settings.cloudEnabled}>CLOUD</option>
    </select></label>
    <label>{ro?'Personalitate':'Personality'}<select aria-label="Personality" value={settings.personality} onChange={e=>update({personality:e.target.value as Settings['personality']})}><option value="casual">Casual</option><option value="professional">Professional</option></select></label>
    <fieldset className="ai-fieldset"><legend>LOCAL · Gemma 4 / llama.cpp</legend>
      <label>{ro?'Motor local':'Local engine'}<select aria-label="Local engine" value={settings.localBackend} onChange={e=>update({localBackend:e.target.value as Settings['localBackend']})} disabled={busy}><option value="llama">llama.cpp · Gemma 4</option><option value="ollama">Ollama · existing connection</option></select></label>
      {settings.localBackend==='llama'?<>
        <p role="status">{local?.engine_installed?(ro?'Motor CPU instalat':'CPU engine installed'):(ro?'Pe Intel Mac: bash scripts/setup-gemma-macos.sh':'On Intel Mac: bash scripts/setup-gemma-macos.sh')}</p>
        <p>{local?.engine.loading?'LOADING':local?.engine.running?'RUNNING':'UNLOADED'} · RAM {mib(local?.engine.rss_bytes)} · CPU {local?.engine.cpu_percent===null||local?.engine.cpu_percent===undefined?'—':`${local.engine.cpu_percent.toFixed(1)}%`} · {ro?'Încărcare':'Load'} {local?.engine.load_ms?`${(local.engine.load_ms/1000).toFixed(2)}s`:'—'}</p>
        <label>llama-server endpoint<input aria-label="Local endpoint" value={settings.localEndpoint} onChange={e=>update({localEndpoint:e.target.value})}/></label>
        <p className="muted">CPU · 4096 tokens · {ro?'o singură generare':'one generation'} · Metal OFF · {ro?'Niciun model nu este descărcat automat.':'Models are never downloaded automatically.'}</p>
        <p className="ai-model-path">{ro?'Fișier selectat':'Selected file'}: {settings.modelPath||'—'}<br/>{ro?'Director descărcări':'Download directory'}: {settings.modelDirectory||(ro?'Datele aplicației / models':'Application data / models')}</p>
        <div className="ai-actions"><button className="text-button" disabled={!desktop||busy} onClick={()=>void run(async()=>{const result=await bridge.ai.local('choose_model') as {message?:string}|null;setImportNote(result?.message||'');})}>{ro?'Alege GGUF existent':'Choose existing GGUF'}</button><button className="text-button" disabled={!desktop||busy} onClick={()=>void run(()=>bridge.ai.local('choose_directory'))}>{ro?'Alege director':'Choose directory'}</button></div>
        {importNote&&<p role="status">{importNote}</p>}
        <div className="ai-actions"><button className="primary-button" disabled={!desktop||busy||!local?.engine_installed||(!settings.modelPath&&!local?.download.path)} onClick={()=>void run(()=>bridge.ai.local('start',{approved:true}))}>{ro?'Încarcă modelul':'Load model'}</button><button className="text-button" disabled={!desktop||busy||!local?.engine.running} onClick={()=>void run(()=>bridge.ai.local('stop'))}>{ro?'Descarcă din RAM':'Unload model'}</button><button className="text-button" onClick={poll}>{ro?'Actualizează starea':'Refresh local status'}</button></div>
        <label>{ro?'Fire CPU (începe cu 2)':'CPU threads (start with 2)'}<input type="number" min={1} max={8} value={settings.inferenceThreads} onChange={e=>update({inferenceThreads:Number(e.target.value)})}/></label>
        <label>{ro?'Eliberează memoria după inactivitate (secunde)':'Unload after idle (seconds)'}<input type="number" min={60} max={3600} value={settings.modelIdleSeconds} onChange={e=>update({modelIdleSeconds:Number(e.target.value)})}/></label>
        <details><summary>{ro?'Instalează un model oficial Google':'Install an official Google model'}</summary>
          <p>{ro?'E2B este recomandarea inițială. E4B este opțional și trebuie comparat prin benchmark. QAT Q4_0 este preferat numai când sursa îl confirmă.':'Start with E2B. E4B is optional and requires benchmarking. Prefer QAT Q4_0 only when confirmed by the source.'}</p>
          <button className="text-button" disabled={!desktop||busy||local?.download.active} onClick={()=>void run(async()=>{const result=await bridge.ai.local('discover') as {repositories:typeof repositories};setRepositories(result.repositories);})}>{ro?'Caută surse oficiale':'Discover official releases'}</button>
          {repositories.length>0&&<label>{ro?'Sursă oficială':'Official source'}<select aria-label="Official model source" onChange={e=>void run(async()=>{const result=await bridge.ai.local('preview',{value:e.target.value}) as {files:ModelRelease[]};setReleases(result.files);setRelease('');setApproval(false);})} defaultValue=""><option value="">Select…</option>{repositories.map(repo=><option key={repo.id}>{repo.id}</option>)}</select></label>}
          {releases.length>0&&<label>GGUF<select aria-label="GGUF release" value={release} onChange={e=>{setRelease(e.target.value);setApproval(false);}}><option value="">Select…</option>{releases.map(file=><option value={file.id} key={file.id}>{file.preferred?'QAT Q4_0 · ':''}{file.filename} · {(file.bytes/1024**3).toFixed(2)} GiB</option>)}</select></label>}
          {selected&&<div className="ai-model-card"><p>{selected.repository}<br/>{selected.filename}<br/>{ro?'Dimensiune':'Size'}: {(selected.bytes/1024**3).toFixed(2)} GiB + 2 GiB {ro?'spațiu liber':'free reserve'}<br/>{ro?'Licență':'License'}: {selected.license}<br/>Revision: {selected.revision}<br/>SHA256: {selected.sha256}</p><p>{selected.model_card}</p><label className="ai-consent"><input type="checkbox" checked={approval} onChange={e=>setApproval(e.target.checked)}/><span>{ro?'Am verificat licența și aprob această descărcare.':'I reviewed the model license and approve this download.'}</span></label><button className="primary-button" disabled={!approval||busy||local?.download.active} onClick={()=>void run(()=>bridge.ai.local('install',{value:selected.id,approved:approval,licenseAccepted:approval}))}>{ro?'Descarcă modelul selectat':'Download selected model'}</button></div>}
          {local?.download.active&&<><progress value={local.download.bytes} max={local.download.total}/><p>{local.download.message} · {mib(local.download.bytes)} / {mib(local.download.total)}</p><button className="text-button" onClick={()=>void run(()=>bridge.ai.local('cancel_download'))}>{ro?'Anulează descărcarea':'Cancel download'}</button></>}
          {local?.download.path&&<p className="ai-model-path">{local.download.path}</p>}
          {local?.download.error&&<p role="alert">{local.download.error}</p>}
        </details>
      </>:<>
        <label>Local Ollama model<select aria-label="Local Ollama model" value={settings.localModel} onChange={e=>update({localModel:e.target.value})}><option value="">Choose an installed model</option>{Array.from(new Set([...legacyModels,...(settings.localModel?[settings.localModel]:[])])).map(model=><option key={model}>{model}</option>)}</select></label>
        <button className="text-button" onClick={()=>void run(async()=>{const result=await bridge.ai.connection('ollama');setLegacyModels(result.models.map(m=>m.id));if(result.error)setError(result.error);})}>Refresh connection</button>
      </>}
    </fieldset>
    <fieldset className="ai-fieldset"><legend>CLOUD · Gemini</legend>
      <label>{ro?'Furnizor cloud':'Cloud provider'}<select aria-label="Cloud provider" value={settings.cloudProvider} onChange={e=>update({cloudProvider:e.target.value as Settings['cloudProvider']})}><option value="gemini">Google Gemini</option><option value="openai">OpenAI · existing connection</option></select></label>
      <p>{keyConfigured?(ro?'Cheie configurată. Valoarea nu este expusă interfeței.':'A key is configured. Its value is never returned to this interface.'):(ro?'Nicio cheie configurată.':'No API key configured.')}</p>
      <div className="ai-actions"><button className="text-button" disabled={!desktop||busy} onClick={()=>void run(async()=>{await bridge.ai.configureKey(settings.cloudProvider);setKeyConfigured(true);})}>{ro?'Configurează cheia securizat':'Configure key securely'}</button><button className="text-button" disabled={!desktop||busy} onClick={()=>void run(async()=>{await bridge.ai.setKey('',settings.cloudProvider);setKeyConfigured((await bridge.ai.status()).keyStored);})}>{ro?'Șterge cheia salvată':'Remove saved key'}</button><button className="text-button" disabled={!desktop||busy} onClick={()=>void run(async()=>{const result=await bridge.ai.connection(settings.cloudProvider);setConnection(result);if(result.error)setError(result.error);})}>{ro?'Testează conexiunea și modelele':'Test connection and models'}</button></div>
      <p role="status">{connection?.available?(ro?'Conexiune verificată pentru această cheie.':'Connection verified for this key.'):(ro?'Accesul la modele nu este încă verificat.':'Model access is not yet verified.')}</p>
      <label>{ro?'Model de raționament':'Reasoning model'}<select aria-label="Cloud reasoning model" value={settings.cloudProvider==='gemini'?settings.geminiModel:settings.cloudModel} onChange={e=>update(settings.cloudProvider==='gemini'?{geminiModel:e.target.value}:{cloudModel:e.target.value})}>
        <option value={settings.cloudProvider==='gemini'?settings.geminiModel:settings.cloudModel}>{settings.cloudProvider==='gemini'?settings.geminiModel:settings.cloudModel} · {ro?'preferat, verifică accesul':'preferred; verify access'}</option>
        {connection?.models.filter(model=>model.methods.includes('generateContent')).map(model=><option key={model.id} value={model.id}>{model.id} · verified available</option>)}
      </select></label>
      <p className="muted">{ro?'Modelele cerute sunt preferințe; nu sunt activate dacă API-ul nu le confirmă. Nu există substituire silențioasă.':'Requested IDs are preferences. Generation requires API discovery to confirm access; there is no silent model substitution.'}</p>
      <label className="ai-consent"><input type="checkbox" checked={settings.cloudEnabled} onChange={e=>update({cloudEnabled:e.target.checked,...(!e.target.checked?{aiMode:'local',hybridCloudConsent:false}: {})})}/><span>{ro?'Activează procesarea cloud (poate genera costuri API).':'Enable cloud processing (API charges may apply).'}</span></label>
      <label className="ai-consent"><input type="checkbox" checked={settings.hybridCloudConsent} disabled={!settings.cloudEnabled} onChange={e=>update({hybridCloudConsent:e.target.checked,aiMode:e.target.checked?'hybrid':'local'})}/><span>{ro?'Autorizez Hybrid să trimită mesaje neprivate. Modul Local și cererile private rămân locale.':'Authorize Hybrid to send non-private messages. Local mode and private requests always remain local.'}</span></label>
      <label className="ai-consent"><input type="checkbox" checked={settings.shareContext} onChange={e=>update({shareContext:e.target.checked})}/><span>{ro?'Permite partajarea contextului recent numai când o aprob și în cererea curentă.':'Allow recent-context sharing only when I also approve it for the current request.'}</span></label>
      <details><summary>{ro?'Estimare cost raționament — opțional':'Reasoning cost estimate — optional'}</summary><p>{ro?'Introdu prețurile actuale pentru raționament. Zero înseamnă necunoscut. Estimarea exclude vocea și cererile eșuate/întrerupte; nu este un plafon de facturare.':'Enter current reasoning prices. Zero means unknown. Estimates exclude speech and failed/interrupted requests; this is not a provider billing cap.'}</p>{([['inputTokenPrice','Input / 1M tokens'],['outputTokenPrice','Output / 1M tokens'],['spendingWarning','Session spending warning']] as const).map(([key,label])=><label key={key}>{label}<input type="number" min={0} max={1000} step="0.01" value={settings[key]} onChange={e=>update({[key]:Number(e.target.value)})}/></label>)}</details>
    </fieldset>
    {error&&<div className="error-banner" role="alert">{error}</div>}
  </details>;
}
