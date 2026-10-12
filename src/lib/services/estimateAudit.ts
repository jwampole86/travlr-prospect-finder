import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { buildHomeownerReport } from '@/lib/homeownerEstimate';
import type { HomeownerReport } from '@/lib/homeownerEstimateTypes';
import { getRentalEstimate } from '@/lib/services/airdnaService';

type Db = ReturnType<typeof getSupabaseAdmin>;
type Row = Record<string, any>;

const kRound = (n: number) => Math.round(n / 1000);
const parseRange = (t: string | null | undefined) => { const m = String(t ?? '').match(/\$(\d+)K\s*-\s*\$(\d+)K/i); return m ? { lowK: Number(m[1]), highK: Number(m[2]) } : null; };
const addressOf = (l: Row) => [l.address, l.city, l.state, l.zip].filter(Boolean).join(', ');

async function pageAll<T>(f: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += 1000) { const { data, error } = await f(from, from + 999); if (error) throw error; all.push(...(data ?? [])); if ((data ?? []).length < 1000) break; }
  return all;
}
async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } }));
  return out;
}

/** What the page computes for this lead right now, plus the checks that say whether it can be trusted. */
function checks(report: HomeownerReport, sent: { lowK: number; highK: number } | null, shownNet: number | null, lead: Row) {
  const cons = report.scenarios[0].annualNet; const exp = report.scenarios[1].annualNet; const opt = report.scenarios[2].annualNet;
  const pageLowK = kRound(cons); const pageHighK = kRound(opt);
  const textMatchesPage = sent ? Math.abs(sent.lowK - pageLowK) <= 1 && Math.abs(sent.highK - pageHighK) <= 1 : null;
  const shownMatchesNow = shownNet != null ? Math.abs(shownNet - exp) / Math.max(exp, 1) <= 0.02 : null;
  const flags: string[] = [];
  if (report.property.assumedBeds) flags.push('Bedrooms not on file: the page assumes 3 bedrooms');
  if (report.basis === 'STATE') flags.push('Built from regional averages only (no ZIP rent data)');
  else if (report.basis === 'MARKET') flags.push('Built from ZIP rent data and a typical home, not this home\'s own details');
  if (!lead.price) flags.push('No price on file');
  if (/,\s*[A-Za-z]{2}\s+\d{5}\s*$/.test(String(lead.address ?? ''))) flags.push('Address text still contains city, state and ZIP');
  if (report.regulation.tone === 'bad') flags.push('Short-term rentals are restricted or prohibited here');
  else if (!report.regulation.found) flags.push('Local rules not yet documented');
  if (textMatchesPage === false) flags.push(`The text said $${sent!.lowK}K-$${sent!.highK}K but the page now shows $${pageLowK}K-$${pageHighK}K`);
  if (shownMatchesNow === false) flags.push('The net the page recorded showing differs from today\'s calculation');
  return { pageLowK, pageHighK, textMatchesPage, shownMatchesNow, flags };
}

const LEAD_COLS = 'id,address,city,state,zip,beds,baths,property_type,price,price_type,estimated_monthly_rent_ai,estimated_adr,estimated_occupancy,source,program,verified_address';

