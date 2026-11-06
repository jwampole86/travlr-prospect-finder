import { describe, expect, it } from 'vitest';
import { createRateLimiter, handleAva } from '../handler';
import type { AvaHandlerDeps } from '../handler';
import { createGateway } from '../server/gateway.mjs';
import { createMemoryPendingStore } from '../server/pending.mjs';
import { createMemoryAudit } from '../server/audit.mjs';

const agent = { id: 'u-agent', role: 'agent' };
const llm = (reply: object) => ({ chat: async () => reply });

function deps(over: Partial<AvaHandlerDeps> & { llmReply?: object; actor?: typeof agent | null } = {}): AvaHandlerDeps & { audit: ReturnType<typeof createMemoryAudit> } {
  const audit = createMemoryAudit();
  const backend = { searchLeads: async () => ({ source: 'backend', asOf: 'now', leads: [] }), searchKnowledge: async () => ({ source: 'backend', entries: [] }), createFollowup: async () => ({ confirmed: true, id: 'f1' }) };
  return {
    audit,
    enabled: () => true,
    getActor: async () => (over.actor === undefined ? agent : over.actor),
    hasLlm: () => true,
    allow: () => true,
    makeGateway: () => createGateway({ llm: llm(over.llmReply ?? { content: 'Hello from AVA' }), backend, audit, pending: createMemoryPendingStore() }) as never,
    ...over
  };
}

