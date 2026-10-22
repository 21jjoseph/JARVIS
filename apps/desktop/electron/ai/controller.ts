import { randomUUID } from 'node:crypto';
import { dialog, safeStorage } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Settings } from '../../../../shared/contracts';
import type { AiReply, AiStatus, AiDelta, LocalAction, LocalModelStatus, ConnectionStatus } from '../../../../shared/contracts/ai';
import { interpretCommand } from '../voice/commands';
import { Backend } from './backend';
import { Permissions } from './permissions';
import { desktopCommand } from './commands';
import { decodeCloudAudio } from '../voice/cloud';
import { executeTool } from './tools';

interface Hooks {
  backend: Backend;
  data: string;
  settings(): Settings;
  changed(owner: number, reply: AiReply): void;
  phase(state: 'THINKING' | 'IDLE' | 'WARNING' | 'EXECUTING' | 'OFFLINE'): void;
  dashboard(): number;
  saveSettings(patch:Partial<Settings>):Promise<unknown>;
  delta(owner:number,event:AiDelta):void;
}
export class AiController {
  private permissions = new Permissions();
  private abort: AbortController | null = null;
  private owner: number | null = null;
  private executing = false;
  private replies = new Map<number, AiReply>();
  private sessions=new Map<number,string>();
  private continuations=new Map<string,{nonce:string;cloud:boolean;credentialRevision:number}>();
  private credentialRevision=0;
  get active() {
    return this.abort !== null || this.executing;
  }
  forget(owner: number) {
    this.replies.delete(owner);
    this.sessions.delete(owner);
    this.permissions.cancel(owner);
  }
  lastReply(owner: number) {
    return this.replies.get(owner) ?? null;
  }
  private emit(owner: number, reply: AiReply) {
    this.replies.set(owner, reply);
    this.hooks.changed(owner, reply);
  }
  constructor(private hooks: Hooks) {}
  private keyPath(provider:'gemini'|'openai') {return join(this.hooks.data,provider==='gemini'?'gemini-key.bin':'cloud-key.bin');}
  private async key(provider=this.hooks.settings().cloudProvider) {
    const fromEnv=provider==='gemini'?(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY):process.env.OPENAI_API_KEY;
    if(fromEnv) {
      if(!/^[\x21-\x7e]{1,512}$/.test(fromEnv.trim())) throw new Error('Configured API key has an invalid format.');
      return fromEnv.trim();
    }
    try {return safeStorage.decryptString(await readFile(this.keyPath(provider)));}catch{return '';}
  }
  async setKey(key:unknown,provider:unknown=this.hooks.settings().cloudProvider) {
    if(provider!=='gemini'&&provider!=='openai') throw new Error('Unsupported credential provider.');
    if(typeof key!=='string'||key.length>512||(key&&!/^[\x21-\x7e]+$/.test(key))) throw new Error('Invalid API key.');
    if(!key) {this.credentialRevision++;await this.cancel();this.continuations.clear();await rm(this.keyPath(provider),{force:true});return;}
    if(!safeStorage.isEncryptionAvailable() || (process.platform==='linux'&&safeStorage.getSelectedStorageBackend()==='basic_text')) throw new Error('Secure OS credential storage is unavailable. Use the provider API key environment binding.');
    this.credentialRevision++;await this.cancel();this.continuations.clear();
    await mkdir(this.hooks.data,{recursive:true});
    await writeFile(this.keyPath(provider),safeStorage.encryptString(key),{mode:0o600});
  }
  async configureKey(provider:unknown) {
    if(provider!=='gemini'&&provider!=='openai')throw new Error('Invalid credential provider.');
    if(process.platform!=='darwin')throw new Error('Native secure key entry is available on macOS. Configure the provider environment binding on this platform.');
    const label=provider==='gemini'?'Gemini':'OpenAI';
    let key='';
    try {
      const result=await promisify(execFile)('/usr/bin/osascript',['-e',`text returned of (display dialog "21: enter your ${label} API key" default answer "" with hidden answer buttons {"Cancel", "Save securely"} default button "Save securely")`],{timeout:120_000,maxBuffer:4096});
      key=result.stdout.trim();
    }catch {throw new Error('Secure key entry was cancelled or unavailable.');}
    await this.setKey(key,provider);
  }
  async cloudCapture(partial:(text:string)=>void,signal:AbortSignal) {
    const settings=this.hooks.settings();
    return this.hooks.backend.speech({model:settings.geminiSttModel,vocabulary:settings.technicalVocabulary,
      consent:settings.cloudAudioConsent,cloud_enabled:settings.cloudEnabled,local_only:settings.aiMode==='local',key:await this.key('gemini')},partial,signal);
  }
  async cloudSpeech(text:string,signal:AbortSignal) {
    const settings=this.hooks.settings();
    const response=await this.hooks.backend.request('/v2/speech',{model:settings.geminiTtsModel,text,voice:settings.geminiVoice,
      consent:settings.cloudAudioConsent,cloud_enabled:settings.cloudEnabled,local_only:settings.aiMode==='local'},signal,await this.key('gemini'));
    return decodeCloudAudio(response);
  }
  async connection(provider:unknown):Promise<ConnectionStatus> {
    if(!['gemini','openai','llama','ollama'].includes(String(provider))||typeof provider!=='string') throw new Error('Invalid provider.');
    return await this.hooks.backend.request('/v2/connection',{provider,endpoint:this.hooks.settings().localEndpoint},undefined,
      provider==='gemini'||provider==='openai'?await this.key(provider):'') as ConnectionStatus;
  }
  async local(action:unknown,options:unknown={}) {
    const actions:LocalAction[]=['status','discover','preview','choose_model','choose_directory','install','cancel_download','start','stop'];
    if(typeof action!=='string'||!actions.includes(action as LocalAction)) throw new Error('Invalid local model action.');
    if(!options || typeof options!=='object'||Array.isArray(options)) throw new Error('Invalid model settings.');
    const input=options as {value?:unknown;approved?:unknown;licenseAccepted?:unknown};
    if(input.value!==undefined&&(typeof input.value!=='string'||input.value.length>150)) throw new Error('Invalid release selection.');
    if(action==='choose_model'||action==='choose_directory') {
      const selected=await dialog.showOpenDialog({title:action==='choose_model'?'21: choose a Gemma 4 GGUF':'21: choose a model directory',
        properties:action==='choose_model'?['openFile']:['openDirectory','createDirectory'],
        ...(action==='choose_model'?{filters:[{name:'GGUF model',extensions:['gguf']}]}:{})});
      const path=selected.filePaths[0];if(selected.canceled||!path)return null;
      if(action==='choose_directory'){await this.hooks.saveSettings({modelDirectory:path});return {path};}
      const verified=await this.hooks.backend.request('/v2/local',{action:'import',value:path},AbortSignal.timeout(185_000)) as {path:string};
      await this.hooks.saveSettings({modelPath:verified.path});return verified;
    }
    if(action==='stop')await this.cancel();
    const settings=this.hooks.settings();
    let path=settings.modelPath;
    if(action==='start'&&!path){
      const status=await this.hooks.backend.request('/v2/local',{action:'status'}) as LocalModelStatus;
      if(!status.download.active&&!status.download.error) path=status.download.path;
      if(path)await this.hooks.saveSettings({modelPath:path});
    }
    return this.hooks.backend.request('/v2/local',{
      action,value:action==='start'?path:(input.value||''),directory:settings.modelDirectory||join(this.hooks.data,'models'),
      endpoint:settings.localEndpoint,threads:settings.inferenceThreads,idle_seconds:settings.modelIdleSeconds,
      approved:input.approved===true,license_accepted:input.licenseAccepted===true,
    },AbortSignal.timeout(185_000));
  }
  async status(): Promise<AiStatus> {
    const base = {
      ready: this.hooks.backend.ready,
      message: this.hooks.backend.message,
      models: [] as string[],
      keyStored: !!(await this.key()),
    };
    if (!base.ready) return base;
    try {
      const result=await this.connection(this.hooks.settings().localBackend);
      const local=await this.local('status') as LocalModelStatus;
      return {...base,local,models:result.models.map(m=>m.id),message:result.error||'Local provider is connected.'};
    }catch{return {...base,message:'Could not check the local provider. Review AI Intelligence settings.'};}
  }

