import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { buildOverview } from '@/lib/services/campaignInsights';
import { listBatches } from '@/lib/services/smsCampaignHarvest';
import { AUDIENCES, audienceCandidates, audienceSummaries, type AudienceId } from '@/lib/services/campaignBuilder';

type Db = ReturnType<typeof getSupabaseAdmin>;

const MODEL = process.env.CAMPAIGN_INSIGHTS_MODEL || 'claude-sonnet-4-6';

export interface CampaignOption {
  id: string; title: string; goalFit: string;
  audience: { id: AudienceId; label: string; states: string[]; minScore: number; size: number };
  whyThisAudience: string; strategy: string[]; tone: 'friendly' | 'direct' | 'mix';
  sendTiming: string; startAt: string; spreadHours: 0 | 1 | 2 | 4; suggestedName: string; suggestedMaxTexts: number;
  expectedOutcome: string; successMetric: string; risks: string[];
}
export interface AssistantResult { summary: string; options: CampaignOption[]; otherChannels: string[]; dataNote: string; basedOn: { campaigns: number; texts: number } }

const strs = (v: unknown, n = 5) => (Array.isArray(v) ? v.map(x => String(x).slice(0, 300)).filter(Boolean).slice(0, n) : []);

/** Next time the given UTC hour occurs at least `minMinutes` from now, `days` days ahead at the earliest. */
function nextStart(days: number, hourUtc: number, minMinutes = 45): string {
  const t = new Date(); t.setUTCDate(t.getUTCDate() + Math.max(0, Math.min(14, Math.round(days)))); t.setUTCHours(Math.max(0, Math.min(23, Math.round(hourUtc))), 0, 0, 0);
  while (t.getTime() < Date.now() + minMinutes * 60_000) t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString();
}

