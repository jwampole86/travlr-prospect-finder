import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { isSuppressed } from '@/lib/services/smsConsent';
import { STATE_TZ, toGsm, countSegments } from '@/lib/services/estimateOutreachSms';
import { advancePipeline } from '@/lib/services/leadPipeline';
import { sendTeamAlert } from '@/lib/services/replyAlerts';

type Db = ReturnType<typeof getSupabaseAdmin>;
type Row = Record<string, any>;

const MODEL = process.env.SMS_SCHEDULING_MODEL || 'claude-sonnet-4-6';
const AGENT_TZ = 'America/Denver';
/** Agents take calls 9am to 5pm Mountain Time, Monday to Saturday. */
const CALL_START_HOUR = 9;
const CALL_END_HOUR = 17;
const CALL_DAYS = new Set([1, 2, 3, 4, 5, 6]);
const THREAD_HOURS = 72;
const MAX_REPLIES_PER_DAY = 8;
const SCHEDULING_KINDS = ['yes_followup', 'manual_followup', 'auto_schedule'];
const BASE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://prospect.staytrvlr.com').replace(/\/$/, '');

// ─── Time zones ──────────────────────────────────────────────────────────────

function tzOffsetMs(ts: number, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(ts).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ts;
}

/** A wall-clock date and time in a zone, as an instant. */
export function zonedToUtc(date: string, time: string, tz: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date), t = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [y, mo, da, h, mi] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2])];
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null;
  let utc = Date.UTC(y, mo - 1, da, h, mi);
  for (let i = 0; i < 2; i++) utc = Date.UTC(y, mo - 1, da, h, mi) - tzOffsetMs(utc, tz);
  return new Date(utc);
}

const localParts = (d: Date, tz: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(d).map(x => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), dow };
};

/** "Saturday, Oct 17 at 10:00 AM MDT" in the homeowner's own zone. */
export const describeTime = (d: Date, tz: string) =>
  `${new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric' }).format(d)} at ${new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d)}`;

/** The first moment calls can be booked: CALL_EARLIEST_AT, or the start of tomorrow (Mountain) when agents are booked for today. */
export function earliestCallAt(now = new Date()): Date {
  const set = process.env.CALL_EARLIEST_AT && Date.parse(process.env.CALL_EARLIEST_AT);
  if (set && set > now.getTime()) return new Date(set);
  const today = localParts(now, AGENT_TZ).date;
  const next = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return zonedToUtc(next, `${CALL_START_HOUR}:00`, AGENT_TZ)!;
}

/** Whether a call can be booked at this instant: agent hours Mountain, a day agents work, after the earliest time, within 30 days. */
export function slotProblem(at: Date, tz: string, now = new Date()): string | null {
  if (at.getTime() < earliestCallAt(now).getTime()) return 'too_soon';
  if (at.getTime() > now.getTime() + 30 * 86_400_000) return 'too_far';
  const a = localParts(at, AGENT_TZ);
  if (!CALL_DAYS.has(a.dow)) return 'closed_day';
  if (a.hour < CALL_START_HOUR || a.hour * 60 + a.minute > CALL_END_HOUR * 60) return 'outside_hours';
  const h = localParts(at, tz).hour;
  if (h < 8 || h >= 20) return 'their_night';
  return null;
}

// ─── Conversation ────────────────────────────────────────────────────────────

/** A scheduling conversation is live when we asked for a time (or sent a scheduling reply) in the last 72 hours. */
export async function isSchedulingThread(db: Db, leadId: string): Promise<boolean> {
  const { count } = await db.from('outreach_history').select('id', { count: 'exact', head: true }).eq('lead_id', leadId).eq('channel', 'sms')
    .in('metadata->>kind', SCHEDULING_KINDS).gte('sent_at', new Date(Date.now() - THREAD_HOURS * 3_600_000).toISOString());
  return (count ?? 0) > 0;
}

async function history(db: Db, leadId: string) {
  const { data } = await db.from('outreach_history').select('sent_at,metadata').eq('lead_id', leadId).eq('channel', 'sms')
    .gte('sent_at', new Date(Date.now() - 7 * 86_400_000).toISOString()).lte('sent_at', new Date().toISOString()).order('sent_at', { ascending: false }).limit(12);
  return (data ?? []).reverse().map(r => {
    const m = (r.metadata ?? {}) as Row; const inbound = m.direction === 'inbound';
    return { who: inbound ? 'Homeowner' : 'TRAVLR', text: String(inbound ? m.body ?? '' : m.message ?? '').replace(/\s+/g, ' ').slice(0, 400) };
  }).filter(x => x.text);
}