  async ask(
    owner: number,
    input: unknown,
    signal?: AbortSignal,
    fromVoice = false,
  ): Promise<AiReply> {
    if (!input || typeof input !== 'object') throw new Error('Invalid AI request.');
    const { text, route, cloudConsent,private:privateRequest,shareContext,complexity } = input as Record<string, unknown>;
    if (
      typeof text !== 'string' ||
      !text.trim() ||
      text.length > 4000 ||
      (route !== 'local' && route !== 'cloud' && route !== 'auto') ||
      typeof cloudConsent !== 'boolean'
    )
      throw new Error('Invalid AI request.');
    if (route === 'cloud' && !cloudConsent)
      throw new Error('Confirm cloud sending for this request.');
    if (this.abort || this.executing) throw new Error('Stop the current AI request first.');
    this.permissions.cancel();
    this.continuations.clear();
    const controller = new AbortController();
    this.abort = controller;
    this.owner = owner;
    const cancel = () => {
      controller.abort();
      void this.hooks.backend.request('/v1/cancel', {}).catch(() => {});
    };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    const combined = controller.signal;
    let reply: AiReply;
    try {
      combined.throwIfAborted();
      this.hooks.phase('THINKING');
      const language = this.hooks.settings().voiceLanguage;
      const command = interpretCommand(text, language);
      const desktop = desktopCommand(text);
      if (desktop) {
        const target = fromVoice ? this.hooks.dashboard() : owner;
        const tool = this.permissions.propose(target, desktop);
        reply = {
          text:
            language === 'ro'
              ? 'Verifică și aprobă acțiunea în panoul de conversație.'
              : 'Review and approve the action in the conversation panel.',
          provider: 'command',
          tool,
          error: null,
        };
        if (target !== owner) this.emit(target, reply);
        if (fromVoice && signal) signal.removeEventListener('abort', cancel);
      } else if (command.handled) {
        if (command.action === 'dashboard') this.hooks.dashboard();
        reply = {
          text: command.text || (language === 'ro' ? 'Oprit.' : 'Stopped.'),
          provider: 'command',
          tool: null,
          error: null,
        };
      } else {
        const settings = this.hooks.settings();
        const session=this.sessions.get(owner)||randomUUID();this.sessions.set(owner,session);
        const requestId=randomUUID();
        const authorized=cloudConsent || (settings.aiMode==='hybrid'&&settings.hybridCloudConsent);
        const result = await this.hooks.backend.stream({
          version:1,text:text.trim(),language,route,cloud_consent:authorized,
          local_model:settings.localBackend==='llama'?'gemma-4-local':settings.localModel,cloud_model:settings.cloudProvider==='gemini'?settings.geminiModel:settings.cloudModel,
          local_backend:settings.localBackend,local_endpoint:settings.localEndpoint,cloud_provider:settings.cloudProvider,
          mode:settings.aiMode,cloud_enabled:settings.cloudEnabled,private:privateRequest===true,
          share_context:shareContext===true&&settings.shareContext,session_id:session,personality:settings.personality,
          complexity:complexity==='complex'||complexity==='simple'?complexity:'auto',
          input_price:settings.inputTokenPrice,output_price:settings.outputTokenPrice,warning_budget:settings.spendingWarning,
        },combined,authorized&&settings.cloudEnabled&&settings.aiMode!=='local'&&privateRequest!==true&&route!=='local'?await this.key():'',event=>{
          if(!combined.aborted)this.hooks.delta(owner,{...event,kind:String(event.kind),requestId} as AiDelta);
        }) as Omit<AiReply,'tool'> & {tool:unknown};
        combined.throwIfAborted();
        if (
          typeof result.text !== 'string' ||
          result.text.length > 4000 ||
          !['local', 'cloud', 'offline'].includes(result.provider)
        )
          throw new Error('Invalid AI service reply.');
        const target = result.tool && fromVoice ? this.hooks.dashboard() : owner;
        const tool = result.tool ? this.permissions.propose(target, result.tool) : null;
        if(tool&&result.continuation) {
          this.continuations.set(tool.id,{nonce:result.continuation,cloud:result.provider==='cloud',credentialRevision:this.credentialRevision});
          tool.cloudResultConsentRequired=result.provider==='cloud';
        }
        reply = { ...result, tool };
        if (tool)
          reply.text =
            language === 'ro'
              ? 'Verifică și aprobă acțiunea în panoul de conversație.'
              : 'Review and approve the action in the conversation panel.';
        if (target !== owner) this.emit(target, reply);
      }
      combined.throwIfAborted();
      this.hooks.phase(reply.tool ? 'WARNING' : reply.provider === 'offline' ? 'OFFLINE' : 'IDLE');
    } catch (error) {
      if (combined.aborted) throw new Error('AI request cancelled.');
      reply = {
        text: '',
        provider: 'offline',
        tool: null,
        error: error instanceof Error ? error.message : 'AI unavailable.',
      };
      this.hooks.phase('OFFLINE');
    } finally {
      signal?.removeEventListener('abort', cancel);
      if (this.abort === controller) {
        this.abort = null;
        this.owner = null;
      }
    }
    this.emit(owner, reply);
    return reply;
  }
  async cancel(owner?: number) {
    const revoked = this.permissions.cancel(owner);
    for (const [id, reply] of this.replies)
      if ((owner === undefined || id === owner) && reply.tool)
        this.replies.set(id, { ...reply, tool: null });
    const activeOwner = owner === undefined || owner === this.owner;
    if (this.abort && (owner === undefined || owner === this.owner)) {
      this.abort.abort();
      await this.hooks.backend.request('/v1/cancel', {}).catch(() => {});
    }
    if (revoked || activeOwner) this.hooks.phase('IDLE');
  }
  async resolve(owner: number, id: unknown, approve: unknown,shareResult:unknown=false) {
    if (typeof id !== 'string' || typeof approve !== 'boolean')
      throw new Error('Invalid approval.');
    if (this.executing) throw new Error('Another desktop action is running.');
    if(typeof shareResult!=='boolean') throw new Error('Invalid result-sharing choice.');
    const tool = this.permissions.consume(owner, id);
    const continuation=this.continuations.get(id);this.continuations.delete(id);
    const previous = this.replies.get(owner);
    if (previous?.tool?.id === id) this.replies.set(owner, { ...previous, tool: null });
    if (!approve) {
      await this.audit(tool.name, 'denied');
      this.hooks.phase('IDLE');
      return 'Action denied. Nothing was executed.';
    }
    this.executing = true;
    this.hooks.phase('EXECUTING');
    try {
      // Audit availability is checked BEFORE execution. No prompts, paths or results are logged.
      await this.audit(tool.name, 'approved');
      const text = await executeTool(tool);
      await this.audit(tool.name, 'completed');
      const settings=this.hooks.settings();
      if(continuation&&(!continuation.cloud||(shareResult===true&&settings.cloudEnabled&&settings.aiMode!=='local'&&continuation.credentialRevision===this.credentialRevision))) {
        const controller=new AbortController();this.abort=controller;this.owner=owner;
        try {
          const response=await this.hooks.backend.request('/v2/tools/continue',{continuation:continuation.nonce,text:text.slice(0,8000),cloud_consent:shareResult===true},controller.signal) as AiReply;
          controller.signal.throwIfAborted();this.emit(owner,response);
        }catch {/* Actual tool result remains visible when its follow-up is cancelled or fails. */}
        finally {this.abort=null;this.owner=null;}
      }
      return text;
    } catch (error) {
      await this.audit(tool.name, 'failed').catch(() => {});
      throw error;
    } finally {
      this.executing = false;
      this.hooks.phase('IDLE');
    }
  }
  private async audit(tool: string, outcome: string) {
    await mkdir(this.hooks.data, { recursive: true });
    await appendFile(
      join(this.hooks.data, 'tool-audit.jsonl'),
      JSON.stringify({ at: new Date().toISOString(), tool, outcome }) + '\n',
      { mode: 0o600 },
    );
  }
}
