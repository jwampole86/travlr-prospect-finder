import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { AvaDb } from './travlrBackend';

const TTL_MS = 5 * 60 * 1000;

interface Action { actorId: string; role: string; name: string; args: unknown; requestId: string }

/**
 * Pending confirmations that survive serverless hosting, where the request that asks and the request that
 * confirms may run on different instances. The pending action is a signed, expiring token bound to the user;
 * single use is enforced by inserting its nonce into ava_used_actions (a duplicate insert means "already used").
 * If the table is unavailable the confirmation fails closed rather than risking a replay.
 */
export function createSignedPendingStore(opts: { db: AvaDb; secret: string; now?: () => number }) {
  const now = opts.now ?? Date.now;
  const sign = (payload: string) => createHmac('sha256', opts.secret).update(payload).digest('base64url');
  if (!opts.secret) throw new Error('AVA confirmation secret is not configured');

  return {
    async put(action: Action) {
      const payload = Buffer.from(JSON.stringify({ ...action, exp: now() + TTL_MS, n: randomUUID() })).toString('base64url');
      return `act_${payload}.${sign(payload)}`;
    },

    async take(token: unknown, actorId: string): Promise<{ status: 'ok'; action: Action } | { status: 'missing' | 'wrong_actor' }> {
      if (typeof token !== 'string' || !token.startsWith('act_') || token.length > 4000) return { status: 'missing' };
      const [payload, sig] = token.slice(4).split('.');
      if (!payload || !sig) return { status: 'missing' };
      const expected = Buffer.from(sign(payload));
      const given = Buffer.from(sig);
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { status: 'missing' };

      let data: Action & { exp: number; n: string };
      try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return { status: 'missing' }; }
      if (typeof data.exp !== 'number' || data.exp <= now()) return { status: 'missing' };
      if (data.actorId !== actorId) return { status: 'wrong_actor' };

      const { error } = await opts.db.from('ava_used_actions').insert({ nonce: data.n, actor_id: actorId });
      if (error) return { status: 'missing' };
      const { exp: _exp, n: _n, ...action } = data;
      return { status: 'ok', action };
    }
  };
}
