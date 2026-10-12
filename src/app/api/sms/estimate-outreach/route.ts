import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { dispatchSMS, getTwilioConfigStatus, lookupPhoneNumber } from '@/lib/services/twilioService';
import { draftOutreach, LEAD_COLUMNS, type OutreachLead } from '@/lib/services/estimateOutreachSms';

export const maxDuration = 300;

const MAX_PREVIEW = 50;
const MAX_SEND = 40;
const GAP_MS = 1100; // Twilio long codes send about 1 message per second

/**
 * POST /api/sms/estimate-outreach  (admin only)
 * { leadIds, action: 'preview' | 'send', tone?: 'friendly' | 'direct', useAi?: boolean }
 *
 * preview: writes the tailored message for each lead and lists anything that would block sending. Nothing is sent.
 * send: regenerates each message server-side and texts only the leads that pass every check (SMS consent on file,
 *       not do-not-contact, valid mobile number, 9am-8pm local time, not texted in the last 30 days).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const action = body?.action === 'send' ? 'send' : 'preview';
  const tone = body?.tone === 'direct' ? 'direct' : 'friendly';
  const ids: string[] = Array.isArray(body?.leadIds) ? [...new Set<string>(body.leadIds.filter((i: unknown): i is string => typeof i === 'string'))] : [];
  const cap = action === 'send' ? MAX_SEND : MAX_PREVIEW;
  if (!ids.length) return NextResponse.json({ error: 'leadIds is required' }, { status: 400 });
  if (ids.length > cap) return NextResponse.json({ error: `Up to ${cap} leads per ${action} request` }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data, error } = await db.from('leads').select(LEAD_COLUMNS).in('id', ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const site = (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, '');
  const leads = (data ?? []) as OutreachLead[];

  const drafts = [];
  for (let i = 0; i < leads.length; i += 5) {
    drafts.push(...await Promise.all(leads.slice(i, i + 5).map(l => draftOutreach(db, l, { site, tone, useAi: body?.useAi !== false }))));
  }

  if (action === 'preview') {
    const twilio = getTwilioConfigStatus();
    return NextResponse.json({
      ok: true, action, twilioConfigured: twilio.smsConfigured,
      summary: { requested: ids.length, sendable: drafts.filter(d => d.canSend).length, blocked: drafts.filter(d => !d.canSend).length },
      drafts,
    });
  }

  if (!getTwilioConfigStatus().smsConfigured) {
    return NextResponse.json({ error: 'Twilio SMS is not configured', missing: getTwilioConfigStatus().missing }, { status: 503 });
  }

  const results: Array<{ leadId: string; status: 'sent' | 'failed' | 'skipped'; reason?: string; messageSid?: string }> = [];
  const batch = `estimate-outreach-${Date.now()}`;
  const started = Date.now();
  for (const d of drafts) {
    if (!d.canSend || !d.to) { results.push({ leadId: d.leadId, status: 'skipped', reason: d.blockers.join(', ') }); continue; }
    if (Date.now() - started > 270_000) { results.push({ leadId: d.leadId, status: 'skipped', reason: 'time_limit' }); continue; }

    const lookup = await lookupPhoneNumber(d.to);
    if (lookup.twilioConfigured && (lookup.valid === false || lookup.lineType === 'landline')) {
      results.push({ leadId: d.leadId, status: 'skipped', reason: lookup.valid === false ? 'invalid_phone' : 'landline' });
      continue;
    }

    const sent = await dispatchSMS({ to: d.to, body: d.message, leadId: d.leadId });
    const ok = sent.success;
    await db.from('outreach_history').insert({
      lead_id: d.leadId, channel: 'sms', agent_id: auth.actor.user.id, status: ok ? 'sent' : 'failed', sent_at: new Date().toISOString(),
      metadata: { kind: 'estimate_outreach', batch, to: d.to, message: d.message, generated_by: d.generatedBy, platform: d.platform, range: d.range, message_sid: sent.messageSid ?? null, error: sent.error ?? null },
    });
    results.push({ leadId: d.leadId, status: ok ? 'sent' : 'failed', reason: sent.error, messageSid: sent.messageSid });
    await new Promise(r => setTimeout(r, GAP_MS));
  }

  return NextResponse.json({
    ok: true, action, batch,
    summary: { requested: ids.length, sent: results.filter(r => r.status === 'sent').length, failed: results.filter(r => r.status === 'failed').length, skipped: results.filter(r => r.status === 'skipped').length },
    results,
  });
}
