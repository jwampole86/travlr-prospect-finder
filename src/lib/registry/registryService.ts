import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { normalizeAddress, type NormalizedAddress } from './address';
import { resolveIdentity, type PropertyRef } from './identity';

type Db = ReturnType<typeof getSupabaseAdmin>;

export interface LeadForRegistry {
  id: string; address?: string | null; city?: string | null; state?: string | null; zip?: string | null;
  lat?: number | null; lng?: number | null; organization_id?: string | null;
}

export type RegisterOutcome = { status: 'exists' | 'unresolvable' | 'linked' | 'created'; propertyId?: string; reviews?: number };

type Row = Record<string, unknown>;
const realCoord = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n !== 0 ? n : null);

/** Rebuilds the address of a stored property so identity resolution can compare it. */
function refOf(p: Row, units: string[]): PropertyRef {
  const address: NormalizedAddress = {
    streetNumber: String(p.street_number ?? ''), streetName: String(p.street_name ?? ''), unit: null, city: String(p.city ?? ''), state: String(p.state ?? ''),
    zip5: String(p.zip5 ?? ''), key: String(p.address_key ?? ''), usable: true,
  };
  return { id: String(p.id), address, lat: realCoord(p.lat), lng: realCoord(p.lng), units };
}

/**
 * Gives one AVYRO lead its place in the property registry: linked to the property it is at, or a new property if there is none. Exact, unambiguous
 * matches are linked on their own; anything merely similar becomes a review case for a person. This only adds registry rows: it never changes,
 * merges or deletes a lead, so how leads are found and matched in the app is exactly as before. Safe to run again for the same lead.
 */
export async function registerLead(db: Db, lead: LeadForRegistry): Promise<RegisterOutcome> {
  const org = lead.organization_id ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgFilter = (q: any) => (org ? q.eq('organization_id', org) : q);

  const existing = await orgFilter(db.from('property_source_links').select('property_id').eq('source_system', 'avyro').eq('source_id', lead.id)).maybeSingle();
  if (existing.data) return { status: 'exists', propertyId: String((existing.data as Row).property_id) };

  const a = normalizeAddress({ address: lead.address, city: lead.city, state: lead.state, zip: lead.zip });
  if (!a.usable) return { status: 'unresolvable' };

  // Candidates: the same building, and other buildings on the same street number in the same ZIP (for near-miss spellings).
  const [same, near] = await Promise.all([
    orgFilter(db.from('properties').select('*').eq('status', 'active').eq('address_key', a.key)).limit(10),
    orgFilter(db.from('properties').select('*').eq('status', 'active').eq('zip5', a.zip5).eq('street_number', a.streetNumber)).limit(25),
  ]);
  const rows = new Map<string, Row>();
  for (const p of [...((same.data as Row[]) ?? []), ...((near.data as Row[]) ?? [])]) rows.set(String(p.id), p);
  const ids = [...rows.keys()];
  const unitsBy = new Map<string, string[]>();
  if (ids.length) {
    const { data } = await db.from('property_units').select('property_id, unit_label').in('property_id', ids);
    for (const u of (data as Row[]) ?? []) unitsBy.set(String(u.property_id), [...(unitsBy.get(String(u.property_id)) ?? []), String(u.unit_label)]);
  }
  const candidates = [...rows.values()].map((p) => refOf(p, unitsBy.get(String(p.id)) ?? []));
  const resolution = resolveIdentity({ address: a, lat: realCoord(lead.lat), lng: realCoord(lead.lng) }, candidates);
  if (resolution.action === 'unresolvable') return { status: 'unresolvable' };

  const withOrg = (row: Row) => (org ? { ...row, organization_id: org } : row);
  const unitFor = async (propertyId: string, unit: string | null): Promise<string | null> => {
    if (!unit) return null;
    const found = await db.from('property_units').select('id').eq('property_id', propertyId).eq('unit_label', unit).maybeSingle();
    if (found.data) return String((found.data as Row).id);
    const made = await db.from('property_units').insert(withOrg({ property_id: propertyId, unit_label: unit })).select('id').single();
    return made.data ? String((made.data as Row).id) : null;
  };

  if (resolution.action === 'link') {
    const unitId = await unitFor(resolution.propertyId, resolution.unit);
    const { error } = await db.from('property_source_links').insert(withOrg({
      property_id: resolution.propertyId, unit_id: unitId, source_system: 'avyro', source_id: lead.id, match_method: 'exact_address', confidence: resolution.confidence,
    }));
    if (error && error.code !== '23505') throw new Error(error.message);
    return { status: 'linked', propertyId: resolution.propertyId };
  }

  const created = await db.from('properties').insert(withOrg({
    kind: a.unit ? 'building' : 'parcel', street_number: a.streetNumber, street_name: a.streetName, city: a.city || null, state: a.state || null,
    zip5: a.zip5, address_key: a.key, lat: realCoord(lead.lat), lng: realCoord(lead.lng),
  })).select('id').single();
  if (created.error || !created.data) throw new Error(created.error?.message ?? 'could not create the property');
  const propertyId = String((created.data as Row).id);
  const unitId = await unitFor(propertyId, a.unit);
  const link = await db.from('property_source_links').insert(withOrg({
    property_id: propertyId, unit_id: unitId, source_system: 'avyro', source_id: lead.id, match_method: 'created', confidence: 1,
  }));
  if (link.error && link.error.code !== '23505') throw new Error(link.error.message);

  let reviews = 0;
  for (const r of resolution.reviews) {
    const { error } = await db.from('identity_review_cases').insert(withOrg({
      property_id: propertyId, candidate_property_id: r.candidateId, reason: r.reason, score: r.score, details: { detail: r.detail, lead_id: lead.id },
    }));
    if (!error) reviews++; // a pair already under review is simply left as it is
  }
  return { status: 'created', propertyId, reviews };
}