interface Decision { action: 'confirm' | 'ask' | 'decline' | 'handoff'; date?: string | null; time?: string | null; reply?: string; reason?: string }

async function decide(ctx: { name: string | null; address: string; tz: string; now: Date; earliest: Date; transcript: Array<{ who: string; text: string }>; message: string }): Promise<Decision | null> {
  const key = process.env.ANTHROPIC_API_KEY; if (!key) return null;
  const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 9_000 });
  const fmt = (d: Date) => describeTime(d, ctx.tz);
  const iso = (d: Date) => localParts(d, ctx.tz).date;
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(ctx.now.getTime() + i * 86_400_000);
    const w = new Intl.DateTimeFormat('en-US', { timeZone: ctx.tz, weekday: 'long' }).format(d);
    return `${iso(d)} ${w}${i === 0 ? ' (today)' : i === 1 ? ' (tomorrow)' : ''}`;
  }).join('; ');
  const system = `You schedule a quick phone call between a homeowner and a TRAVLR Vacation Homes specialist, over text message. TRAVLR manages vacation rentals; the call is about the homeowner's free rental estimate.
Facts:
- Today is ${iso(ctx.now)} and it is now ${fmt(ctx.now)} (homeowner's time zone: ${ctx.tz}). Calendar in their time zone: ${days}. Use exactly these dates for "tomorrow", weekday names and "next week". The earliest a call can be booked is ${fmt(ctx.earliest)}; the team is booked until then, so never offer or accept anything earlier, even if they say "now" or "today".
- Specialists take calls 9am to 5pm Mountain Time, Monday to Saturday. Convert to the homeowner's time zone when you suggest times. A call is about 15 minutes.
- The homeowner is at ${ctx.address}${ctx.name ? ` and is called ${ctx.name}` : ''}.
Decide what to do with their latest message and answer with ONLY a JSON object:
{"action":"confirm"|"ask"|"decline"|"handoff","date":"YYYY-MM-DD","time":"HH:MM","reply":"...","reason":"..."}
- "confirm": they gave (or accepted) one specific day AND time. date and time are in the homeowner's local time, 24-hour. Their reply text is built by us, so leave reply empty.
- "ask": the day or time is missing or not possible ("now", "tomorrow morning", "next week", a Sunday or a time outside the hours above, "yes", "no"). Write a short, warm text (under 260 characters) that asks which day and time work, offering a concrete suggestion inside the allowed hours, and mention they can pick next week if they prefer. If they said no to the offered time, ask whether another day or next week works.
- "decline": they clearly do not want a call or any more contact. reply is one polite sentence thanking them.
- "handoff": anything else needing a person: a question about price, contract or the estimate, a complaint, confusion, or a message that is not about scheduling. Leave reply empty.
Rules for reply: plain text, no emojis, no links, no promises about results or money, never say a specialist is available at a time that is not allowed, do not mention you are an AI, do not include opt-out wording (we add it).`;
  const convo = ctx.transcript.map(t => `${t.who}: ${t.text}`).join('\n');
  const res = await client.messages.create({ model: MODEL, max_tokens: 400, temperature: 0.2, system, messages: [{ role: 'user', content: `Conversation so far:\n${convo}\n\nLatest message from the homeowner: "${ctx.message.slice(0, 500)}"` }] });
  const text = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
  const json = /\{[\s\S]*\}/.exec(text)?.[0]; if (!json) return null;
  try {
    const d = JSON.parse(json) as Decision;
    return ['confirm', 'ask', 'decline', 'handoff'].includes(d.action) ? d : null;
  } catch { return null; }
}

const STOP = ' Reply STOP to opt out.';
const sanitize = (s: string) => toGsm(s).replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();

/**
 * The automatic reply to a homeowner who is answering our request for a call time. Anthropic reads the conversation and proposes
 * what to do; our own code decides whether a time is bookable (agent hours, earliest date) and writes the confirmation, so a model
 * mistake can never book an impossible slot. Returns the text to send, or null when a person should handle it (they are alerted either way).
 */
