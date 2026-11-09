import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

type Row = Record<string, unknown>;
const label = (l: Row | undefined, fallback: string) => (l ? [l.address, l.city, l.state].filter(Boolean).join(', ') || fallback : fallback);

/**
 * GET: the property record behind a lead: which other records share this property (other leads, other units, other systems) and which
 * possible duplicates are waiting for a person to decide. Admin only, and only within the admin's organization.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { leadId } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(leadId)) return NextResponse.json({ error: 'Bad lead id' }, { status: 400 });
  const org = auth.actor.organizationId;
  const db = getSupabaseAdmin();
  const scope = <T,>(q: T) => (org ? (q as unknown as { eq: (c: string, v: string) => T }).eq('organization_id', org) : q);

  const { data: link } = await scope(db.from('property_source_links').select('property_id, unit_id, match_method, confidence').eq('source_system', 'avyro').eq('source_id', leadId)).maybeSingle();
  if (!link) return NextResponse.json({ linked: false });
  const propertyId = String(link.property_id);

  const [{ data: property }, { data: links }, { data: cases }] = await Promise.all([
    scope(db.from('properties').select('id, street_number, street_name, city, state, zip5, status').eq('id', propertyId)).maybeSingle(),
    scope(db.from('property_source_links').select('source_system, source_id, unit_id').eq('property_id', propertyId)).limit(100),
    scope(db.from('identity_review_cases').select('id, property_id, candidate_property_id, reason, score, details').eq('status', 'open')).limit(50),
  ]);

  const mine = ((cases as Row[]) ?? []).filter((c) => c.property_id === propertyId || c.candidate_property_id === propertyId);
  const otherPropertyIds = mine.map((c) => String(c.property_id === propertyId ? c.candidate_property_id : c.property_id));
  const { data: otherLinks } = otherPropertyIds.length
    ? await scope(db.from('property_source_links').select('property_id, source_system, source_id').in('property_id', otherPropertyIds).eq('source_system', 'avyro')).limit(100)
    : { data: [] as Row[] };

  const leadIds = [...new Set([...((links as Row[]) ?? []).filter((l) => l.source_system === 'avyro').map((l) => String(l.source_id)), ...((otherLinks as Row[]) ?? []).map((l) => String(l.source_id))])].filter((id) => id !== leadId);
  const { data: leads } = leadIds.length ? await db.from('leads').select('id, address, city, state, contact_name').in('id', leadIds) : { data: [] as Row[] };
  const byId = new Map(((leads as Row[]) ?? []).map((l) => [String(l.id), l]));

  return NextResponse.json({
    linked: true,
    property,
    unit: link.unit_id ? true : false,
    otherRecords: ((links as Row[]) ?? []).filter((l) => !(l.source_system === 'avyro' && l.source_id === leadId)).map((l) => ({
      system: l.source_system, id: String(l.source_id), name: l.source_system === 'avyro' ? label(byId.get(String(l.source_id)), String(l.source_id)) : null,
    })),
    reviews: mine.map((c) => {
      const other = String(c.property_id === propertyId ? c.candidate_property_id : c.property_id);
      return {
        id: c.id, reason: c.reason, score: c.score, detail: (c.details as { detail?: string } | null)?.detail ?? null,
        records: ((otherLinks as Row[]) ?? []).filter((l) => l.property_id === other).map((l) => ({ id: String(l.source_id), name: label(byId.get(String(l.source_id)), String(l.source_id)) })),
      };
    }),
  });
}
