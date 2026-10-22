export type ToolName = 'system_info' | 'open_app' | 'open_folder' | 'read_text_file' | 'find_files';
export interface ToolCall {
  name: ToolName;
  arguments: Record<string, string>;
}
export interface PendingTool extends ToolCall {
  id: string;
  expires: number;
  cloudResultConsentRequired?: boolean;
}
export interface AiReply {
  text: string;
  provider: 'local' | 'cloud' | 'offline' | 'command';
  tool: PendingTool | null;
  error: string | null;
  provider_name?: string | null;
  model?: string | null;
  route_reason?: string;
  continuation?: string | null;
  metrics?: {ttft_ms:number|null;total_ms:number;tokens_per_second?:number|null};
  usage?: {input_tokens:number;output_tokens:number;reasoning_tokens?:number};
  estimated_cost?: number | null;
  session_estimated_cost?: number;
  spend_warning?: boolean;
}
export interface AiDelta {requestId:string;text?:string;provider?:string;model?:string;reason?:string;kind:string}
export interface ConnectionStatus {available:boolean;models:Array<{id:string;methods:string[]}>;error:string|null;provider:string}
export interface LocalModelStatus {
  engine:{running:boolean;loading:boolean;model_path:string;rss_bytes:number|null;cpu_percent:number|null;load_ms:number|null;error:string|null;available_threads:number};
  download:{active:boolean;bytes:number;total:number;message:string;path:string;error:string|null};
  engine_installed:boolean;
}
export type LocalAction='status'|'discover'|'preview'|'choose_model'|'choose_directory'|'install'|'cancel_download'|'start'|'stop';
export interface ModelRelease {id:string;repository:string;revision:string;filename:string;bytes:number;sha256:string;license:string;model_card:string;gated:boolean|string;preferred:boolean}
export interface AiStatus {
  ready: boolean;
  message: string;
  models: string[];
  keyStored: boolean;
  local?:LocalModelStatus;
}
export interface AiBridge {
  status(): Promise<AiStatus>;
  lastReply(): Promise<AiReply | null>;
  ask(input: { text: string; route: 'local' | 'cloud' | 'auto'; cloudConsent: boolean; private?:boolean;shareContext?:boolean;complexity?:'auto'|'simple'|'complex' }): Promise<AiReply>;
  cancel(): Promise<void>;
  resolve(id: string, approve: boolean,shareResult?:boolean): Promise<string>;
  setKey(key: string,provider?:'gemini'|'openai'): Promise<void>;
  configureKey(provider:'gemini'|'openai'):Promise<void>;
  connection(provider:'gemini'|'openai'|'llama'|'ollama'):Promise<ConnectionStatus>;
  local(action:LocalAction,options?:{value?:string;approved?:boolean;licenseAccepted?:boolean}):Promise<unknown>;
  onDelta(callback:(delta:AiDelta)=>void):()=>void;
  onReply(callback: (reply: AiReply) => void): () => void;
}
/** Independent validation at the privileged boundary, even after Pydantic validation. */
export function validateTool(input: unknown): ToolCall {
  if (!input || typeof input !== 'object') throw new Error('Invalid tool request.');
  const { name, arguments: args } = input as { name?: unknown; arguments?: unknown };
  if (!args || typeof args !== 'object' || Array.isArray(args))
    throw new Error('Invalid tool arguments.');
  const record = args as Record<string, unknown>;
  const keys = Object.keys(record);
  const empty = keys.length === 0;
  const one = (key: string) => keys.length === 1 && keys[0] === key;
  if ((name === 'system_info' || name === 'read_text_file') && empty)
    return { name, arguments: {} };
  if (
    name === 'open_app' &&
    one('app') &&
    typeof record.app === 'string' &&
    ['calculator', 'text_editor', 'file_manager','coppeliasim'].includes(String(record.app))
  )
    return { name, arguments: { app: String(record.app) } };
  if (
    name === 'open_folder' &&
    one('folder') &&
    typeof record.folder === 'string' &&
    ['home', 'documents', 'downloads'].includes(String(record.folder))
  )
    return { name, arguments: { folder: String(record.folder) } };
  if (
    name === 'find_files' &&
    one('query') &&
    typeof record.query === 'string' &&
    record.query.length <= 100 &&
    /^[^/\\\x00-\x1f]+$/.test(record.query)
  )
    return { name, arguments: { query: record.query } };
  throw new Error('Unsupported tool or arguments. Nothing was executed.');
}
