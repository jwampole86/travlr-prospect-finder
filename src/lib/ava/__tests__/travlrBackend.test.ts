import { describe, expect, it } from 'vitest';
import { createTravlrBackend, leadStatus, mapLead } from '../travlrBackend';
import { ToolDenied, ToolError, ToolTimeout } from '../server/errors.mjs';

const agent = { id: 'agent-1', role: 'agent' };
const admin = { id: 'admin-1', role: 'admin' };
const NOW = new Date('2026-11-04T12:00:00Z');

const rows = [
  { id: 'L1', address: '12 Pine St', city: 'Denver', prospect_score: 96, luxury: true, verified_owner: true, verified_number: true, owner_name: 'Hart', updated_at: '2026-11-04T09:00:00Z' },
  { id: 'L2', address: '9 Oak Ave', city: 'Aspen', prospect_score: 80, luxury: false, verified_owner: true, verified_number: false, updated_at: '2026-11-03T09:00:00Z' },
  { id: 'L3', address: '3 Elm Rd', city: 'Vail', prospect_score: 50, luxury: false, updated_at: '2026-11-01T09:00:00Z' }
];

function fakeFetch(body: unknown, status = 200) {
  const calls: Array<{ url: URL; headers: Record<string, string> }> = [];
  const impl = (async (url: URL, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init?.headers ?? {} });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

/** Minimal chainable fake of the Supabase query builder. */
function fakeDb(tables: Record<string, Array<Record<string, unknown>>>, opts: { insertError?: boolean } = {}) {
  const inserted: Array<Record<string, unknown>> = [];
  const db = {
    inserted,
    from(table: string) {
      let result = [...(tables[table] ?? [])];
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => { result = result.filter((r) => r[c] === v); return q; },
        ilike: (c: string, v: string) => { const needle = v.replace(/%/g, '').replace(/\\/g, '').toLowerCase(); result = result.filter((r) => String(r[c]).toLowerCase().includes(needle)); return q; },
        limit: (n: number) => { result = result.slice(0, n); return q; },
        maybeSingle: async () => ({ data: result[0] ?? null }),
        then: (res: (v: unknown) => void) => res({ data: result }),
        insert: (row: Record<string, unknown>) => {
          if (!opts.insertError) inserted.push(row);
          return { select: () => ({ single: async () => (opts.insertError ? { data: null, error: { message: 'boom' } } : { data: { id: row.id }, error: null }) }) };
        }
      };
      return q;
    }
  };
  return db;
}

const backend = (over: Partial<Parameters<typeof createTravlrBackend>[0]> = {}) =>
  createTravlrBackend({ db: fakeDb({}), origin: 'https://app.test', forwardHeaders: { cookie: 'sb=1' }, now: () => NOW, ...over });

describe('lead search', () => {
  it("reads through the app's own leads API with the caller's credentials, so access rules are the app's", async () => {
    const f = fakeFetch({ leads: rows });
    const res = await backend({ fetchImpl: f.impl }).searchLeads({ limit: 5 }, { actor: agent });
    expect(f.calls[0].url.pathname).toBe('/api/leads/paginated');
    expect(f.calls[0].headers.cookie).toBe('sb=1');
    expect(f.calls[0].url.searchParams.get('isSynthetic')).toBe('false');
    expect(res).toMatchObject({ source: 'backend', asOf: NOW.toISOString(), newestRecordAt: '2026-11-04T09:00:00Z' });
    expect(res.leads.map((l) => l.id)).toEqual(['L1', 'L2', 'L3']);
    expect(res.leads[0]).toMatchObject({ name: '12 Pine St, Denver', tier: 'Luxury', score: 96, status: 'Verified', owner: 'Hart' });
  });

  it('filters by tier and verification status and respects the limit', async () => {
    const f = fakeFetch({ leads: rows });
    const b = backend({ fetchImpl: f.impl });
    expect((await b.searchLeads({ tier: 'Standard', limit: 5 }, { actor: admin })).leads.map((l) => l.id)).toEqual(['L2', 'L3']);
    expect((await b.searchLeads({ status: 'Pending', limit: 5 }, { actor: admin })).leads.map((l) => l.id)).toEqual(['L2']);
    expect((await b.searchLeads({ limit: 1 }, { actor: admin })).leads).toHaveLength(1);
    expect(f.calls.at(-1)!.url.searchParams.get('pageSize')).toBe('10');
    expect(f.calls[1].url.searchParams.get('pageSize')).toBe('50');
    await b.searchLeads({ tier: 'Luxury', query: 'pine', limit: 2 }, { actor: admin });
    expect(f.calls.at(-1)!.url.searchParams.get('luxury')).toBe('true');
    expect(f.calls.at(-1)!.url.searchParams.get('search')).toBe('pine');
  });

  it('maps access errors to a permission denial, timeouts to a timeout, and anything else to a failure', async () => {
    await expect(backend({ fetchImpl: fakeFetch({}, 403).impl }).searchLeads({ limit: 5 }, { actor: agent })).rejects.toBeInstanceOf(ToolDenied);
    await expect(backend({ fetchImpl: fakeFetch({}, 401).impl }).searchLeads({ limit: 5 }, { actor: agent })).rejects.toBeInstanceOf(ToolDenied);
    await expect(backend({ fetchImpl: fakeFetch({}, 500).impl }).searchLeads({ limit: 5 }, { actor: agent })).rejects.toBeInstanceOf(ToolError);
    await expect(backend({ fetchImpl: fakeFetch({ nope: 1 }).impl }).searchLeads({ limit: 5 }, { actor: agent })).rejects.toBeInstanceOf(ToolError);
    const timeout = (async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); }) as unknown as typeof fetch;
    await expect(backend({ fetchImpl: timeout }).searchLeads({ limit: 5 }, { actor: agent })).rejects.toBeInstanceOf(ToolTimeout);
  });

  it('derives status the way the app labels verification', () => {
    expect(leadStatus({ verified_owner: true, verified_number: true })).toBe('Verified');
    expect(leadStatus({ fully_verified: true })).toBe('Verified');
    expect(leadStatus({ verified_owner: true })).toBe('Pending');
    expect(leadStatus({ verification_status: 'PENDING_VERIFICATION' })).toBe('Pending');
    expect(leadStatus({})).toBe('Unverified');
    expect(mapLead({ id: 5 }).name).toBe('Unnamed property');
  });
});

