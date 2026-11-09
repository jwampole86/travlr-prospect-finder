import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { registerLead, resolveReview } = await import('./registryService');

type Row = Record<string, any>;
/** A small in-memory database that supports the few query shapes the registry service uses, and records every write. */
function memoryDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = { properties: [], property_units: [], property_source_links: [], property_observations: [], identity_review_cases: [], leads: [], ...seed };
  const writes: Array<{ table: string; op: string }> = [];
  let n = 0;
  const db = {
    tables, writes,
    from(table: string) {
      const rows = tables[table];
      let sel = [...rows];
      let mode: 'select' | 'update' | 'delete' = 'select';
      let patch: Row = {};
      const filters: Array<(r: Row) => boolean> = [];
      let limit = Infinity;
      const run = () => {
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        if (mode === 'update') { hit.forEach((r) => Object.assign(r, patch)); writes.push({ table, op: 'update' }); return { data: hit, error: null }; }
        if (mode === 'delete') { tables[table] = rows.filter((r) => !hit.includes(r)); writes.push({ table, op: 'delete' }); return { data: hit, error: null }; }
        sel = hit.slice(0, limit);
        return { data: sel, error: null };
      };
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
        in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return q; },
        limit: (k: number) => { limit = k; return q; },
        update: (p: Row) => { mode = 'update'; patch = p; return q; },
        delete: () => { mode = 'delete'; return q; },
        maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
        insert: (row: Row) => {
          const dup = table === 'property_source_links' && rows.some((r) => r.source_system === row.source_system && r.source_id === row.source_id);
          const dupCase = table === 'identity_review_cases' && rows.some((r) => [r.property_id, r.candidate_property_id].sort().join() === [row.property_id, row.candidate_property_id].sort().join() && r.reason === row.reason);
          const out = dup || dupCase ? { data: null, error: { code: '23505', message: 'duplicate' } } : (() => { const made = { id: `${table}-${++n}`, ...(table === 'properties' ? { status: 'active' } : table === 'identity_review_cases' ? { status: 'open' } : {}), ...row }; rows.push(made); writes.push({ table, op: 'insert' }); return { data: made, error: null }; })();
          const b: any = { select: () => b, single: async () => out, then: (res: (v: unknown) => void) => res(out) };
          return b;
        },
        then: (res: (v: unknown) => void) => res(run()),
      };
      return q;
    },
  };
  return db;
}
const lead = (id: string, address: string, extra: Row = {}) => ({ id, address, city: 'Denver', state: 'CO', zip: '80202', organization_id: 'org-1', ...extra });