export async function schedulingReply(db: Db, leadId: string, from: string, message: string): Promise<string | null> {
  if (await isSuppressed(db, from)) return null;
  const { data: lead } = await db.from('leads').select('address,city,state,contact_name,owner_name,primary_agent_id,sms_opted_out_at,organization_id').eq('id', leadId).maybeSingle();
  if (!lead?.address || lead.sms_opted_out_at) return null;
  const { count } = await db.from('outreach_history').select('id', { count: 'exact', head: true }).eq('lead_id', leadId).eq('metadata->>kind', 'auto_schedule')
    .gte('sent_at', new Date(Date.now() - 86_400_000).toISOString());
  if ((count ?? 0) >= MAX_REPLIES_PER_DAY) return null;

  const tz = STATE_TZ[String(lead.state ?? '').toUpperCase()] ?? AGENT_TZ;
  const first = String(lead.contact_name ?? '').trim().split(/\s+/)[0];
  const now = new Date(); const earliest = earliestCallAt(now);
  const transcript = await history(db, leadId);
  let d: Decision | null = null;
  try { d = await decide({ name: /^[A-Za-z'-]{2,}$/.test(first) ? first : null, address: String(lead.address).split(',')[0], tz, now, earliest, transcript, message }); } catch { d = null; }
  if (!d || d.action === 'handoff') return null;

  let reply = ''; let outcome: string = d.action; let bookedAt: Date | null = null;
  if (d.action === 'confirm') {
    const at = d.date && d.time ? zonedToUtc(d.date, d.time, tz) : null;
    const problem = at ? slotProblem(at, tz, now) : 'no_time';
    if (at && !problem) {
      bookedAt = at;
      reply = `You're all set${/^[A-Za-z'-]{2,}$/.test(first) ? `, ${first}` : ''}! A TRAVLR specialist will call you ${describeTime(at, tz)} at this number. Just reply here if you need to change it.`;
    } else {
      outcome = `ask:${problem}`;
      const earliestLabel = describeTime(earliest, tz).replace(/ at .*/, '');
      reply = problem === 'too_soon' ? `Our team is booked until ${earliestLabel}. What day and time after that work for you? We can also set it for next week.`
        : `We take calls 9am to 5pm Mountain Time, Monday to Saturday, starting ${earliestLabel}. What day and time work best for you? Next week is fine too.`;
    }
  } else if (d.action === 'ask' || d.action === 'decline') {
    reply = sanitize(d.reply ?? '');
    if (reply.length < 15) return null;
  }
  const message2 = sanitize(reply).slice(0, 300) + STOP;
  if (countSegments(message2) > 3) return null;

  const nowIso = now.toISOString();
  const place = [lead.address, lead.city, lead.state].filter(Boolean).join(', ');
  const who = lead.contact_name || lead.owner_name || 'Homeowner';
  if (bookedAt) {
    // A new time replaces any call we booked automatically before.
    await db.from('lead_tasks').delete().eq('lead_id', leadId).eq('status', 'pending').like('description', '%[auto-scheduled]%');
    await db.from('lead_tasks').insert({
      lead_id: leadId, title: `Call homeowner: ${who} (${describeTime(bookedAt, AGENT_TZ)})`, task_type: 'call', status: 'pending', priority: 'high', due_date: bookedAt.toISOString(),
      assigned_to: lead.primary_agent_id ?? null, ai_generated: true, organization_id: lead.organization_id ?? undefined,
      description: `[auto-scheduled] ${who} agreed by text to a call about ${place}. Their words: "${message.slice(0, 200)}"`,
    });
    await db.from('leads').update({ stage: 'human_outreach', next_scheduled_touch_at: bookedAt.toISOString() }).eq('id', leadId);
    await advancePipeline(db, leadId, 'callback_scheduled');
    await sendTeamAlert({ key: `call-booked:${leadId}:${bookedAt.toISOString()}`, text: `Call booked by text: ${who}, ${describeTime(bookedAt, AGENT_TZ)}, ${place}`, url: `${BASE}/lead-profile?id=${encodeURIComponent(leadId)}` });
  } else if (d.action === 'decline') {
    await sendTeamAlert({ key: `call-declined:${leadId}:${nowIso.slice(0, 13)}`, text: `${who} said they do not want a call: "${message.slice(0, 80)}"`, url: `${BASE}/lead-profile?id=${encodeURIComponent(leadId)}` });
  }
  await db.from('outreach_history').insert({ lead_id: leadId, channel: 'sms', status: 'sent', sent_at: nowIso, metadata: { kind: 'auto_schedule', direction: 'outbound', to: from, message: message2, outcome, booked_for: bookedAt?.toISOString() ?? null, reason: d.reason ?? null, twilio_status: 'queued' } });
  return message2;
}