/** Settles one review case. "Same property" folds the duplicate property into the kept one (its links and units move over); nothing about any lead changes. */
export async function resolveReview(db: Db, input: { caseId: string; decision: 'merge' | 'keep_separate'; userId: string; organizationId?: string | null }): Promise<{ ok: true } | { ok: false; error: string }> {
  let q = db.from('identity_review_cases').select('*').eq('id', input.caseId);
  if (input.organizationId) q = q.eq('organization_id', input.organizationId);
  const { data: c } = await q.maybeSingle();
  const rc = c as Row | null;
  if (!rc) return { ok: false, error: 'Not found.' };
  if (rc.status !== 'open') return { ok: false, error: 'This case was already settled.' };
  const now = new Date().toISOString();

  if (input.decision === 'merge') {
    const keep = String(rc.property_id), drop = String(rc.candidate_property_id);
    const { data: keepUnits } = await db.from('property_units').select('id, unit_label').eq('property_id', keep);
    const have = new Map(((keepUnits as Row[]) ?? []).map((u) => [String(u.unit_label), String(u.id)]));
    const { data: dropUnits } = await db.from('property_units').select('id, unit_label').eq('property_id', drop);
    for (const u of (dropUnits as Row[]) ?? []) {
      const label = String(u.unit_label);
      if (have.has(label)) {
        await db.from('property_source_links').update({ unit_id: have.get(label) }).eq('unit_id', u.id);
        await db.from('property_units').delete().eq('id', u.id);
      } else {
        await db.from('property_units').update({ property_id: keep }).eq('id', u.id);
      }
    }
    const moved = await db.from('property_source_links').update({ property_id: keep }).eq('property_id', drop);
    if (moved.error) return { ok: false, error: 'Could not move the records over, so nothing was merged.' };
    await db.from('property_observations').update({ property_id: keep }).eq('property_id', drop);
    await db.from('properties').update({ status: 'merged', merged_into: keep }).eq('id', drop);
  }
  const { error } = await db.from('identity_review_cases').update({ status: input.decision === 'merge' ? 'merged' : 'kept_separate', resolved_by: input.userId, resolved_at: now }).eq('id', input.caseId);
  return error ? { ok: false, error: 'Could not record the decision.' } : { ok: true };
}
