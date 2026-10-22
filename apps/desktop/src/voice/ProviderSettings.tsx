import { useState } from 'react';
import type { Settings } from '../../../../shared/contracts';
import type { VoiceStatus } from '../../../../shared/contracts/voice';
import type { ConnectionStatus } from '../../../../shared/contracts/ai';
import type { VoiceSession } from './session';
import { bridge } from '../services/bridge';
import { wordErrorRate } from '../../../../shared/contracts/identity';

const PHRASES=[
  'Yo Twenty One, deschide CoppeliaSim.',
  'Twenty One, verifică Elegoo Centauri Carbon.',
  'Hey Twenty One, open the NEMA seventeen project.',
  'Twenty One, ce părere ai despre reductorul cicloidal?',
];
export function ProviderSettings({settings,status,voice,run}:{settings:Settings;status:VoiceStatus;voice:VoiceSession;run:(fn:()=>Promise<unknown>)=>Promise<void>}) {
  const ro=settings.locale==='ro';
  const [catalog,setCatalog]=useState<ConnectionStatus|null>(null);
  const [vocabulary,setVocabulary]=useState(settings.technicalVocabulary.join('\n'));
  const [phrase,setPhrase]=useState<string>(PHRASES[0]!);
  const [corrected,setCorrected]=useState('');
  const [upload,setUpload]=useState(false);
  const [error,setError]=useState('');
  const active=status.phase!=='OFF'&&status.phase!=='ERROR';
  const update=(patch:Partial<Settings>)=>{void run(()=>bridge.updateSettings(patch));};
  const raw=status.heardRaw??status.heard;
  const score=raw?wordErrorRate(phrase,raw):null;
  const correctedScore=raw&&corrected.trim()?wordErrorRate(corrected,raw):null;
  return <details className="ai-settings voice-provider-settings">
    <summary>{ro?'Furnizori voce & calibrare':'Speech providers & calibration'}</summary>
    <p>{ro?'Identitate: 21. Nume rostit: Twenty One. Activări: Yo Twenty One, Hey Twenty One, Twenty One. Setarea veche de activare este păstrată.':'Identity: 21. Spoken name: Twenty One. Wake phrases: Yo Twenty One, Hey Twenty One, Twenty One. Your legacy wake setting is retained.'}</p>
    <label>{ro?'Recunoaștere vocală':'Speech recognition'}<select aria-label="Speech recognition provider" value={settings.sttProvider} disabled={active} onChange={e=>update({sttProvider:e.target.value as Settings['sttProvider']})}><option value="local">Local Whisper · offline</option><option value="gemini">Gemini Live · opt-in cloud audio</option></select></label>
    <button className="text-button" onClick={()=>{setError('');void bridge.ai.connection('gemini').then(setCatalog).catch(e=>setError(String(e)));}}>{ro?'Verifică modelele Gemini pentru voce':'Discover Gemini speech models'}</button>
    <label>Gemini STT model<select aria-label="Gemini STT model" value={settings.geminiSttModel} disabled={active} onChange={e=>update({geminiSttModel:e.target.value})}><option>{settings.geminiSttModel}</option>{catalog?.models.filter(m=>m.methods.some(method=>method.toLowerCase().includes('bidi'))).map(m=><option key={m.id}>{m.id}</option>)}</select></label>
    <label>Gemini TTS model<select aria-label="Gemini TTS model" value={settings.geminiTtsModel} disabled={active} onChange={e=>update({geminiTtsModel:e.target.value})}><option>{settings.geminiTtsModel}</option>{catalog?.models.filter(m=>m.methods.includes('generateContent')&&m.id.toLowerCase().includes('tts')).map(m=><option key={m.id}>{m.id}</option>)}</select></label>
    <p className="muted">{catalog?.error||(catalog?.available?(ro?'Acces verificat. Alege explicit un model disponibil; cele preferate pot lipsi.':'Access verified. Explicitly choose an available model; requested preferences may be absent.'):(ro?'Modelele preferate nu sunt încă verificate pentru această cheie.':'Preferred models have not yet been verified for this key.'))}</p>
    <label>Gemini voice<input aria-label="Gemini voice" value={settings.geminiVoice} disabled={active} onChange={e=>update({geminiVoice:e.target.value})}/></label>
    <label>{ro?'Volum':'Volume'} {Math.round(settings.speechVolume*100)}%<input aria-label="Speech volume" type="range" min={0} max={1} step={0.05} value={settings.speechVolume} disabled={active} onChange={e=>update({speechVolume:Number(e.target.value)})}/></label>
    <label className="ai-consent"><input type="checkbox" checked={settings.cloudAudioConsent} disabled={active} onChange={e=>update({cloudAudioConsent:e.target.checked})}/><span>{ro?'Permit audio de microfon și textul răspunsului la Gemini pentru furnizorii de voce selectați. Necesită cloud activat și modul Hybrid/Cloud.':'Allow microphone audio and response text to Gemini for selected speech providers. Requires cloud enabled and Hybrid/Cloud mode.'}</span></label>
    <label className="ai-consent"><input type="checkbox" checked={settings.voiceCloudTextConsent} disabled={active} onChange={e=>update({voiceCloudTextConsent:e.target.checked})}/><span>{ro?'Permit transcrierilor vocale să folosească raționamentul cloud autorizat. Altfel raționamentul vocal este local.':'Allow transcripts to use authorized cloud reasoning. Otherwise voice reasoning remains local.'}</span></label>
    <label>{ro?'Vocabular tehnic — un termen pe rând':'Technical vocabulary — one phrase per line'}<textarea aria-label="Technical vocabulary" rows={5} maxLength={6500} value={vocabulary} onChange={e=>setVocabulary(e.target.value)}/></label>
    <button className="text-button" disabled={active} onClick={()=>update({technicalVocabulary:vocabulary.split('\n').map(s=>s.trim()).filter(Boolean)})}>{ro?'Salvează vocabularul':'Save vocabulary'}</button>
    <p className="muted">{ro?'Sunt indicii pentru Gemini, nu reantrenare. Whisper local nu acceptă aceste indicii în integrarea curentă.':'These are Gemini hints, not retraining. Local Whisper does not accept these hints in the current integration.'}</p>
    <details><summary>{ro?'Calibrare opțională':'Optional voice calibration'}</summary>
      <label>{ro?'Fraza de test':'Test phrase'}<select value={phrase} onChange={e=>setPhrase(e.target.value)}>{PHRASES.map(text=><option key={text}>{text}</option>)}</select></label>
      <p>{ro?'Rostește natural, cu accentul tău. Captura este în memorie; nu se creează înregistrări pe disc.':'Speak naturally with your own accent. Capture stays in memory; no recording file is created.'}</p>
      <div className="ai-actions"><button className="primary-button" disabled={active||!status.modelsReady} onClick={()=>void run(()=>voice.start('calibration',settings))}>{ro?'Testează local':'Test locally'}</button><button className="text-button" disabled={!active} onClick={()=>void run(()=>voice.stop())}>{ro?'Oprește':'Stop'}</button></div>
      <label className="ai-consent"><input type="checkbox" checked={upload} onChange={e=>setUpload(e.target.checked)}/><span>{ro?'Aprob încărcarea următorului eșantion de calibrare la Gemini.':'Approve uploading the next calibration sample to Gemini.'}</span></label>
      <button className="text-button" disabled={active||!upload||!settings.cloudAudioConsent||!settings.cloudEnabled||settings.aiMode==='local'} onClick={()=>{setUpload(false);void run(()=>voice.start('calibration-cloud',settings));}}>{ro?'Testează acest eșantion în cloud':'Test this sample in cloud'}</button>
      <label>{ro?'Rezultat original':'Raw recognized result'}<textarea aria-label="Raw calibration transcript" value={raw} readOnly rows={2}/></label>
      <label>{ro?'Corecție manuală':'Manual correction'}<textarea aria-label="Corrected calibration transcript" value={corrected} onChange={e=>setCorrected(e.target.value)} rows={2}/></label>
      <p>{ro?'Erori față de fraza selectată':'Errors against selected phrase'}: {score?`${score.errors} / ${score.words} · WER ${(score.rate*100).toFixed(1)}%`:'—'}</p>
      <p>{correctedScore?`WER (${ro?'corecția ta':'your correction'}): ${(correctedScore.rate*100).toFixed(1)}% · ${correctedScore.errors} / ${correctedScore.words}`:''}</p>
      <p className="muted">{ro?'Corecția este doar pentru comparație și nu înlocuiește rezultatul original. Nu reantrenează modelul.':'Correction is for comparison and retains the original result. It does not retrain the model.'}</p>
    </details>
    <p className="muted">STT: {status.recognitionProvider||'local-whisper'} · TTS: {status.outputProvider||settings.ttsProvider}<br/>Wake processing: {status.metrics?.wake_processing_ms?.toFixed(0)??'—'} ms · STT finalization: {status.metrics?.stt_ms?.toFixed(0)??'—'} ms · TTS ready: {status.metrics?.tts_ready_ms?.toFixed(0)??'—'} ms · Turn: {status.metrics?.turn_ms?.toFixed(0)??'—'} ms</p>
    {error&&<p role="alert">{error}</p>}
  </details>;
}
