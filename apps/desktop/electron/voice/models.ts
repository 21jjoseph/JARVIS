import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  mkdir,
  readFile,
  writeFile,
  open,
  rename,
  mkdtemp,
  rm,
  lstat,
  access,
} from 'node:fs/promises';
import { join, basename, isAbsolute } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import manifest from '../../../../configs/voice-models.json';
const execute = promisify(execFile);
export const MODEL_MANIFEST = manifest;
export const MODEL_DOWNLOAD_MB = Math.ceil(
  manifest.models.reduce((sum, m) => sum + m.downloadBytes, 0) / 1_000_000,
);
export async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export async function modelsReady(root: string): Promise<boolean> {
  try {
    for (const model of manifest.models) {
      const stamp = JSON.parse(
        await readFile(join(root, `.verified-${model.id}.json`), 'utf8'),
      ) as { sha256?: string };
      if (stamp.sha256 !== model.archiveSha256) return false;
      for (const file of Object.keys(model.files)) await access(join(root, model.directory, file));
    }
    return true;
  } catch {
    return false;
  }
}
export async function verifyModels(root: string, only?: string): Promise<boolean> {
  try {
    for (const model of manifest.models.filter((m) => !only || m.id === only)) {
      for (const [name, info] of Object.entries(model.files)) {
        const path = join(root, model.directory, name);
        const stat = await lstat(path);
        if (!stat.isFile() || stat.size !== info.bytes || (await sha256(path)) !== info.sha256)
          return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}
export function validateArchiveEntries(entries: string[], directory: string) {
  if (
    !entries.length ||
    entries.some(
      (name) =>
        isAbsolute(name) ||
        name.includes('\\') ||
        name.split('/').includes('..') ||
        name.split('/')[0] !== directory,
    )
  )
    throw new Error('Unsafe model archive paths.');
}
/** Downloads model data only, after a user action. No audio or transcript is sent. */
export async function installModels(
  root: string,
  progress: (percent: number, message: string) => void,
  download: typeof fetch = fetch,
) {
  await mkdir(root, { recursive: true });
  for (const [index, model] of manifest.models.entries()) {
    progress(index * 25, `Verifying ${model.id}`);
    if (!(await verifyModels(root, model.id))) {
      const archive = join(root, basename(new URL(model.url).pathname));
      const temporary = archive + '.download';
      const response = await download(model.url, { signal: AbortSignal.timeout(15 * 60 * 1000) });
      if (!response.ok || !response.body)
        throw new Error(
          `Model download failed (HTTP ${response.status}). Retry the model download.`,
        );
      const file = await open(temporary, 'w', 0o600);
      const reader = response.body.getReader();
      const hash = createHash('sha256');
      let bytes = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > model.downloadBytes)
            throw new Error('Model archive exceeds its pinned size.');
          hash.update(value);
          await file.writeFile(value);
          progress((index + bytes / model.downloadBytes) * 25, `Downloading ${model.id}`);
        }
      } finally {
        await file.close();
        reader.releaseLock();
      }
      if (bytes !== model.downloadBytes || hash.digest('hex') !== model.archiveSha256)
        throw new Error(
          'Model archive checksum mismatch. The download was not used. Retry the download.',
        );
      await rename(temporary, archive);
      const staging = await mkdtemp(join(root, '.extract-'));
      try {
        const { stdout } = await execute('tar', ['-tjf', archive], { maxBuffer: 2 * 1024 * 1024 });
        validateArchiveEntries(stdout.trim().split('\n'), model.directory);
        await execute('tar', ['-xjf', archive, '-C', staging], { maxBuffer: 2 * 1024 * 1024 });
        if (!(await verifyModels(staging, model.id)))
          throw new Error('Extracted model files failed integrity verification.');
        // Only this installer-owned, verified model directory may be replaced.
        await rm(join(root, model.directory), { recursive: true, force: true });
        await rename(join(staging, model.directory), join(root, model.directory));
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
      await rm(archive);
    }
    await writeFile(
      join(root, `.verified-${model.id}.json`),
      JSON.stringify({ sha256: model.archiveSha256 }),
      { mode: 0o600 },
    );
  }
  progress(100, 'Local voice models ready');
}
