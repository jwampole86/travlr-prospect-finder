import type { AvaDb } from './travlrBackend';

/** Event shape produced by the gateway (see server/audit.mjs). */
export interface AvaAuditEvent {
  at: string;
  actorId: string | null;
  role: string | null;
  type: string;
  requestId?: string;
  tool?: string;
  route?: string;
  actionId?: string;
  outcome?: string;
  reason?: string;
  [key: string]: unknown;
}

const COLUMNS = new Set(['at', 'actorId', 'role', 'type', 'requestId', 'tool', 'route', 'actionId', 'outcome', 'reason']);

/** Writes one row per event to ava_audit_log. The gateway treats failures as non-fatal. */
export function createSupabaseAudit(db: AvaDb) {
  return {
    async record(e: AvaAuditEvent) {
      const detail = Object.fromEntries(Object.entries(e).filter(([k]) => !COLUMNS.has(k)));
      const { error } = await db.from('ava_audit_log').insert({
        created_at: e.at,
        actor_id: e.actorId,
        role: e.role,
        event_type: e.type,
        request_id: e.requestId ?? null,
        tool: e.tool ?? null,
        route: e.route ?? null,
        action_id: e.actionId ?? null,
        outcome: e.outcome ?? null,
        reason: e.reason ?? null,
        detail
      });
      if (error) throw new Error(error.message);
    }
  };
}
