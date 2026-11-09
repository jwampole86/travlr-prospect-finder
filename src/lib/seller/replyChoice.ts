import 'server-only';
import type { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { CHOICES, isEntryQuestion, type Choice } from './outreachCampaign';
import { recordSellerSignal, type Opportunity } from './sellerPipeline';
import type { SellerIntent } from './sellerIntent';

type Db = ReturnType<typeof getSupabaseAdmin>;

const WINDOW_MS = 21 * 24 * 3600_000;

/** True when the last text we sent this lead was the campaign's question, so a bare "1" to "4" is an answer to it and not to anything else. */
export async function askedCampaignQuestion(db: Db, leadId: string, now = Date.now()): Promise<boolean> {
  const { data } = await db.from('outreach_history').select('metadata, status')
    .eq('lead_id', leadId).eq('channel', 'sms').in('status', ['sent', 'queued', 'delivered'])
    .gte('sent_at', new Date(now - WINDOW_MS).toISOString()).order('sent_at', { ascending: false }).limit(5);
  // Replies from the owner are stored in the same table; the newest text we sent decides.
  const sent = (data ?? []).find((r) => typeof (r.metadata as Record<string, unknown> | null)?.original_message === 'string');
  return isEntryQuestion((sent?.metadata as { original_message?: string } | undefined)?.original_message);
}

/**
 * Records an owner's answer on their seller opportunity (creating it if they have none). The answer sets the next action for the team and
 * nothing else: it does not choose a route, grant permission or send anything.
 */
export async function recordReplyChoice(db: Db, input: { leadId: string; choice: Choice; text: string; organizationId?: string | null }): Promise<Opportunity | null> {
  const info = CHOICES[input.choice];
  const intent: SellerIntent = {
    level: input.choice === 'sale' ? 'explicit' : 'possible',
    score: input.choice === 'sale' ? 70 : 40,
    timeline: null,
    keepsRental: input.choice !== 'sale',
    signals: [`Answered ${info.number} (${info.label}) to the campaign question`],
  };
  const result = await recordSellerSignal(db, { leadId: input.leadId, source: 'sms_reply', text: input.text, intent, organizationId: input.organizationId });
  if (!result) return null;
  const now = new Date().toISOString();
  const { data } = await db.from('seller_opportunities').update({
    reply_choice: input.choice, reply_choice_at: now,
    next_action: `Owner chose ${info.label}: ${info.nextAction} (${info.destination}). Confirm who they are and their permission before going further.`,
    next_action_at: now,
  }).eq('id', result.opportunity.id).select('*').single();
  return (data ?? result.opportunity) as Opportunity;
}
