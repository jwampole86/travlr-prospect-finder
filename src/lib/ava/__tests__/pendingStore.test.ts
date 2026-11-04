import { describe, expect, it } from 'vitest';
import { createSignedPendingStore } from '../pendingStore';

/** Fake of the ava_used_actions table: a duplicate nonce is refused, like the primary key. */
function nonceDb(opts: { broken?: boolean } = {}) {
  const used = new Set<string>();
  return {
    used,
    from: () => ({
      insert: async (row: { nonce: string }) => {
        if (opts.broken) return { error: { message: 'relation does not exist' } };
        if (used.has(row.nonce)) return { error: { code: '23505', message: 'duplicate key' } };
        used.add(row.nonce);
        return { error: null };
      }
    })
  };
}

const action = { actorId: 'u1', role: 'agent', name: 'create_followup', args: { leadName: 'X', leadId: 'L1' }, requestId: 'r1' };

describe('signed pending confirmations', () => {
  it('round-trips an action once, for the same user only', async () => {
    let t = 1_000;
    const store = createSignedPendingStore({ db: nonceDb(), secret: 's3cret', now: () => t });
    const token = await store.put(action);
    expect(token.startsWith('act_')).toBe(true);
    expect(token.length).toBeLessThan(2000);
    expect(await store.take(token, 'u1')).toEqual({ status: 'ok', action });
    expect(await store.take(token, 'u1')).toEqual({ status: 'missing' }); // replay
  });

  it("does not let another user use, or burn, someone else's token", async () => {
    const db = nonceDb();
    const store = createSignedPendingStore({ db, secret: 's3cret' });
    const token = await store.put(action);
    expect(await store.take(token, 'u2')).toEqual({ status: 'wrong_actor' });
    expect(db.used.size).toBe(0);
    expect((await store.take(token, 'u1')).status).toBe('ok');
  });

  it('rejects tampered, forged, malformed and expired tokens', async () => {
    let t = 0;
    const store = createSignedPendingStore({ db: nonceDb(), secret: 's3cret', now: () => t });
    const token = await store.put(action);
    const [payload, sig] = token.slice(4).split('.');
    const evil = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), actorId: 'u9', args: { leadName: 'Hacked', leadId: 'L9' } })).toString('base64url');
    for (const bad of [`act_${evil}.${sig}`, `act_${payload}.${sig.slice(0, -2)}xx`, 'act_', 'act_a.b', 'nope', '', undefined, 42, 'act_' + 'a'.repeat(5000)]) {
      expect((await store.take(bad, 'u1')).status).toBe('missing');
    }
    const other = createSignedPendingStore({ db: nonceDb(), secret: 'different', now: () => t });
    expect((await other.take(token, 'u1')).status).toBe('missing');
    t += 5 * 60 * 1000 + 1;
    expect((await store.take(token, 'u1')).status).toBe('missing');
  });

  it('fails closed when single-use cannot be recorded', async () => {
    const store = createSignedPendingStore({ db: nonceDb({ broken: true }), secret: 's3cret' });
    expect((await store.take(await store.put(action), 'u1')).status).toBe('missing');
  });

  it('refuses to start without a secret', () => {
    expect(() => createSignedPendingStore({ db: nonceDb(), secret: '' })).toThrow();
  });
});