/** Turns a plain-language goal into a few ranked campaign plans, grounded in real audience sizes and past results. */
export async function askAssistant(db: Db, goal: string): Promise<AssistantResult | { error: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { error: 'Anthropic is not configured' };
  const [audiences, overview, batches] = await Promise.all([audienceSummaries(db), buildOverview(db, 'all'), listBatches(db)]);

  const results = overview.empty ? null : (() => {
    const { hotLeads: _h, replies, chatQuestions, by, ...rest } = overview;
    return { ...rest, by: { audience: by.audience, variant: by.variant, writtenBy: by.writtenBy, sendHourUtc: by.sendHourUtc, state: Object.fromEntries(Object.entries(by.state).slice(0, 8)), estimate: by.estimate, phone: by.phone }, replyTexts: replies.slice(0, 15).map(r => ({ intent: r.intent, text: r.text })), chatQuestions: chatQuestions.slice(0, 15) };
  })();
  const payload = {
    now: new Date().toISOString(), goal,
    audiences: audiences.map(a => ({ id: a.id, label: a.label, about: a.blurb, newLeadsAvailable: a.size, avgProspectScore: a.avgScore, topStates: a.topStates })),
    pastCampaigns: batches.map(b => ({ name: b.batch, texts: b.texts, audience: b.audience, firstSend: b.firstSend })),
    results,
  };

  const client = new Anthropic({ apiKey: key, maxRetries: 2, timeout: 100_000 });
  const res = await client.messages.create({
    model: MODEL, max_tokens: 3500, temperature: 0.4,
    system: `You are the campaign strategist for TRAVLR Vacation Homes, a vacation-rental management company. The team texts homeowners we want to convert to short-term rentals. Each text has a personalized revenue estimate and a link to a free estimate page. A user describes what they want to achieve. Propose 2 or 3 distinct campaign options they can launch now, best first.

How campaigns work (hard limits, do not propose anything outside them):
- Audience must be one of the audience ids provided. "newLeadsAvailable" is the real number of homeowners not yet texted, and audiences overlap (broad includes the others). Optional filters: "states" (two-letter codes taken from topStates) and "minScore" (0 to 100). Only people never texted before can be included, so follow-ups, re-engagement and second texts to people already contacted are NOT possible in this tool.
- Message copy is generated and validated automatically (estimate range, TRAVLR name, reply YES or NO opt-out). You choose only the tone: "friendly", "direct", or "mix" (alternates the two so the results show which works). Never promise or imply copy you cannot control.
- Texts only send between 9am and 8pm in each homeowner's local time. Use startInDays (0 to 7) and startHourUtc (0 to 23) for the start, and spreadHours 0, 1, 2 or 4 to stagger sends.
- This program is only for homeowners we want to convert to short-term rentals. Never include existing Airbnb/Vrbo hosts we would co-host.
- Compliance: no guarantees, no pressure, honor opt-outs.

Use the data:
- Base every recommendation on the numbers provided (audience sizes, past results, skip-trace accuracy, send hours, tone and state breakdowns). Quote figures. If there are few results, say that the evidence is thin and call it a hypothesis to test.
- Compare options honestly, including trade-offs (size vs data quality, cost, risk of wrong numbers).
- suggestedMaxTexts must not exceed the audience's newLeadsAvailable (after your filters, estimate if needed) and be at most 500. For a first test of a weaker audience prefer a small batch.
- Goals that need follow-up with people already contacted (hot leads, no reply, viewed but did not submit) go in "otherChannels" as concrete call/email/CRM actions, since the text tool cannot do them.
Return ONLY JSON: {"summary": string (2 sentences), "options": [{"title": string, "goalFit": string (how it serves the stated goal), "audienceId": string, "states": string[], "minScore": number, "whyThisAudience": string, "strategy": string[] (3 to 5 concrete steps), "tone": "friendly"|"direct"|"mix", "sendTiming": string (when and why), "startInDays": number, "startHourUtc": number, "spreadHours": number, "suggestedName": string (short, descriptive), "suggestedMaxTexts": number, "expectedOutcome": string (a range with the reasoning from the data, not a promise), "successMetric": string, "risks": string[]}], "otherChannels": string[], "dataNote": string}`,
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
  });
  const text = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { error: 'The helper did not return a plan. Try rewording the goal.' };
  let j: Record<string, any>;
  try { j = JSON.parse(m[0]); } catch { return { error: 'The helper returned an unreadable plan. Try again.' }; }

  const options: CampaignOption[] = [];
  for (const [i, o] of (Array.isArray(j.options) ? j.options : []).slice(0, 3).entries()) {
    const meta = AUDIENCES.find(a => a.id === o?.audienceId); if (!meta) continue;
    const states = strs(o.states, 12).map(s => s.toUpperCase()).filter(s => /^[A-Z]{2}$/.test(s));
    const minScore = Math.max(0, Math.min(100, Math.round(Number(o.minScore) || 0)));
    // Real size after the filters, not the model's guess.
    const size = (await audienceCandidates(db, meta.id)).filter(c => (!states.length || (c.state && states.includes(c.state.toUpperCase()))) && c.score >= minScore).length;
    if (!size) continue;
    const spread = [0, 1, 2, 4].includes(Number(o.spreadHours)) ? Number(o.spreadHours) as 0 | 1 | 2 | 4 : 0;
    options.push({
      id: `opt-${i}`, title: String(o.title ?? 'Campaign').slice(0, 90), goalFit: String(o.goalFit ?? '').slice(0, 400),
      audience: { id: meta.id, label: meta.label, states, minScore, size },
      whyThisAudience: String(o.whyThisAudience ?? '').slice(0, 500), strategy: strs(o.strategy), tone: ['friendly', 'direct', 'mix'].includes(o.tone) ? o.tone : 'mix',
      sendTiming: String(o.sendTiming ?? '').slice(0, 300), startAt: nextStart(Number(o.startInDays) || 0, Number(o.startHourUtc) || 16), spreadHours: spread,
      suggestedName: String(o.suggestedName ?? 'New campaign').slice(0, 60), suggestedMaxTexts: Math.max(1, Math.min(size, 500, Math.round(Number(o.suggestedMaxTexts) || size))),
      expectedOutcome: String(o.expectedOutcome ?? '').slice(0, 400), successMetric: String(o.successMetric ?? '').slice(0, 250), risks: strs(o.risks, 4),
    });
  }
  if (!options.length) return { error: 'The helper could not match your goal to the audiences available. Try describing the type of homeowner or the result you want.' };
  return { summary: String(j.summary ?? '').slice(0, 500), options, otherChannels: strs(j.otherChannels, 6), dataNote: String(j.dataNote ?? '').slice(0, 400), basedOn: { campaigns: batches.length, texts: overview.empty ? 0 : overview.totals.texts } };
}
