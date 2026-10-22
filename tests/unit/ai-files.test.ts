import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
vi.mock('electron', () => ({ app: {}, dialog: {}, shell: {} }));
import { readSelectedText } from '../../apps/desktop/electron/ai/tools';

describe('selected local text files', () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp('/tmp/jarvis-file-test-');
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });
  it('reads the selected UTF-8 file without a provider request', async () => {
    await writeFile(join(root, 'notes.txt'), 'Conținut local.');
    expect(await readSelectedText(join(root, 'notes.txt'))).toBe('Conținut local.');
  });
  it('rejects hidden credential paths, keys, binary and oversized files', async () => {
    await mkdir(join(root, '.private'));
    await writeFile(join(root, '.private', 'data.txt'), 'secret');
    await writeFile(join(root, 'private.key'), 'secret');
    await writeFile(join(root, 'binary.txt'), Buffer.from([0, 255, 1]));
    await writeFile(join(root, 'large.txt'), 'x'.repeat(128 * 1024 + 1));
    for (const file of ['.private/data.txt', 'private.key', 'binary.txt', 'large.txt'])
      await expect(readSelectedText(join(root, file))).rejects.toThrow();
    await symlink(join(root, '.private', 'data.txt'), join(root, 'alias.txt'));
    await expect(readSelectedText(join(root, 'alias.txt'))).rejects.toThrow('Hidden');
  });
});
