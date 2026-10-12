import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyOwner } from '@/lib/services/ownerVerification';
import { offerUrl } from '@/lib/services/cohostOffer';

export const maxDuration = 60;

const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const splitMailing = (m: string) => { const x = m.match(/^(.*?),\s*([^,]+),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/); return x ? { street: x[1], city: x[2], state: x[3], zip: x[4] ?? '' } : { street: m, city: '', state: '', zip: '' }; };

/**
 * GET /api/cohost/export  (admin). CSV of owners we can reach, one row per property, for direct mail and for email or text campaigns.
 * Left out: properties matched to more than one listing, conflicting matches, owners who opted out or were marked declined or not a fit, and suppressed phone numbers.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const db = getSupabaseAdmin();
  const COLS = 'property_id,market,title,airbnb_url,bedrooms,bathrooms,is_luxury,is_elite,match_status,match_candidates,matched_address,matched_owner,pipeline_stage,address_match_confidence';
  const rows: Array<Record<string, any>> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('str_listings').select(COLS).eq('match_status', 'unique').not('matched_owner', 'is', null).order('property_id').range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...(data ?? [])); if ((data ?? []).length < 1000) break;
  }
  const count = new Map<string, number>(); for (const r of rows) count.set(r.matched_address, (count.get(r.matched_address) ?? 0) + 1);
  const { data: links } = await db.from('cohost_offer_links').select('code,property_id,opted_out_at').limit(5000);
  const link = new Map((links ?? []).map(l => [l.property_id as string, l]));
  const { data: sup } = await db.from('sms_suppressions').select('phone_e164').limit(50000);
  const suppressed = new Set((sup ?? []).map(s => s.phone_e164 as string));

  const header = ['Owner name', 'Owner type', 'Mail street', 'Mail city', 'Mail state', 'Mail zip', 'Phone (owner)', 'Email (owner)', 'Phone (manager/emergency)', 'Email (manager/emergency)', 'Skip-trace phones', 'Skip-trace emails', 'Property address', 'Market', 'Bedrooms', 'Tier', 'Verification', 'Permit holder', 'Registered agent', 'Agent address', 'Business office', 'Airbnb listing', 'Offer page'];
  const lines = [header.join(',')];
  for (const l of rows) {
    const o = l.matched_owner as Record<string, any>;
    if ((count.get(l.matched_address) ?? 1) > 1 || ['declined', 'not_a_fit'].includes(l.pipeline_stage) || link.get(l.property_id)?.opted_out_at) continue;
    const cands = (l.match_candidates as any[] | null) ?? [];
    const v = verifyOwner({ ...(l as any), candidate: cands[0] ?? null, candidateCount: cands.length, sharedAddressCount: 1 });
    if (v.level === 'conflict') continue;
    const found = (o.skipTrace?.results ?? []).map((r: any) => r.found).filter(Boolean);
    const phones = (p: unknown) => { const d = String(p ?? '').replace(/\D/g, '').slice(-10); return d.length === 10 && !suppressed.has(`+1${d}`) ? String(p) : ''; };
    const traced = found.flatMap((f: any) => (f.phones ?? []).map((x: any) => x.e164)).filter((p: string) => !suppressed.has(p));
    const email = (o.contact?.email ?? '') as string, ownerPhone = phones(o.contact?.phone), tracedEmails = found.flatMap((f: any) => f.emails ?? []);
    const mail = o.mailing ? splitMailing(String(o.mailing)) : o.entity?.mailingAddress ? splitMailing(String(o.entity.mailingAddress)) : { street: '', city: '', state: '', zip: '' };
    if (!mail.street && !ownerPhone && !email && !traced.length && !tracedEmails.length) continue;
    const code = link.get(l.property_id)?.code as string | undefined;
    lines.push([(o.names ?? []).join(' & '), o.type ?? '', mail.street, mail.city, mail.state, mail.zip, ownerPhone, email, phones(o.contact?.managerPhone), o.contact?.managerEmail ?? '', traced.slice(0, 3).join(' '), tracedEmails.slice(0, 3).join(' '), String(l.matched_address ?? '').replace(/, US.*$/, ''), l.market, l.bedrooms, l.is_elite ? 'ELITE' : l.is_luxury ? 'LUXURY' : '', v.label, o.permitHolder ?? '', o.entity?.agent ?? '', o.entity?.agentAddress ?? '', o.entity?.principalAddress ?? '', l.airbnb_url ?? '', code ? offerUrl(code) : ''].map(csvCell).join(','));
  }
  return new NextResponse(lines.join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="cohost-owners-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
}
