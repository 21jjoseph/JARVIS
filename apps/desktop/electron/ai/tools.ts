import { app, dialog, shell } from 'electron';
import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { open, realpath, opendir } from 'node:fs/promises';
import { cpus, release, platform } from 'node:os';
import { basename, join, relative, sep } from 'node:path';
import { promisify } from 'node:util';
import type { ToolCall } from '../../../../shared/contracts/ai';
const exec = promisify(execFile);
const maxBytes = 128 * 1024;

export async function readSelectedText(path: string): Promise<string> {
  const canonical = await realpath(path);
  if (
    canonical.split(sep).some((s) => s.startsWith('.')) ||
    /\.(pem|key|p12|pfx|keychain(?:-db)?)$/i.test(canonical)
  )
    throw new Error('Hidden files and credential files cannot be read by this tool.');
  const handle = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes)
      throw new Error('Choose a regular text file smaller than 128 KB.');
    // A fixed-size read remains bounded even if another process grows the file.
    const bytes = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > maxBytes) throw new Error('File grew beyond 128 KB.');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytesRead));
    if (/[\x00-\x08\x0e-\x1f]/.test(text)) throw new Error('Choose a UTF-8 text file.');
    return text || '(Empty text file)';
  } finally {
    await handle.close();
  }
}
async function openPath(path: string) {
  const error = await shell.openPath(path);
  if (error) throw new Error('The operating system could not open this location.');
  return 'Opened the selected location.';
}
export async function executeTool(tool: ToolCall): Promise<string> {
  switch (tool.name) {
    case 'system_info':
      return `${platform()} ${release()} · ${process.arch}\n${cpus()[0]?.model ?? 'Unknown CPU'} · ${cpus().length} logical processors\nElectron ${process.versions.electron} · Node ${process.versions.node}`;
    case 'open_folder': {
      const name = tool.arguments.folder! as 'home' | 'documents' | 'downloads';
      return openPath(app.getPath(name));
    }
    case 'open_app': {
      const id = tool.arguments.app!;
      if (id === 'file_manager') return openPath(app.getPath('home'));
      if (process.platform === 'darwin') {
        await exec('/usr/bin/open', ['-a', id === 'calculator' ? 'Calculator' : 'TextEdit'], {
          timeout: 5000,
          maxBuffer: 4096,
        });
      } else if (process.platform === 'win32') {
        await exec(id === 'calculator' ? 'calc.exe' : 'notepad.exe', [], {
          timeout: 5000,
          maxBuffer: 4096,
        });
      } else
        throw new Error(
          'Opening these apps is supported on macOS and Windows. Use the file manager on Linux.',
        );
      return 'Asked the operating system to open or focus the app.';
    }
    case 'read_text_file': {
      const selected = await dialog.showOpenDialog({
        title: 'JARVIS: choose a text file to display locally',
        properties: ['openFile'],
        filters: [
          {
            name: 'Text files',
            extensions: ['txt', 'md', 'json', 'csv', 'log', 'py', 'ts', 'js', 'html', 'css'],
          },
        ],
      });
      const path = selected.filePaths[0];
      if (selected.canceled || !path) return 'File selection cancelled. Nothing was read.';
      return `${basename(path)}\n\n${await readSelectedText(path)}`;
    }
    case 'find_files': {
      const selected = await dialog.showOpenDialog({
        title: 'JARVIS: choose a folder to search locally',
        properties: ['openDirectory'],
      });
      if (selected.canceled || !selected.filePaths[0]) return 'Folder selection cancelled.';
      const root = await realpath(selected.filePaths[0]);
      const queue = [{ path: root, depth: 0 }];
      const found: string[] = [];
      let scanned = 0;
      const deadline = Date.now() + 5000;
      while (queue.length && found.length < 100 && scanned < 2000 && Date.now() < deadline) {
        const current = queue.shift()!;
        const dir = await opendir(current.path).catch(() => null);
        if (!dir) continue;
        for await (const entry of dir) {
          if (++scanned > 2000 || found.length >= 100 || Date.now() >= deadline) break;
          if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
          const path = join(current.path, entry.name);
          if (
            entry.isFile() &&
            entry.name.toLocaleLowerCase().includes(tool.arguments.query!.toLocaleLowerCase())
          )
            found.push(relative(root, path));
          if (entry.isDirectory() && current.depth < 2 && queue.length < 100)
            queue.push({ path, depth: current.depth + 1 });
        }
      }
      return `${found.join('\n') || 'No matching filenames found.'}\n\nBounded search: at most 2,000 entries, three directory levels, 100 matches and five seconds. Hidden files and symbolic links are excluded.`;
    }
  }
}
