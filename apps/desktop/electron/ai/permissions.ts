import { randomUUID } from 'node:crypto';
import { validateTool, type PendingTool } from '../../../../shared/contracts/ai';

export class Permissions {
  private pending = new Map<string, { owner: number; tool: PendingTool }>();
  propose(owner: number, input: unknown, now = Date.now()): PendingTool {
    this.cancel(owner);
    const tool = { ...validateTool(input), id: randomUUID(), expires: now + 60_000 };
    this.pending.set(tool.id, { owner, tool });
    return structuredClone(tool);
  }
  consume(owner: number, id: string, now = Date.now()): PendingTool {
    const entry = this.pending.get(id);
    if (!entry || entry.owner !== owner)
      throw new Error('Approval does not belong to this window.');
    this.pending.delete(id);
    if (entry.tool.expires < now) throw new Error('Approval expired. Ask again.');
    return structuredClone(entry.tool);
  }
  cancel(owner?: number) {
    let revoked = false;
    for (const [id, entry] of this.pending)
      if (owner === undefined || entry.owner === owner) {
        this.pending.delete(id);
        revoked = true;
      }
    return revoked;
  }
}
