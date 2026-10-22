import { safeStorage } from 'electron';
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Settings } from '../../../../shared/contracts';
import type { AiReply, AiStatus } from '../../../../shared/contracts/ai';
import { interpretCommand } from '../voice/commands';
import { Backend } from './backend';
import { Permissions } from './permissions';
import { desktopCommand } from './commands';
import { executeTool } from './tools';

interface Hooks {
  backend: Backend;
  data: string;
  settings(): Settings;
  changed(owner: number, reply: AiReply): void;
  phase(state: 'THINKING' | 'IDLE' | 'WARNING' | 'EXECUTING' | 'OFFLINE'): void;
  dashboard(): number;
}
export class AiController {
  private permissions = new Permissions();
  private abort: AbortController | null = null;
  private owner: number | null = null;
  private executing = false;
  private replies = new Map<number, AiReply>();
  get active() {
    return this.abort !== null || this.executing;
  }
  forget(owner: number) {
    this.replies.delete(owner);
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
  private get keyPath() {
    return join(this.hooks.data, 'cloud-key.bin');
  }
  private async key() {
    if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
    try {
      return safeStorage.decryptString(await readFile(this.keyPath));
    } catch {
      return '';
    }
  }
  async setKey(key: unknown) {
    if (typeof key !== 'string' || key.length > 512 || (key && !/^[\x21-\x7e]+$/.test(key)))
      throw new Error('Invalid API key.');
    if (!key) {
      await rm(this.keyPath, { force: true });
      return;
    }
    if (
      !safeStorage.isEncryptionAvailable() ||
      (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')
    )
      throw new Error(
        'Secure OS credential storage is unavailable. Use OPENAI_API_KEY in the application environment instead.',
      );
    await mkdir(this.hooks.data, { recursive: true });
    await writeFile(this.keyPath, safeStorage.encryptString(key), { mode: 0o600 });
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
      const result = (await this.hooks.backend.request('/v1/models')) as {
        models: string[];
        error: string | null;
      };
      return { ...base, models: result.models, message: result.error || 'Ollama is connected.' };
    } catch {
      return { ...base, message: 'Could not check local models. Restart JARVIS.' };
    }
  }
  async ask(
    owner: number,
    input: unknown,
    signal?: AbortSignal,
    fromVoice = false,
  ): Promise<AiReply> {
    if (!input || typeof input !== 'object') throw new Error('Invalid AI request.');
    const { text, route, cloudConsent } = input as Record<string, unknown>;
    if (
      typeof text !== 'string' ||
      !text.trim() ||
      text.length > 4000 ||
      (route !== 'local' && route !== 'cloud') ||
      typeof cloudConsent !== 'boolean'
    )
      throw new Error('Invalid AI request.');
    if (route === 'cloud' && !cloudConsent)
      throw new Error('Confirm cloud sending for this request.');
    if (this.abort || this.executing) throw new Error('Stop the current AI request first.');
    this.permissions.cancel();
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
        const result = (await this.hooks.backend.request(
          '/v1/turn',
          {
            version: 1,
            text: text.trim(),
            language,
            route,
            cloud_consent: cloudConsent,
            local_model: settings.localModel,
            cloud_model: settings.cloudModel,
          },
          combined,
          route === 'cloud' ? await this.key() : '',
        )) as Omit<AiReply, 'tool'> & { tool: unknown };
        combined.throwIfAborted();
        if (
          typeof result.text !== 'string' ||
          result.text.length > 2000 ||
          !['local', 'cloud', 'offline'].includes(result.provider)
        )
          throw new Error('Invalid AI service reply.');
        const target = result.tool && fromVoice ? this.hooks.dashboard() : owner;
        const tool = result.tool ? this.permissions.propose(target, result.tool) : null;
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
  async resolve(owner: number, id: unknown, approve: unknown) {
    if (typeof id !== 'string' || typeof approve !== 'boolean')
      throw new Error('Invalid approval.');
    if (this.executing) throw new Error('Another desktop action is running.');
    const tool = this.permissions.consume(owner, id);
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