/** One row per texted lead with a consistency check between the text, the page and the estimate engine. */
export async function auditList(db: Db, batch: string, scope: 'engaged' | 'all') {
  const rows = await pageAll<Row>((a, b) => { let q = db.from('sms_lead_engagement').select('lead_id,batch,audience,range_text,human_clicks,estimate_viewed,time_on_page_s,deepest_step,estimate_submitted_at,contact_requested_at,chat_questions,report_downloaded,device,first_click_at,reply_intent,temperature,state').range(a, b); if (batch !== 'all') q = q.eq('batch', batch); return q; });
  const picked = rows.filter(r => scope === 'all' || r.human_clicks > 0 || r.estimate_viewed || r.deepest_step).slice(0, 500);
  const ids = picked.map(r => r.lead_id as string);

  const leads = new Map<string, Row>();
  for (let i = 0; i < ids.length; i += 100) { const { data } = await db.from('leads').select(LEAD_COLS).in('id', ids.slice(i, i + 100)); for (const l of data ?? []) leads.set(l.id, l); }
  const shown = new Map<string, number>(); const seen = new Map<string, Set<string>>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await db.from('estimate_journey_events').select('lead_id,event,data,created_at').in('lead_id', ids.slice(i, i + 100)).order('created_at', { ascending: true }).limit(5000);
    for (const e of data ?? []) { const s = seen.get(e.lead_id) ?? new Set<string>(); s.add(e.event); seen.set(e.lead_id, s); if (e.event === 'estimate_shown' && typeof (e.data as Row)?.net === 'number') shown.set(e.lead_id, (e.data as Row).net); }
  }

  const out = await pool(picked, 8, async r => {
    const l = leads.get(r.lead_id); if (!l) return null;
    const report = await buildHomeownerReport(addressOf(l)).catch(() => null);
    const sent = parseRange(r.range_text);
    const c = report ? checks(report, sent, shown.get(r.lead_id) ?? null, l) : null;
    return {
      leadId: r.lead_id as string, batch: r.batch as string, address: addressOf(l), sentRange: r.range_text as string | null,
      pageRange: c ? `$${c.pageLowK}K-$${c.pageHighK}K` : null, textMatchesPage: c?.textMatchesPage ?? null, shownMatchesNow: c?.shownMatchesNow ?? null,
      basis: report?.basis ?? null, assumedBeds: report?.property.assumedBeds ?? null, flags: c?.flags ?? ['Could not compute the estimate'],
      clicked: r.human_clicks > 0, viewed: !!r.estimate_viewed, timeOnPage: r.time_on_page_s as number | null, deepest: r.deepest_step as string | null, submitted: !!r.estimate_submitted_at,
      device: r.device as string | null, hadPageEvents: seen.has(r.lead_id), temperature: r.temperature as string,
    };
  });
  const list = out.filter((x): x is NonNullable<typeof x> => !!x);

  const n = list.length; const opened = list.filter(x => x.clicked);
  const times = list.map(x => x.timeOnPage).filter((t): t is number => t != null).sort((a, b) => a - b);
  const summary = {
    checked: n, textMatchesPage: list.filter(x => x.textMatchesPage === true).length, textMismatch: list.filter(x => x.textMatchesPage === false).length,
    shownMismatch: list.filter(x => x.shownMatchesNow === false).length,
    basis: { PROPERTY: list.filter(x => x.basis === 'PROPERTY').length, MARKET: list.filter(x => x.basis === 'MARKET').length, STATE: list.filter(x => x.basis === 'STATE').length },
    assumedBeds: list.filter(x => x.assumedBeds).length,
    funnel: { texted: rows.length, opened: rows.filter(r => r.human_clicks > 0).length, viewedEstimate: rows.filter(r => r.estimate_viewed).length, startedForm: rows.filter(r => ['contact', 'questionnaire', 'submitted'].includes(r.deepest_step)).length, submitted: rows.filter(r => r.estimate_submitted_at).length },
    openedWithoutPageEvents: opened.filter(x => !x.hadPageEvents).length, medianSeconds: times.length ? times[Math.floor(times.length / 2)] : null,
    mobileShare: opened.length ? Math.round((opened.filter(x => x.device === 'mobile').length / opened.length) * 100) : null,
  };
  return { rows: list.sort((a, b) => Number(b.viewed) - Number(a.viewed) || Number(b.clicked) - Number(a.clicked)), summary };
}

