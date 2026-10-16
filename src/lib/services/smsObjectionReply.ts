import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isSuppressed } from '@/lib/services/smsConsent';
import { countSegments, toGsm } from '@/lib/services/estimateOutreachSms';
import { schedulingReply } from '@/lib/services/smsCallScheduler';

type Db = ReturnType<typeof getSupabaseAdmin>;
type Row = Record<string, any>;

const MODEL = process.env.SMS_OBJECTION_MODEL || 'claude-sonnet-4-6';
const MAX_PER_DAY = 3;
const STOP = ' Reply STOP to opt out.';

export type Category = 'financial' | 'selling' | 'already_managed' | 'tenant_or_lease' | 'bad_timing' | 'trust' | 'fees_or_terms' | 'regulation' | 'wants_call' | 'interested' | 'hostile' | 'other';
interface Decision { category: Category; action: 'reply' | 'handoff' | 'schedule'; reply?: string; brief?: string; next_step?: string }

/** The yearly range we quoted in the first text, the only dollar figures an automatic reply may use. */
async function quotedRange(db: Db, leadId: string): Promise<{ lo: number; hi: number } | null> {
  const { data } = await db.from('outreach_history').select('metadata').eq('lead_id', leadId).eq('channel', 'sms').eq('metadata->>kind', 'estimate_outreach').order('sent_at', { ascending: false }).limit(1).maybeSingle();
  const m = /\$(\d{1,3})K\s*-\s*\$?(\d{1,3})K/i.exec(String((data?.metadata as Row | null)?.message ?? ''));
  return m ? { lo: Number(m[1]) * 1000, hi: Number(m[2]) * 1000 } : null;
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const k = (n: number) => `$${Math.round(n / 1000)}K`;

/** Every dollar figure in the reply must be one we quoted (or that range per month); anything else is invented. */
function figuresAllowed(reply: string, range: { lo: number; hi: number } | null): boolean {
  const found = reply.match(/\$[\d,]+(?:\.\d+)?K?/gi) ?? [];
  if (!found.length) return true;
  if (!range) return false;
  const ok = new Set([k(range.lo), k(range.hi), money(Math.round(range.lo / 12 / 100) * 100), money(Math.round(range.hi / 12 / 100) * 100), money(range.lo), money(range.hi)].map(s => s.toLowerCase()));
  return found.every(f => ok.has(f.toLowerCase()));
}

async function transcript(db: Db, leadId: string) {
  const { data } = await db.from('outreach_history').select('sent_at,metadata').eq('lead_id', leadId).eq('channel', 'sms').lte('sent_at', new Date().toISOString()).order('sent_at', { ascending: false }).limit(10);
  return (data ?? []).reverse().map(r => { const m = (r.metadata ?? {}) as Row; const inbound = m.direction === 'inbound'; return { who: inbound ? 'Homeowner' : 'TRAVLR', text: String(inbound ? m.body ?? '' : m.message ?? '').replace(/\s+/g, ' ').slice(0, 450) }; }).filter(x => x.text);
}

async function decide(ctx: { name: string | null; address: string; listing: string; regulation: string | null; range: { lo: number; hi: number } | null; convo: Array<{ who: string; text: string }>; message: string }): Promise<Decision | null> {
  const key = process.env.ANTHROPIC_API_KEY; if (!key) return null;
  const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 9_000 });
  const range = ctx.range ? `${k(ctx.range.lo)}-${k(ctx.range.hi)} a year after costs (about ${money(Math.round(ctx.range.lo / 12 / 100) * 100)}-${money(Math.round(ctx.range.hi / 12 / 100) * 100)} a month)` : null;
  const system = `You answer a homeowner's text reply for TRAVLR Vacation Homes, which manages vacation rentals, before a human specialist takes over. We texted them a rough estimate of what their home could earn as a managed vacation rental.
Facts you may use:
- Homeowner: ${ctx.name ?? 'unknown first name'}. Home: ${ctx.address}. Listing type: ${ctx.listing}. Short-term rental rules for the city: ${ctx.regulation ?? 'unknown'}.
- ${range ? `The only estimate we quoted: ${range}. This is the ONLY money you may mention, and only as an estimate ("could", "our estimate").` : 'We quoted no figure, so mention no dollar amounts.'}
Answer with ONLY a JSON object: {"category":"financial|selling|already_managed|tenant_or_lease|bad_timing|trust|fees_or_terms|regulation|wants_call|interested|hostile|other","action":"reply|handoff|schedule","reply":"...","brief":"...","next_step":"..."}
Actions:
- "reply": write a text (under 260 characters, plain text, no emojis, no links, no sign-off, no opt-out wording because we add it) that responds to what they actually said, in a warm, brief, non-pushy voice, and ends with ONE easy next step or question.
- "schedule": they ask for a call or give a time. Leave reply empty; our scheduler answers.
- "handoff": hostile, abusive, legal threats, a complaint, a sensitive personal matter we should not answer by text, or you cannot respond truthfully from the facts. Leave reply empty.
"brief" is a one-sentence summary for the agent who follows up (what they said, what matters). "next_step" is what the agent should do.
How to handle common replies:
- financial (cannot afford it, mortgage, divorce buyout, no margin): acknowledge it kindly, say the real question is whether the rental income could cover the payments on its own, and offer to compare a vacation rental with a long-term rental if they share their monthly payment, or on a quick call. Never give financial, tax or legal advice and never promise it will work.
- selling: wish them well, say you are here if plans change. Do not push.
- already_managed: respect it, offer a no-obligation second opinion on the numbers only if natural.
- tenant_or_lease: thank them and invite them to text us when the lease is nearing its end so we can run the numbers. Do not promise that anyone will contact them on a date.
- bad_timing: be gracious, invite them to text whenever it suits them. Do not promise a follow-up date.
- trust ("is this a scam", "how did you get my number"): say who we are (TRAVLR Vacation Homes, a vacation rental management company), that we found their property from public listing information, and offer to answer questions. Do not mention STOP; we add it.
- fees_or_terms: do not quote fees or terms, and do not say what the estimate includes or what the owner "keeps" beyond "after costs". Say a specialist can walk them through how the numbers work for their home.
- regulation: say rules vary by city and a specialist can check theirs.
Never claim certainty about earnings, never invent facts, never pressure, never mention AI.`;
  const convo = ctx.convo.map(t => `${t.who}: ${t.text}`).join('\n');
  const res = await client.messages.create({ model: MODEL, max_tokens: 450, temperature: 0.3, system, messages: [{ role: 'user', content: `Conversation so far:\n${convo}\n\nLatest message from the homeowner: "${ctx.message.slice(0, 600)}"` }] });
  const text = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
  const json = /\{[\s\S]*\}/.exec(text)?.[0]; if (!json) return null;
  try { const d = JSON.parse(json) as Decision; return ['reply', 'handoff', 'schedule'].includes(d.action) ? d : null; } catch { return null; }
}

