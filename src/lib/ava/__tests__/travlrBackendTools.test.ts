import { describe, expect, it } from 'vitest';
import { createTravlrBackend, explainLead } from '../travlrBackend';
import { ToolDenied, ToolError } from '../server/errors.mjs';

const agent = { id: 'agent-1', role: 'agent' };
const admin = { id: 'admin-1', role: 'admin', organizationId: 'org-1' };
const NOW = new Date('2026-11-06T12:00:00Z');

/** A chainable fake of the parts of the Supabase query builder the AVA backend uses. */
function fakeDb(tables: Record<string, Array<Record<string, any>>>) {
  const updates: Array<{ table: string; patch: Record<string, unknown>; ids: unknown[] }> = [];
  return {
    updates,
    from(table: string) {
      let result = (tables[table] ?? []).map((r) => r);
      let patch: Record<string, unknown> | null = null;
      let head = false;
      const filter = (fn: (r: Record<string, any>) => boolean) => { result = result.filter(fn); return q; };
      const q: any = {
        select: (_c?: string, opts?: { head?: boolean }) => {
          if (opts?.head) head = true;
          if (patch) { const rows = result; rows.forEach((r) => Object.assign(r, patch)); updates.push({ table, patch, ids: rows.map((r) => r.id) }); return Promise.resolve({ data: rows.map((r) => ({ id: r.id })), error: null }); }
          return q;
        },
        update: (p: Record<string, unknown>) => { patch = p; return q; },
        eq: (c: string, v: unknown) => filter((r) => r[c] === v),
        lt: (c: string, v: string) => filter((r) => String(r[c]) < v),
        lte: (c: string, v: string) => filter((r) => String(r[c]) <= v),
        gt: (c: string, v: string) => filter((r) => String(r[c]) > v),
        gte: (c: string, v: number) => filter((r) => Number(r[c]) >= v),
        in: (c: string, v: unknown[]) => filter((r) => v.includes(r[c])),
        not: (c: string, _op: string, v: string) => { const set = v.replace(/[()"]/g, '').split(','); return filter((r) => !set.includes(String(r[c]))); },
        or: (expr: string) => filter((r) => (expr.startsWith('is_synthetic') ? r.is_synthetic !== true : r.fully_verified !== true)),
        order: (c: string, o: { ascending: boolean }) => { result = [...result].sort((a, b) => (o.ascending ? 1 : -1) * (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0)); return q; },
        limit: (n: number) => { result = result.slice(0, n); return q; },
        maybeSingle: async () => ({ data: result[0] ? { ...result[0] } : null }), // a copy, as a real database returns
        then: (res: (v: unknown) => void) => res(head ? { data: null, count: result.length } : { data: result }),
      };
      return q;
    }
  };
}

const leads = () => [
  { id: 'L1', address: '12 Pine St', city: 'Denver', prospect_score: 96, luxury: true, verified_owner: true, verified_number: true, fully_verified: true, stage: 'New Lead', primary_agent_id: 'agent-1', is_synthetic: false, version: 3, updated_at: '2026-11-05T09:00:00Z' },
  { id: 'L2', address: '9 Oak Ave', city: 'Aspen', prospect_score: 85, luxury: false, verified_owner: true, verified_number: false, stage: 'Contacted', primary_agent_id: 'agent-1', is_synthetic: null, version: 1, updated_at: '2026-11-04T09:00:00Z' },
  { id: 'L3', address: '3 Elm Rd', city: 'Vail', prospect_score: 90, luxury: false, stage: 'New Lead', primary_agent_id: 'someone-else', is_synthetic: false, version: 1 },
  { id: 'L5', address: '5 Fake Way', city: 'Vail', prospect_score: 97, stage: 'New Lead', primary_agent_id: 'agent-1', is_synthetic: true, version: 1 },
  { id: 'L4', address: '1 Done Ln', city: 'Vail', prospect_score: 99, stage: 'Live', primary_agent_id: 'agent-1', is_synthetic: false, version: 1 }
];
const reminders = () => [
  { id: 'R1', lead_id: 'L1', title: 'Call Hart', due_date: '2026-11-04', priority: 'high', completed: false },
  { id: 'R2', lead_id: 'L2', title: 'Send the report', due_date: '2026-11-06', priority: 'medium', completed: false },
  { id: 'R3', lead_id: 'L3', title: "Someone else's", due_date: '2026-11-05', priority: 'low', completed: false },
  { id: 'R4', lead_id: 'L1', title: 'Next week', due_date: '2026-11-10', priority: 'low', completed: false },
  { id: 'R5', lead_id: 'L1', title: 'Already done', due_date: '2026-11-01', priority: 'low', completed: true }
];

const make = (tables: Record<string, Array<Record<string, any>>> = { leads: leads(), lead_reminders: reminders() }) => {
  const db = fakeDb(tables);
  return { db, backend: createTravlrBackend({ db, origin: 'https://app.test', forwardHeaders: {}, now: () => NOW }) };
};

describe('explaining a lead', () => {
  it('gives the facts behind a rank and what is missing', () => {
    expect(explainLead({ prospect_score: 85, luxury: true, verified_owner: true, stage: 'New Lead' })).toEqual({
      why: ['High prospect score (85)', 'Luxury tier', 'Owner verified', 'Not contacted yet'].slice(0, 4),
      missing: ['Phone number not verified yet']
    });
    expect(explainLead({ prospect_score: 40, fully_verified: true, stage: 'Contacted' })).toEqual({ why: ['Low prospect score (40)', 'Owner and phone both verified'], missing: [] });
  });
});

describe('lead details', () => {
  it('returns a lead the agent owns with its open follow-ups', async () => {
    const { backend } = make();
    const r = await backend.getLeadDetails({ leadId: 'L1' }, { actor: agent });
    expect(r.lead).toMatchObject({ id: 'L1', name: '12 Pine St, Denver', openFollowups: 2, missing: [] });
  });
  it("refuses another agent's lead, and says not found for an unknown one", async () => {
    const { backend } = make();
    await expect(backend.getLeadDetails({ leadId: 'L3' }, { actor: agent })).rejects.toBeInstanceOf(ToolDenied);
    await expect(backend.getLeadDetails({ leadId: 'nope' }, { actor: agent })).rejects.toBeInstanceOf(ToolError);
    expect((await backend.getLeadDetails({ leadId: 'L3' }, { actor: admin })).lead.id).toBe('L3');
  });
});

describe('follow-ups', () => {
  it("lists what is due, soonest first, only on the agent's own leads, with how overdue each is", async () => {
    const { backend } = make();
    const r = await backend.listFollowups({ scope: 'due', limit: 5 }, { actor: agent });
    expect(r.items.map((i) => i.id)).toEqual(['R1', 'R2']);
    expect(r.items[0]).toMatchObject({ leadName: '12 Pine St, Denver', overdueDays: 2, dueDate: '2026-11-04' });
    expect(r.items[1].overdueDays).toBe(0);
  });
  it('separates overdue from upcoming, and an admin sees everyone\'s', async () => {
    const { backend } = make();
    expect((await backend.listFollowups({ scope: 'overdue', limit: 5 }, { actor: agent })).items.map((i) => i.id)).toEqual(['R1']);
    expect((await backend.listFollowups({ scope: 'upcoming', limit: 5 }, { actor: agent })).items.map((i) => i.id)).toEqual(['R4']);
    expect((await backend.listFollowups({ scope: 'due', limit: 5 }, { actor: admin })).items.map((i) => i.id)).toEqual(['R1', 'R3', 'R2']);
  });
});

describe('verification and the briefing', () => {
  it('queues the best leads that still need checking, with what they need', async () => {
    const { backend } = make();
    const r = await backend.verificationQueue({ limit: 5 }, { actor: agent });
    expect(r.leads.map((l) => l.id)).toEqual(['L2']);
    expect(r.leads[0].missing).toEqual(['Phone number not verified yet']);
  });
  it('counts what needs the person today, never including other agents\' leads or finished ones', async () => {
    const { backend } = make();
    const r = await backend.getBriefing({}, { actor: agent });
    expect(r).toMatchObject({ priorityCount: 2, unverifiedCount: 1, dueCount: 2, overdueCount: 1 });
    expect(r.priority.map((l) => l.id)).toEqual(['L1', 'L2']);
    expect(r.followups.map((f) => f.id)).toEqual(['R1', 'R2']);
    const all = await backend.getBriefing({}, { actor: admin });
    expect(all.priorityCount).toBe(3);
  });
});

describe('seller pipeline', () => {
  it('counts open opportunities by stage for the organization, admins only', async () => {
    const { backend } = make({ seller_opportunities: [
      { stage: 'signal', status: 'open', organization_id: 'org-1', next_action_at: '2026-11-05T00:00:00Z' },
      { stage: 'signal', status: 'open', organization_id: 'org-1', next_action_at: null },
      { stage: 'qualified', status: 'open', organization_id: 'org-1', next_action_at: '2026-12-01T00:00:00Z' },
      { stage: 'signal', status: 'open', organization_id: 'org-2' },
      { stage: 'signal', status: 'lost', organization_id: 'org-1' }
    ] });
    expect(await backend.sellerPipeline({}, { actor: admin })).toMatchObject({ open: 3, byStage: { signal: 2, qualified: 1 }, dueActions: 1 });
    await expect(backend.sellerPipeline({}, { actor: agent })).rejects.toBeInstanceOf(ToolDenied);
  });
});

describe('changes', () => {
  it('moves a stage only when the row really changed, and bumps the version', async () => {
    const { backend, db } = make();
    const r = await backend.updateLeadStage({ leadId: 'L1', stage: 'Contacted' }, { actor: agent });
    expect(r).toMatchObject({ confirmed: true, id: 'L1' });
    expect(db.updates[0]).toMatchObject({ table: 'leads', ids: ['L1'], patch: { stage: 'Contacted', version: 4 } });
  });
  it("will not touch someone else's lead", async () => {
    const { backend, db } = make();
    await expect(backend.updateLeadStage({ leadId: 'L3', stage: 'Live' }, { actor: agent })).rejects.toBeInstanceOf(ToolDenied);
    expect(db.updates).toEqual([]);
  });
  it('does not claim success when the lead was changed by someone else in the meantime', async () => {
    const tables = { leads: leads(), lead_reminders: reminders() };
    const db = fakeDb(tables);
    const racing = createTravlrBackend({
      // the version moves on between the read and the write
      db: { from: (t: string) => { const q = db.from(t); const upd = q.update; q.update = (p: Record<string, unknown>) => { tables.leads[0].version = 9; return upd(p); }; return q; } } as never,
      origin: 'x', forwardHeaders: {}, now: () => NOW
    });
    await expect(racing.updateLeadStage({ leadId: 'L1', stage: 'Live' }, { actor: agent })).rejects.toBeInstanceOf(ToolError);
    expect(tables.leads[0].stage).toBe('New Lead');
  });
  it('completes a follow-up on an own lead, once', async () => {
    const { backend, db } = make();
    expect(await backend.completeFollowup({ reminderId: 'R2' }, { actor: agent })).toMatchObject({ confirmed: true });
    expect(db.updates[0]).toMatchObject({ table: 'lead_reminders', ids: ['R2'], patch: { completed: true } });
    await expect(backend.completeFollowup({ reminderId: 'R5' }, { actor: agent })).rejects.toBeInstanceOf(ToolError);
  });
  it("will not complete a reminder on someone else's lead", async () => {
    const { backend, db } = make();
    await expect(backend.completeFollowup({ reminderId: 'R3' }, { actor: agent })).rejects.toBeInstanceOf(ToolDenied);
    expect(db.updates).toEqual([]);
  });
});