/** Everything about one homeowner: what the page shows, what we hold, the text we sent, the journey, and an optional independent benchmark. */
export async function auditDetail(db: Db, leadId: string, withBenchmark: boolean) {
  const { data: lead } = await db.from('leads').select(LEAD_COLS).eq('id', leadId).maybeSingle();
  if (!lead) return { error: 'Unknown lead' as const };
  const [{ data: eng }, { data: sentRow }, { data: ev }] = await Promise.all([
    db.from('sms_lead_engagement').select('*').eq('lead_id', leadId).order('scheduled_for', { ascending: false }).limit(1).maybeSingle(),
    db.from('outreach_history').select('metadata,sent_at').eq('lead_id', leadId).eq('channel', 'sms').eq('metadata->>kind', 'estimate_outreach').order('sent_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('estimate_journey_events').select('event,data,created_at,session_id').eq('lead_id', leadId).order('created_at', { ascending: true }).limit(200),
  ]);
  const address = addressOf(lead);
  const report = await buildHomeownerReport(address);
  const shownNet = [...(ev ?? [])].reverse().find(e => e.event === 'estimate_shown' && typeof (e.data as Row)?.net === 'number')?.data as Row | undefined;
  const sent = parseRange(eng?.range_text ?? (sentRow?.metadata as Row)?.range);
  const c = checks(report, sent, shownNet ? (shownNet.net as number) : null, lead);

  let benchmark: Record<string, unknown> | { error: string } | null = null;
  if (withBenchmark) {
    const res = await getRentalEstimate({ address, bedrooms: lead.beds ? Math.round(Number(lead.beds)) : undefined, bathrooms: lead.baths ? Number(lead.baths) : undefined, currency: 'usd' });
    if (!res.ok || !res.estimate) benchmark = { error: res.error ?? 'AirDNA could not estimate this address' };
    else {
      const e = res.estimate; const ours = report.scenarios[1];
      benchmark = {
        source: 'AirDNA Rentalizer', market: e.marketName ?? null, submarket: e.submarketName ?? null, adr: e.avgDailyRate ?? null, occupancyPct: e.occupancyRate != null ? Math.round(e.occupancyRate * (e.occupancyRate <= 1 ? 100 : 1)) : null, annualGross: e.annualRevenue ?? null,
        ours: { adr: ours.adr, occupancyPct: ours.occupancy, annualGross: ours.grossMonthly * 12 },
        grossRatio: e.annualRevenue ? Math.round((ours.grossMonthly * 12 / e.annualRevenue) * 100) / 100 : null,
      };
    }
  }

  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://prospect.staytrvlr.com').replace(/\/$/, '');
  return {
    leadId, address, liveUrl: `${base}/estimate?address=${encodeURIComponent(address).replace(/%20/g, '+')}`,
    lead: { beds: lead.beds, baths: lead.baths, type: lead.property_type, price: lead.price, priceType: lead.price_type, rentAi: lead.estimated_monthly_rent_ai, adr: lead.estimated_adr, occupancy: lead.estimated_occupancy, source: lead.source, program: lead.program },
    sent: { message: ((sentRow?.metadata as Row)?.message as string) ?? null, range: eng?.range_text ?? null, at: sentRow?.sent_at ?? null, variant: (sentRow?.metadata as Row)?.variant ?? null },
    report: { basis: report.basis, basisLabel: report.basisLabel, property: report.property, longTermRent: report.longTermRent, scenarios: report.scenarios, advantageMonthly: report.advantageMonthly, advantageAnnual: report.advantageAnnual, regulationHeadline: report.regulation.headline, regulationFound: report.regulation.found, costs: report.costs },
    checks: { ...c, recordedNet: shownNet ? shownNet.net : null },
    engagement: eng ? { clicks: eng.human_clicks, viewed: eng.estimate_viewed, timeOnPage: eng.time_on_page_s, deepest: eng.deepest_step, chat: eng.chat_questions, submitted: !!eng.estimate_submitted_at, device: eng.device, os: eng.os, reply: eng.reply_intent } : null,
    journey: (ev ?? []).map(e => ({ at: e.created_at, event: e.event, data: e.data })),
    benchmark,
  };
}
