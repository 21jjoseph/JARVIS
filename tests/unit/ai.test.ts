import { describe, expect, it } from 'vitest';
import { validateTool } from '../../shared/contracts/ai';
import { Permissions } from '../../apps/desktop/electron/ai/permissions';
import { desktopCommand } from '../../apps/desktop/electron/ai/commands';

describe('desktop permissions', () => {
  it('requires the original owner, exact stored arguments and single-use approval', () => {
    const permissions = new Permissions();
    const proposal = permissions.propose(
      10,
      { name: 'open_app', arguments: { app: 'calculator' } },
      1000,
    );
    proposal.arguments.app = 'file_manager';
    expect(() => permissions.consume(11, proposal.id, 1001)).toThrow('window');
    expect(permissions.consume(10, proposal.id, 1002).arguments.app).toBe('calculator');
    expect(() => permissions.consume(10, proposal.id, 1003)).toThrow();
  });
  it('expires approvals and revokes them on cancellation or a new turn', () => {
    const permissions = new Permissions();
    const expired = permissions.propose(1, { name: 'system_info', arguments: {} }, 0);
    expect(() => permissions.consume(1, expired.id, 60001)).toThrow('expired');
    const revoked = permissions.propose(1, { name: 'system_info', arguments: {} });
    permissions.cancel(1);
    expect(() => permissions.consume(1, revoked.id)).toThrow();
    const old = permissions.propose(1, { name: 'system_info', arguments: {} });
    permissions.propose(1, { name: 'read_text_file', arguments: {} });
    expect(() => permissions.consume(1, old.id)).toThrow();
  });
  it('rejects shell tools, paths, unknown arguments and forged types', () => {
    for (const tool of [
      { name: 'shell', arguments: { command: 'whoami' } },
      { name: 'open_folder', arguments: { folder: '/etc' } },
      { name: 'open_app', arguments: { app: 'calculator', command: 'whoami' } },
      { name: 'system_info', arguments: [] },
      { name: 'find_files', arguments: { query: '../../key' } },
      { name: 'open_app', arguments: { app: { toString: () => 'calculator' } } },
    ])
      expect(() => validateTool(tool)).toThrow();
  });
  it('offers bounded offline tools without interpreting arbitrary instructions', () => {
    expect(desktopCommand('Show system info')).toEqual({ name: 'system_info', arguments: {} });
    expect(desktopCommand('Deschide calculator')).toEqual({
      name: 'open_app',
      arguments: { app: 'calculator' },
    });
    expect(desktopCommand('Read a file')?.name).toBe('read_text_file');
    expect(desktopCommand('Open calculator; rm -rf /')).toBeNull();
    expect(desktopCommand('execute terminal commands')).toBeNull();
  });
});
