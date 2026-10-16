import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isSuppressed } from '@/lib/services/smsConsent';
import { advancePipeline } from '@/lib/services/leadPipeline';

type Db = ReturnType<typeof getSupabaseAdmin>;

const HOA_WORDS = /\b(h\.?o\.?a\.?s?|home ?owners?'?s?'? associations?|condo(minium)? associations?|cc ?& ?rs?|ccrs?|covenants?|deed restrictions?)\b/i;
const OBJECTION_WORDS = /\b(not|can ?not|can'?t|cant|won'?t|wont|doesn'?t|doesnt|don'?t|dont|isn'?t|violat\w*|prohibit\w*|forbid\w*|against|restrict\w*|ban(ned)?|no)\b/i;

/** A reply that says an HOA, condo association, CC&Rs or deed restriction stops them. A plain question about the HOA is not one. */
export const isHoaObjection = (t: string) => HOA_WORDS.test(t) && OBJECTION_WORDS.test(t);

export type HoaOutcome = 'restricts' | 'allows' | 'unknown';

/**
 * What we can actually see about this home's HOA: a restriction noted on the lead, or what the owner told us in our questionnaire.
 * We hold no HOA rules for most homes (no HOA data feed), so 'unknown' is the common answer and is never presented as a finding.
 */
export async function hoaFacts(db: Db, leadId: string): Promise<{ outcome: HoaOutcome; detail: string | null }> {
  const { data: lead } = await db.from('leads').select('tags').eq('id', leadId).maybeSingle();
  const tags = ((lead?.tags as string[] | null) ?? []).map(t => t.toLowerCase());
  if (tags.some(t => /^hoa[\s:_-]*(block|restrict)/.test(t))) return { outcome: 'restricts', detail: 'lead note' };
  const { data: qs } = await db.from('homeowner_questionnaires').select('has_hoa,hoa_allows_str').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(3);
  for (const q of qs ?? []) {
    if (q.hoa_allows_str === false) return { outcome: 'restricts', detail: 'questionnaire: HOA does not allow short-term rentals' };
    if (q.hoa_allows_str === true) return { outcome: 'allows', detail: 'questionnaire: HOA allows short-term rentals' };
    if (q.has_hoa === false) return { outcome: 'allows', detail: 'questionnaire: no HOA' };
  }
  return { outcome: 'unknown', detail: null };
}

/**
 * The automatic text answer to a homeowner who says an HOA stops them. We only state what our own records show:
 * a known restriction closes the lead politely, a record that says otherwise asks for the HOA's notice, and with nothing on file
 * we make no claim and ask what the HOA says. A person is alerted in every case. At most one such reply per lead per day.
 */
export async function hoaReply(db: Db, leadId: string, from: string): Promise<string | null> {
  if (await isSuppressed(db, from)) return null;
  const { data: lead } = await db.from('leads').select('address,contact_name,tags,sms_opted_out_at').eq('id', leadId).maybeSingle();
  if (!lead?.address || lead.sms_opted_out_at) return null;
  const { count } = await db.from('outreach_history').select('id', { count: 'exact', head: true }).eq('lead_id', leadId).eq('metadata->>kind', 'auto_hoa')
    .gte('sent_at', new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) > 0) return null;

  const { outcome, detail } = await hoaFacts(db, leadId);
  const street = String(lead.address).split(',')[0];
  const first = String(lead.contact_name ?? '').trim().split(/\s+/)[0];
  const who = /^[A-Za-z'-]{2,}$/.test(first) ? `, ${first}` : '';
  const stop = 'Reply STOP to opt out.';
  let message: string;
  if (outcome === 'restricts') {
    message = `Thanks${who}, our notes also show an HOA restriction at ${street}, so we won't pursue a short-term rental there. If that changes, or you own a home outside an HOA, just text us. ${stop}`;
  } else if (outcome === 'allows') {
    message = `Thanks${who}, for flagging it. Our records say ${detail === 'questionnaire: no HOA' ? 'there is no HOA' : 'your HOA allows short-term rentals'} at ${street}. If your HOA sent a notice saying otherwise, could you text us what it says? A specialist will review it with you. ${stop}`;
  } else {
    message = `Thanks${who}, for letting us know. HOA rules differ by community and we can't see yours from here. If you can text us what your HOA says about rentals, a specialist will check it with you; otherwise we'll leave ${street} alone. ${stop}`;
  }

  const now = new Date().toISOString();
  const tags = [...new Set([...((lead.tags as string[] | null) ?? []), `hoa:${outcome === 'unknown' ? 'reported' : outcome}`])];
  await db.from('leads').update(outcome === 'restricts' ? { tags, stage: 'Not a Fit' } : { tags }).eq('id', leadId);
  if (outcome === 'restricts') await advancePipeline(db, leadId, 'rejected').catch(() => null);
  await db.from('outreach_history').insert({ lead_id: leadId, channel: 'sms', status: 'sent', sent_at: now, metadata: { kind: 'auto_hoa', direction: 'outbound', to: from, message, outcome, source: detail, twilio_status: 'queued' } });
  return message;
}
