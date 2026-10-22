import type { ToolCall } from '../../../../shared/contracts/ai';
/** Small explicit offline commands; model text is never parsed as shell code. */
export function desktopCommand(text: string): ToolCall | null {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[?.!]+$/, '')
    .trim();
  if (
    /^(show system info(?:rmation)?|system info|arata informatii despre sistem)$/.test(normalized)
  )
    return { name: 'system_info', arguments: {} };
  if (/^(read (?:a |one )?(?:text )?file|citeste un fisier)$/.test(normalized))
    return { name: 'read_text_file', arguments: {} };
  if (
    /^(open|deschide) (?:the )?(calculator|text editor|textedit|file manager|finder)$/.test(
      normalized,
    )
  ) {
    const app = normalized.includes('calculator')
      ? 'calculator'
      : /finder|file manager/.test(normalized)
        ? 'file_manager'
        : 'text_editor';
    return { name: 'open_app', arguments: { app } };
  }
  const folder = /^(?:open|deschide) (?:the )?(home|documents|downloads)$/.exec(normalized)?.[1];
  if (folder) return { name: 'open_folder', arguments: { folder } };
  const query = /^(?:find files named|cauta fisiere numite) (.{1,100})$/.exec(normalized)?.[1];
  return query ? { name: 'find_files', arguments: { query } } : null;
}