describe('follow-up creation', () => {
  const leads = [
    { id: 'L1', address: '12 Pine St', primary_agent_id: 'agent-1' },
    { id: 'L2', address: '9 Oak Ave', primary_agent_id: 'someone-else' },
    { id: 'L3', address: '12 Pine Court', primary_agent_id: 'agent-1' }
  ];

  it('creates a reminder on the lead and reports success only because the row came back', async () => {
    const db = fakeDb({ leads });
    const res = await backend({ db }).createFollowup({ leadName: '12 Pine St, Denver', leadId: 'L1', note: 'Call about the listing' }, { actor: agent });
    expect(res).toMatchObject({ confirmed: true, source: 'backend' });
    expect(db.inserted[0]).toMatchObject({ lead_id: 'L1', title: 'Follow up: Call about the listing', due_date: '2026-11-05', priority: 'medium', completed: false });
  });

  it('refuses an agent who is not assigned to the lead, and writes nothing', async () => {
    const db = fakeDb({ leads });
    await expect(backend({ db }).createFollowup({ leadName: '9 Oak Ave', leadId: 'L2' }, { actor: agent })).rejects.toBeInstanceOf(ToolDenied);
    expect(db.inserted).toEqual([]);
  });

  it('lets an admin create one on any lead', async () => {
    const db = fakeDb({ leads });
    await backend({ db }).createFollowup({ leadName: '9 Oak Ave', leadId: 'L2' }, { actor: admin });
    expect(db.inserted).toHaveLength(1);
  });

  it('resolves a lead by name only within the agent\'s own leads, and only when exactly one matches', async () => {
    const db = fakeDb({ leads });
    await expect(backend({ db }).createFollowup({ leadName: '12 Pine' }, { actor: agent })).rejects.toBeInstanceOf(ToolError); // two matches
    await expect(backend({ db }).createFollowup({ leadName: '9 Oak Ave' }, { actor: agent })).rejects.toBeInstanceOf(ToolError); // not theirs, so not found
    await backend({ db }).createFollowup({ leadName: '12 Pine St' }, { actor: agent });
    expect(db.inserted[0]).toMatchObject({ lead_id: 'L1' });
  });

  it('does not report success when the database did not save it', async () => {
    const db = fakeDb({ leads }, { insertError: true });
    await expect(backend({ db }).createFollowup({ leadName: 'x', leadId: 'L1' }, { actor: agent })).rejects.toBeInstanceOf(ToolError);
  });

  it('treats an unknown lead id as not found', async () => {
    await expect(backend({ db: fakeDb({ leads }) }).createFollowup({ leadName: 'x', leadId: 'nope' }, { actor: admin })).rejects.toBeInstanceOf(ToolError);
  });
});

describe('knowledge search', () => {
  it('returns approved help with its version and sources', async () => {
    const res = await backend().searchKnowledge({ query: 'How do I clock in and track breaks?' });
    expect(res).toMatchObject({ source: 'backend', label: 'Approved AVYRO help', version: expect.stringMatching(/^\d{4}-/) });
    expect(res.entries.length).toBeGreaterThan(0);
    expect(res.entries[0].source).toBeTruthy();
  });
  it('lets the model choose among the real entries when the word match is missing or weak, and carries on if that fails', async () => {
    const pick = (ids: string[]) => async (entries: Array<{ id: string }>) => entries.filter((e) => ids.includes(e.id)) as never;
    const chosen = await backend({ selectKnowledge: pick(['seller-stages']) }).searchKnowledge({ query: 'what happens next once a homeowner texts that they might sell' });
    expect(chosen.entries[0].source).toBe('Seller & owner services');
    const broken = await backend({ selectKnowledge: async () => { throw new Error('down'); } }).searchKnowledge({ query: 'what is the capital of France' });
    expect(broken.entries).toEqual([]);
    let called = 0;
    await backend({ selectKnowledge: async () => { called++; return []; } }).searchKnowledge({ query: 'How do I clock in and track breaks?' });
    expect(called).toBe(0); // a strong word match needs no help
  });

  it('returns nothing for unrelated questions', async () => {
    expect((await backend().searchKnowledge({ query: 'what is the capital of France' })).entries).toEqual([]);
  });
});
