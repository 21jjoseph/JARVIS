export type ToolName = 'system_info' | 'open_app' | 'open_folder' | 'read_text_file' | 'find_files';
export interface ToolCall {
  name: ToolName;
  arguments: Record<string, string>;
}
export interface PendingTool extends ToolCall {
  id: string;
  expires: number;
}
export interface AiReply {
  text: string;
  provider: 'local' | 'cloud' | 'offline' | 'command';
  tool: PendingTool | null;
  error: string | null;
}
export interface AiStatus {
  ready: boolean;
  message: string;
  models: string[];
  keyStored: boolean;
}
export interface AiBridge {
  status(): Promise<AiStatus>;
  lastReply(): Promise<AiReply | null>;
  ask(input: { text: string; route: 'local' | 'cloud'; cloudConsent: boolean }): Promise<AiReply>;
  cancel(): Promise<void>;
  resolve(id: string, approve: boolean): Promise<string>;
  setKey(key: string): Promise<void>;
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
    ['calculator', 'text_editor', 'file_manager'].includes(String(record.app))
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