const post = (body: unknown, init: RequestInit = {}) =>
  new Request('https://app.test/api/ava/turn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body), ...init });
const lines = async (res: Response) => (await res.text()).trim().split('\n').map((l) => JSON.parse(l));

describe('/api/ava handler', () => {
  it('is invisible (404) unless AVA is enabled', async () => {
    expect((await handleAva(post({}), 'turn', deps({ enabled: () => false }))).status).toBe(404);
  });

  it('requires POST, a signed-in user, a staff role and JSON', async () => {
    expect((await handleAva(new Request('https://app.test/api/ava/turn'), 'turn', deps())).status).toBe(405);
    expect((await handleAva(post({}), 'turn', deps({ actor: null }))).status).toBe(401);
    expect((await handleAva(post({}), 'turn', deps({ getActor: async () => ({ id: 'h', role: 'homeowner' }) }))).status).toBe(403);
    expect((await handleAva(post({}), 'turn', deps({ getActor: async () => ({ id: 'x', role: 'superuser' }) }))).status).toBe(403);
    expect((await handleAva(post('x', { headers: { 'content-type': 'text/plain' } }), 'turn', deps())).status).toBe(415);
  });

  it('rejects oversized, malformed and non-object bodies', async () => {
    expect((await handleAva(post('{nope'), 'turn', deps())).status).toBe(400);
    expect((await handleAva(post('[1,2]'), 'turn', deps())).status).toBe(400);
    expect((await handleAva(post({ messages: [{ role: 'user', content: 'x'.repeat(40_000) }] }), 'turn', deps())).status).toBe(413);
    expect((await handleAva(post({}, { headers: { 'content-type': 'application/json', 'content-length': '99999' } }), 'turn', deps())).status).toBe(413);
  });

  it('answers 429 when a user is over the limit, 503 when the model is not configured', async () => {
    expect((await handleAva(post({ messages: [] }), 'turn', deps({ allow: () => false }))).status).toBe(429);
    const res = await handleAva(post({ messages: [] }), 'turn', deps({ hasLlm: () => false }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'llm_not_configured' });
  });

  it('streams the gateway lines and always ends with done', async () => {
    const res = await handleAva(post({ messages: [{ role: 'user', content: 'hi' }], context: { route: '/lead-management' } }), 'turn', deps());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/x-ndjson');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await lines(res)).toEqual([{ t: 'answer', text: 'Hello from AVA', sources: [] }, { t: 'done' }]);
  });

  it('runs the confirm path for the same signed-in user, and audits it', async () => {
    const d = deps({ llmReply: { content: null, tool_calls: [{ id: 'c', type: 'function', function: { name: 'create_followup', arguments: JSON.stringify({ leadName: 'Pine' }) } }] } });
    const gw = d.makeGateway(post({}), agent);
    d.makeGateway = () => gw;
    const turn = await lines(await handleAva(post({ messages: [{ role: 'user', content: 'follow up' }] }), 'turn', d));
    expect(turn[0]).toMatchObject({ t: 'confirm', summary: 'Create a follow-up for Pine' });
    const done = await lines(await handleAva(post({ actionId: turn[0].actionId, decision: 'accept' }), 'confirm', d));
    expect(done.map((l) => l.t)).toEqual(['tool_start', 'tool_end', 'answer', 'done']);
    expect(d.audit.events.map((e: { type: string }) => e.type)).toContain('confirm_accepted');
  });

  it('reports a gateway crash as a generic error without leaking details', async () => {
    const d = deps({ makeGateway: () => ({ turn: async () => { throw new Error('secret connection string'); }, confirm: async () => undefined, prepare: async () => undefined, briefing: async () => undefined }) });
    const out = await lines(await handleAva(post({ messages: [] }), 'turn', d));
    expect(out).toEqual([{ t: 'error', code: 'brain_failed' }, { t: 'done' }]);
  });
});

describe('/api/ava prepare and briefing', () => {
  const backend = {
    updateLeadStage: async () => ({ confirmed: true, id: 'L1' }),
    getBriefing: async () => ({ source: 'backend', asOf: 'now', priorityCount: 2, dueCount: 1, overdueCount: 0, unverifiedCount: 0, priority: [], followups: [] })
  };
  const withBackend = () => {
    const d = deps();
    const gw = createGateway({ llm: null, backend: backend as never, audit: d.audit, pending: createMemoryPendingStore() }) as never;
    d.makeGateway = () => gw;
    return d;
  };

  it('prepares a change from a card, asks for approval, and only then runs it once', async () => {
    const d = withBackend();
    const prepared = await lines(await handleAva(post({ tool: 'update_lead_stage', args: { leadId: 'L1', leadName: '12 Pine St', stage: 'Contacted' } }), 'prepare', d));
    expect(prepared[0]).toMatchObject({ t: 'confirm', tool: 'update_lead_stage', summary: 'Move 12 Pine St to "Contacted"' });
    const done = await lines(await handleAva(post({ actionId: prepared[0].actionId, decision: 'accept' }), 'confirm', d));
    expect(done.at(-2)).toMatchObject({ t: 'answer', text: expect.stringContaining('now at "Contacted"') });
    const again = await lines(await handleAva(post({ actionId: prepared[0].actionId, decision: 'accept' }), 'confirm', d));
    expect(again[0]).toEqual({ t: 'error', code: 'unknown_or_expired_action' });
  });

  it('refuses to prepare anything that is not a confirmed change', async () => {
    const out = await lines(await handleAva(post({ tool: 'search_leads', args: {} }), 'prepare', withBackend()));
    expect(out).toEqual([{ t: 'error', code: 'bad_request' }, { t: 'done' }]);
  });

  it('gives the briefing without needing the language model, and still needs a signed-in staff user', async () => {
    const d = withBackend();
    d.hasLlm = () => false;
    const out = await lines(await handleAva(post({ context: { localHour: 9 } }), 'briefing', d));
    expect(out.find((l) => l.t === 'answer').text).toBe("Good morning. Here's what needs you today: 2 priority leads, 1 follow-up due.");
    expect((await handleAva(post({}), 'briefing', deps({ actor: null }))).status).toBe(401);
    expect((await handleAva(post({}), 'briefing', deps({ getActor: async () => ({ id: 'h', role: 'homeowner' }) }))).status).toBe(403);
  });
});

describe('rate limiter', () => {
  it('allows the configured number per window per user, then recovers', () => {
    let t = 0;
    const allow = createRateLimiter(3, 1000, () => t);
    expect([allow('a'), allow('a'), allow('a'), allow('a')]).toEqual([true, true, true, false]);
    expect(allow('b')).toBe(true);
    t = 1001;
    expect(allow('a')).toBe(true);
  });
});
