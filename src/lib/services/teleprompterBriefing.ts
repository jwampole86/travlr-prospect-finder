import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';

type Db = ReturnType<typeof getSupabaseAdmin>;
type Row = Record<string, any>;

const LEAD_FIELDS = 'id,address,city,state,zip,neighborhood,county,property_type_label,property_type,beds,baths,square_feet,year_built,price,price_type,listing_status,days_on_market_listing,days_on_market,amenities,has_pool,is_waterfront,regulation_status,prospect_score,luxury,stage,pipeline_status,program,cohost_service,existing_platforms,notes,contact_name,owner_name,last_contacted_at,outreach_status,next_followup_due,sms_opted_out_at,estimated_adr,estimated_occupancy,estimated_net_monthly';

const clip = (v: unknown, n = 300) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const money = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? `$${Math.round(Number(v)).toLocaleString('en-US')}` : null);
const when = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null);
const line = (label: string, value: unknown) => (value === null || value === undefined || value === '' || value === false ? null : `- ${label}: ${value}`);

const REGULATION_NOTE: Record<string, string> = {
  allowed: 'Our research found short-term rentals are allowed here. Still tell them to confirm any city permit.',
  restricted: 'Short-term rentals are restricted here. Do not promise they can operate; say we will check the local rules for their exact address.',
  prohibited: 'Short-term rentals appear prohibited here. Do not pitch short-term rental income; offer to confirm the local rules.',
};

/**
 * A plain-text briefing of one lead for the live call assistant: the property, what we already know about their market,
 * what we sent them, whether they opened it, what they replied and how earlier calls went. It carries no phone numbers or emails.
 * The "quotable estimate" is only the range we already texted them; internal modelled figures are marked do-not-quote.
 */
export async function buildLeadBriefing(db: Db, leadId: string): Promise<string> {
  const [leadRes, engRes, callRes] = await Promise.all([
    db.from('leads').select(LEAD_FIELDS).eq('id', leadId).maybeSingle(),
    db.from('sms_lead_engagement').select('batch,audience,range_text,delivered_at,first_click_at,estimate_viewed,time_on_page_s,deepest_step,report_downloaded,chat_questions,website_clicked,estimate_submitted_at,contact_requested_at,reply_at,reply_text,reply_intent,temperature,opted_out').eq('lead_id', leadId).order('updated_at', { ascending: false }).limit(1),
    db.from('call_sessions').select('started_at,call_outcome,outcome,call_summary,disposition_notes').eq('lead_id', leadId).order('started_at', { ascending: false }).limit(3),
  ]);
  const l = leadRes.data as Row | null;
  if (!l) return '';

  const place = [l.address, l.city, l.state].filter(Boolean).join(', ');
  const size = [l.beds ? `${l.beds} bed` : null, l.baths ? `${l.baths} bath` : null, l.square_feet ? `${Number(l.square_feet).toLocaleString('en-US')} sq ft` : null].filter(Boolean).join(', ');
  const amenities = Array.isArray(l.amenities) ? l.amenities.slice(0, 8).join(', ') : clip(l.amenities, 120);
  const reg = String(l.regulation_status ?? '').toLowerCase();
  const program = l.program === 'co_host' ? 'Co-host prospect (they run or list a rental already)' : 'Short-term-rental conversion prospect (homeowner program)';

  const profile = [
    line('Owner / contact', clip(l.contact_name || l.owner_name, 80)),
    line('Property', [place, l.neighborhood ? `(${l.neighborhood})` : null].filter(Boolean).join(' ')),
    line('Details', [clip(l.property_type_label || l.property_type, 40), size, l.year_built ? `built ${l.year_built}` : null, l.has_pool ? 'pool' : null, l.is_waterfront ? 'waterfront' : null].filter(Boolean).join(', ')),
    line('Amenities', amenities),
    line(l.price_type === 'rent' ? 'Monthly rent on file' : 'List price on file', money(l.price)),
    line('Listing status', clip(l.listing_status, 40)),
    line('Program', program),
    line('Co-host service interest', clip(l.cohost_service, 60)),
    line('Already listed on', Array.isArray(l.existing_platforms) ? l.existing_platforms.join(', ') : clip(l.existing_platforms, 60)),
    line('Short-term rental rules', l.regulation_status ? `${l.regulation_status}. ${REGULATION_NOTE[reg] ?? 'Confirm the local rules before promising anything.'}` : 'Unknown. Do not claim it is allowed; say we will confirm for their address.'),
    line('Pipeline stage', clip(l.pipeline_status || l.stage, 40)),
    line('Last contacted', when(l.last_contacted_at)),
    line('Agent notes', clip(l.notes, 500)),
    l.sms_opted_out_at ? '- NOTE: this owner has opted out of texts. Do not offer to text them; email or call back only if they ask.' : null,
  ].filter(Boolean);

  const eng = (engRes.data?.[0] ?? null) as Row | null;
  const seen: string[] = [];
  if (eng) {
    seen.push(eng.range_text ? `- We texted them a free revenue estimate range of ${eng.range_text} per year. This is the ONLY revenue figure you may quote, and always call it an estimate from public data, not a promise.` : '- We texted them a free revenue estimate link.');
    if (eng.delivered_at) seen.push(`- Text delivered ${when(eng.delivered_at)}.`);
    if (eng.estimate_viewed) seen.push(`- They opened their estimate page${eng.time_on_page_s ? ` and spent about ${Math.round(eng.time_on_page_s)} seconds on it` : ''}${eng.deepest_step ? `, getting as far as: ${clip(eng.deepest_step, 40)}` : ''}.`);
    else if (eng.first_click_at) seen.push('- They tapped the link but there is no sign they read the estimate.');
    else seen.push('- No sign they opened the link yet.');
    if (eng.report_downloaded) seen.push('- They downloaded the full report.');
    if (Number(eng.chat_questions) > 0) seen.push(`- They asked ${eng.chat_questions} question(s) in the estimate page chat.`);
    if (eng.estimate_submitted_at || eng.contact_requested_at) seen.push('- They asked for contact on the estimate page, so they are expecting a call.');
    if (eng.reply_text) seen.push(`- They replied by text${eng.reply_at ? ` on ${when(eng.reply_at)}` : ''}: "${clip(eng.reply_text, 200)}"${eng.reply_intent ? ` (read as: ${eng.reply_intent})` : ''}.`);
    if (eng.opted_out) seen.push('- They texted a stop or opt-out request. Be extra respectful and low pressure.');
    if (eng.temperature) seen.push(`- Interest level on our scale: ${eng.temperature}.`);
  }

  const calls = (callRes.data ?? []).map((c: Row) => {
    const summary = clip(c.call_summary || c.disposition_notes, 280);
    return `- ${when(c.started_at) ?? 'Earlier'}: ${clip(c.call_outcome || c.outcome, 40) || 'no outcome logged'}${summary ? `. ${summary}` : ''}`;
  });

  const internal = [l.prospect_score ? `score ${l.prospect_score}/100` : null, l.luxury ? 'luxury tier' : null, money(l.estimated_net_monthly) ? `internal modelled net ${money(l.estimated_net_monthly)}/mo` : null].filter(Boolean).join(', ');

  return [
    'LEAD PROFILE (from the TRAVLR CRM)', ...profile,
    seen.length ? '\nWHAT THIS HOMEOWNER HAS SEEN FROM US' : null, ...seen,
    calls.length ? '\nPRIOR CALLS' : null, ...calls,
    internal ? `\nINTERNAL ONLY, never read these out or quote them: ${internal}.` : null,
  ].filter(x => x !== null).join('\n');
}
