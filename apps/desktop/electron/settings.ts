import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { DEFAULT_SETTINGS, validateSettingsPatch, type Settings } from '../../../shared/contracts';

export class SettingsStore {
  private current: Settings = { ...DEFAULT_SETTINGS };
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly path: string) {}
  get value(): Settings {
    return structuredClone(this.current);
  }
  async load(): Promise<string | null> {
    try {
      const raw: unknown = JSON.parse(await readFile(this.path, 'utf8'));
      const checked=validateSettingsPatch(raw);
      if (checked.localModel && checked.localBackend === undefined) checked.localBackend='ollama';
      if (checked.cloudProvider === undefined && existsSync(join(dirname(this.path),'cloud-key.bin'))) checked.cloudProvider='openai';
      this.current = { ...DEFAULT_SETTINGS, ...checked };
      return null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      // Preserve unreadable/corrupt settings for diagnosis. Never claim they were loaded.
      try {
        await rename(this.path, `${this.path}.invalid-${Date.now()}`);
      } catch {
        throw new Error(
          'Cannot read or preserve saved settings. Check the application data directory.',
        );
      }
      return 'Saved settings were invalid; defaults loaded. The original file was preserved.';
    }
  }
  update(patch: Partial<Settings>): Promise<Settings> {
    const checked = validateSettingsPatch(patch);
    const operation = this.queue.then(async () => {
      const next = { ...this.current, ...checked };
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(`${this.path}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 });
      await rename(`${this.path}.tmp`, this.path);
      this.current = next;
    });
    this.queue = operation.catch(() => {});
    return operation.then(() => this.value);
  }
  flush(): Promise<void> {
    return this.queue;
  }
}