/**
 * The automatic answer to a homeowner's written reply that is not a plain YES, NO, question, HOA objection or scheduling answer: money
 * trouble, a pending sale, an existing manager, a tenant, bad timing, "is this a scam". Anthropic reads the thread and writes the
 * reply; our code rejects any dollar figure we did not quote, any link, and anything too long. Either way a call task with a short
 * brief is left for the agent so they pick up knowing what was said and what we answered.
 */
export async function objectionReply(db: Db, leadId: string, from: string, message: string): Promise<string | null> {
  if (await isSuppressed(db, from)) return null;
  const { data: lead } = await db.from('leads').select('address,city,state,contact_name,owner_name,price_type,regulation_status,primary_agent_id,sms_opted_out_at,organization_id').eq('id', leadId).maybeSingle();
  if (!lead?.address || lead.sms_opted_out_at) return null;
  const { count } = await db.from('outreach_history').select('id', { count: 'exact', head: true }).eq('lead_id', leadId).eq('metadata->>kind', 'auto_objection').gte('sent_at', new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) >= MAX_PER_DAY) return null;

  const first = String(lead.contact_name ?? '').trim().split(/\s+/)[0];
  const range = await quotedRange(db, leadId);
  let d: Decision | null = null;
  try {
    d = await decide({ name: /^[A-Za-z'-]{2,}$/.test(first) ? first : null, address: [lead.address, lead.city, lead.state].filter(Boolean).join(', '), listing: lead.price_type === 'sale' ? 'listed for sale' : lead.price_type === 'rent' ? 'listed for rent' : 'unknown', regulation: lead.regulation_status ?? null, range, convo: await transcript(db, leadId), message });
  } catch { d = null; }
  if (!d) return null;

  const who = lead.contact_name || lead.owner_name || 'Homeowner';
  const place = [lead.address, lead.city, lead.state].filter(Boolean).join(', ');
  if (d.action === 'schedule') return schedulingReply(db, leadId, from, message);

  let reply = '';
  if (d.action === 'reply') {
    const cleaned = toGsm(String(d.reply ?? '')).replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
    const text = cleaned + STOP;
    if (cleaned.length >= 20 && figuresAllowed(cleaned, range) && countSegments(text) <= 3) reply = text;
  }

  const brief = String(d.brief ?? '').slice(0, 300) || `Replied: "${message.slice(0, 160)}"`;
  await db.from('lead_tasks').insert({
    lead_id: leadId, title: `Follow up: ${who} (${d.category})`, task_type: 'call', status: 'pending', priority: 'high',
    due_date: new Date(Date.now() + 4 * 3_600_000).toISOString(), assigned_to: lead.primary_agent_id ?? null, ai_generated: true, organization_id: lead.organization_id ?? undefined,
    description: `[auto-brief] ${place}\nThey said: "${message.slice(0, 400)}"\nSummary: ${brief}\nSuggested next step: ${String(d.next_step ?? 'Review and reply personally.').slice(0, 300)}\n${reply ? `We already answered: "${reply}"` : 'No automatic reply was sent; please respond personally.'}`,
  });
  await db.from('leads').update({ stage: 'human_outreach', escalated_at: new Date().toISOString(), escalation_reason: `Reply (${d.category}): ${brief}`.slice(0, 250) }).eq('id', leadId).in('stage', ['New Lead', 'Contacted']);
  if (!reply) return null;
  await db.from('outreach_history').insert({ lead_id: leadId, channel: 'sms', status: 'sent', sent_at: new Date().toISOString(), metadata: { kind: 'auto_objection', direction: 'outbound', to: from, message: reply, category: d.category, twilio_status: 'queued' } });
  return reply;
}
