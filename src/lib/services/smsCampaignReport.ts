import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { classifyReply } from '@/lib/services/smsConsent';

type Db = ReturnType<typeof getSupabaseAdmin>;
type Meta = Record<string, any>;

interface Row { leadId: string; meta: Meta }
interface Bucket { texts: number; delivered: number; failed: number; clicked: number; replied: number; yes: number; optOut: number; estimates: number }

const empty = (): Bucket => ({ texts: 0, delivered: 0, failed: 0, clicked: 0, replied: 0, yes: 0, optOut: 0, estimates: 0 });
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const rangeBucket = (r: string) => { const hi = Number((r.split('-')[1] ?? '').replace(/\D/g, '')); return hi >= 150 ? '$150K+' : hi >= 80 ? '$80-149K' : hi >= 50 ? '$50-79K' : '<$50K'; };

/** Everything needed to judge a text campaign and improve the next one, computed straight from the database. */
export async function buildCampaignReport(db: Db, batch: string) {
  const { data: hist } = await db.from('outreach_history').select('lead_id, sent_at, metadata').eq('channel', 'sms').eq('metadata->>batch', batch).limit(5000);
  const rows: Row[] = (hist ?? []).filter(h => h.lead_id).map(h => ({ leadId: h.lead_id as string, meta: (h.metadata ?? {}) as Meta }));
  const leadIds = rows.map(r => r.leadId);
  const start = (hist ?? []).map(h => String(h.sent_at)).sort()[0] ?? new Date().toISOString();
  if (!rows.length) return { batch, error: 'No messages found for this batch' };

  const chunk = <T,>(a: T[], n = 150) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  const [clicks, replies, optIns, optOuts, reports] = await Promise.all([
    Promise.all(chunk(leadIds).map(c => db.from('link_clicks').select('lead_id, clicked_at').eq('sequence_name', 'estimate_outreach').in('lead_id', c).not('clicked_at', 'is', null))),
    Promise.all(chunk(leadIds).map(c => db.from('outreach_history').select('lead_id, metadata, sent_at').eq('channel', 'sms').eq('status', 'replied').in('lead_id', c).gte('sent_at', start))),
    Promise.all(chunk(leadIds).map(c => db.from('leads').select('id').eq('sms_opt_in', true).eq('opt_in_source', 'sms_reply_yes').in('id', c))),
    Promise.all(chunk(leadIds).map(c => db.from('leads').select('id').not('sms_opted_out_at', 'is', null).in('id', c))),
    // A report email is only sent when a homeowner submits the estimate form, so it marks a completed submission.
    Promise.all(chunk(leadIds).map(c => db.from('outreach_history').select('lead_id').eq('channel', 'email').eq('metadata->>kind', 'homeowner_report').in('lead_id', c).gte('sent_at', start))),
  ]);
  const set = (parts: Array<{ data: Array<Record<string, any>> | null }>, key: string) => new Set(parts.flatMap(p => (p.data ?? []).map(r => r[key] as string)));
  const clicked = set(clicks, 'lead_id'); const replied = set(replies, 'lead_id'); const yes = set(optIns, 'id'); const out = set(optOuts, 'id'); const est = set(reports, 'lead_id');

  const intents: Record<string, number> = {};
  for (const p of replies) for (const r of p.data ?? []) { const i = String((r.metadata as Meta)?.intent ?? classifyReply(String((r.metadata as Meta)?.body ?? ''))); intents[i] = (intents[i] ?? 0) + 1; }

  const total = empty(); const groups: Record<string, Record<string, Bucket>> = { variant: {}, writtenBy: {}, greeting: {}, segments: {}, state: {}, estimate: {} };
  const errors: Record<string, number> = {}; const statuses: Record<string, number> = {};
  for (const { leadId, meta } of rows) {
    const status = String(meta.twilio_status ?? 'scheduled'); statuses[status] = (statuses[status] ?? 0) + 1;
    if (meta.twilio_error_code) errors[`${meta.twilio_error_code}`] = (errors[`${meta.twilio_error_code}`] ?? 0) + 1;
    const flags = { delivered: status === 'delivered' ? 1 : 0, failed: ['failed', 'undelivered', 'canceled'].includes(status) ? 1 : 0, clicked: +clicked.has(leadId), replied: +replied.has(leadId), yes: +yes.has(leadId), optOut: +out.has(leadId), estimates: +est.has(leadId) };
    const keys: Record<string, string> = { variant: String(meta.variant ?? '?'), writtenBy: String(meta.generated_by ?? '?'), greeting: meta.named ? 'named' : 'generic', segments: `${meta.segments ?? '?'} seg`, state: String(meta.state ?? '?'), estimate: rangeBucket(String(meta.range ?? '')) };
    for (const b of [total, ...Object.entries(keys).map(([g, k]) => (groups[g][k] ??= empty()))]) {
      b.texts++; for (const f of Object.keys(flags) as Array<keyof typeof flags>) b[f] += flags[f];
    }
  }
  const rates = (b: Bucket) => ({ ...b, deliveredPct: pct(b.delivered, b.texts), clickPct: pct(b.clicked, b.texts), replyPct: pct(b.replied, b.texts), yesPct: pct(b.yes, b.texts), optOutPct: pct(b.optOut, b.texts), estimatePct: pct(b.estimates, b.texts) });
  const grouped = Object.fromEntries(Object.entries(groups).map(([g, m]) => [g, Object.fromEntries(Object.entries(m).sort((a, b) => b[1].texts - a[1].texts).map(([k, b]) => [k, rates(b)]))]));
  return { batch, statuses, deliveryErrors: errors, replyIntents: intents, total: rates(total), by: grouped };
}
