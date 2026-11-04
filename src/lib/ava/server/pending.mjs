// Synced from ava-assistant. Do not edit here: change it there and run tools/sync-to-travlr.mjs.
// Pending confirmations for mutating tools. The memory store is for one process (dev, tests); a hosted
// deployment passes its own store (see TRAVLR's signed-token store) because requests may hit different instances.
import { randomUUID } from 'node:crypto';

export const CONFIRM_TTL_MS = 5 * 60 * 1000;

export function createMemoryPendingStore({ now = Date.now, ttlMs = CONFIRM_TTL_MS } = {}) {
  const pending = new Map();
  const prune = () => { for (const [id, a] of pending) if (a.expires <= now()) pending.delete(id); };
  return {
    async put(action) {
      prune();
      const id = 'act_' + randomUUID();
      pending.set(id, { ...action, expires: now() + ttlMs });
      return id;
    },
    /** @returns {Promise<{ status: 'ok', action: object } | { status: 'missing' | 'wrong_actor' }>} */
    async take(id, actorId) {
      prune();
      const action = typeof id === 'string' ? pending.get(id) : undefined;
      if (!action) return { status: 'missing' };
      // A different user must not be able to use (or burn) someone else's pending action.
      if (action.actorId !== actorId) return { status: 'wrong_actor' };
      pending.delete(id); // single use, so a replayed confirmation cannot run twice
      return { status: 'ok', action };
    },
    size: () => { prune(); return pending.size; }
  };
}