describe('registering a lead', () => {
  it('creates a property for a new address and links the lead to it', async () => {
    const db = memoryDb();
    const out = await registerLead(db as never, lead('L1', '12 Pine Street'));
    expect(out.status).toBe('created');
    expect(db.tables.properties).toHaveLength(1);
    expect(db.tables.properties[0]).toMatchObject({ street_number: '12', street_name: 'pine st', zip5: '80202', organization_id: 'org-1', address_key: '80202|12|pine st' });
    expect(db.tables.property_source_links[0]).toMatchObject({ source_system: 'avyro', source_id: 'L1', match_method: 'created', property_id: out.propertyId });
  });

  it('links a second lead at the same address to the same property, however it is spelled', async () => {
    const db = memoryDb();
    const first = await registerLead(db as never, lead('L1', '12 Pine Street'));
    const second = await registerLead(db as never, lead('L2', '12 pine st.'));
    expect(second).toMatchObject({ status: 'linked', propertyId: first.propertyId });
    expect(db.tables.properties).toHaveLength(1);
    expect(db.tables.property_source_links.map((l) => l.source_id)).toEqual(['L1', 'L2']);
  });

  it('is safe to run twice for the same lead', async () => {
    const db = memoryDb();
    await registerLead(db as never, lead('L1', '12 Pine Street'));
    const writesBefore = db.writes.length;
    expect((await registerLead(db as never, lead('L1', '12 Pine Street'))).status).toBe('exists');
    expect(db.writes).toHaveLength(writesBefore);
  });

  it('puts different units of one building under one property', async () => {
    const db = memoryDb();
    const a = await registerLead(db as never, lead('L1', '400 Main St Apt 2B'));
    const b = await registerLead(db as never, lead('L2', '400 Main St #3C'));
    expect(b).toMatchObject({ status: 'linked', propertyId: a.propertyId });
    expect(db.tables.property_units.map((u) => u.unit_label).sort()).toEqual(['2b', '3c']);
  });

  it('flags a near-miss spelling for a person instead of merging it', async () => {
    const db = memoryDb();
    const a = await registerLead(db as never, lead('L1', '12 Pine Street'));
    const b = await registerLead(db as never, lead('L2', '12 Pyne Street'));
    expect(b.status).toBe('created');
    expect(b.propertyId).not.toBe(a.propertyId);
    expect(b.reviews).toBe(1);
    expect(db.tables.identity_review_cases[0]).toMatchObject({ reason: 'similar_address', property_id: b.propertyId, candidate_property_id: a.propertyId, status: 'open' });
  });

  it('does not use an address it cannot trust, and keeps organizations apart', async () => {
    const db = memoryDb();
    expect((await registerLead(db as never, lead('L1', 'PO Box 9'))).status).toBe('unresolvable');
    expect((await registerLead(db as never, lead('L2', '12 Pine Street', { zip: '' }))).status).toBe('unresolvable');
    expect(db.tables.properties).toEqual([]);
    await registerLead(db as never, lead('L3', '12 Pine Street'));
    const other = await registerLead(db as never, lead('L4', '12 Pine Street', { organization_id: 'org-2' }));
    expect(other.status).toBe('created'); // another organization never shares a property
    expect(db.tables.properties).toHaveLength(2);
  });

  it('never writes to leads', async () => {
    const db = memoryDb({ leads: [{ id: 'L1', address: '12 Pine Street' }] });
    await registerLead(db as never, lead('L1', '12 Pine Street'));
    await registerLead(db as never, lead('L2', '12 Pyne Street'));
    expect(db.writes.filter((w) => w.table === 'leads')).toEqual([]);
  });
});

describe('settling a review case', () => {
  async function twoNearProperties() {
    const db = memoryDb();
    const a = await registerLead(db as never, lead('L1', '12 Pine Street'));
    const b = await registerLead(db as never, lead('L2', '12 Pyne Street'));
    return { db, a, b, caseId: db.tables.identity_review_cases[0].id as string };
  }

  it('"same property" folds the duplicate into the kept one and changes no lead', async () => {
    const { db, a, b, caseId } = await twoNearProperties();
    expect(await resolveReview(db as never, { caseId, decision: 'merge', userId: 'u1', organizationId: 'org-1' })).toEqual({ ok: true });
    expect(db.tables.property_source_links.map((l) => l.property_id)).toEqual([b.propertyId, b.propertyId]);
    expect(db.tables.properties.find((p) => p.id === a.propertyId)).toMatchObject({ status: 'merged', merged_into: b.propertyId });
    expect(db.tables.identity_review_cases[0]).toMatchObject({ status: 'merged', resolved_by: 'u1' });
    expect(db.writes.filter((w) => w.table === 'leads')).toEqual([]);
  });

  it('"keep separate" only records the decision', async () => {
    const { db, caseId } = await twoNearProperties();
    await resolveReview(db as never, { caseId, decision: 'keep_separate', userId: 'u1' });
    expect(db.tables.properties.every((p) => p.status === 'active')).toBe(true);
    expect(db.tables.identity_review_cases[0].status).toBe('kept_separate');
  });

  it('refuses a case that is already settled, unknown, or from another organization', async () => {
    const { db, caseId } = await twoNearProperties();
    await resolveReview(db as never, { caseId, decision: 'keep_separate', userId: 'u1' });
    expect(await resolveReview(db as never, { caseId, decision: 'merge', userId: 'u1' })).toMatchObject({ ok: false });
    expect(await resolveReview(db as never, { caseId: 'nope', decision: 'merge', userId: 'u1' })).toMatchObject({ ok: false });
    const other = await twoNearProperties();
    expect(await resolveReview(other.db as never, { caseId: other.caseId, decision: 'merge', userId: 'u', organizationId: 'org-9' })).toMatchObject({ ok: false });
  });
});
