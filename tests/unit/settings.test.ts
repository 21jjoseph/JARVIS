import { mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SettingsStore } from '../../apps/desktop/electron/settings';
const directories: string[] = [];
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'jarvis-settings-'));
  directories.push(dir);
  return { dir, path: join(dir, 'settings.json') };
}
afterEach(async () => {
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true });
});
describe('atomic settings persistence', () => {
  it('persists settings and position across independent store instances', async () => {
    const { path } = await fixture();
    const store = new SettingsStore(path);
    expect(await store.load()).toBeNull();
    await store.update({ size: 410, position: { x: -400, y: 35 }, reducedMotion: true });
    const restored = new SettingsStore(path);
    await restored.load();
    expect(restored.value.size).toBe(410);
    expect(restored.value.position).toEqual({ x: -400, y: 35 });
    expect(restored.value.reducedMotion).toBe(true);
  });
  it('serializes simultaneous writes without losing changes', async () => {
    const { path } = await fixture();
    const store = new SettingsStore(path);
    await Promise.all([
      store.update({ size: 250 }),
      store.update({ color: '#112233' }),
      store.update({ intensity: 1.2 }),
    ]);
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
      size: 250,
      color: '#112233',
      intensity: 1.2,
    });
  });
  it('preserves corrupt settings, reports failure and loads safe defaults', async () => {
    const { path, dir } = await fixture();
    await writeFile(path, '{ invalid JSON');
    const store = new SettingsStore(path);
    expect(await store.load()).toContain('invalid');
    const backup = (await readdir(dir)).find((file) => file.startsWith('settings.json.invalid-'))!;
    expect(await readFile(join(dir, backup), 'utf8')).toBe('{ invalid JSON');
    expect(store.value.size).toBe(320);
  });
  it('does not claim persistence when writing fails', async () => {
    const { path } = await fixture();
    await writeFile(path, 'not a directory');
    const store = new SettingsStore(join(path, 'child.json'));
    await expect(store.update({ size: 400 })).rejects.toThrow();
    expect(store.value.size).toBe(320);
  });
});
