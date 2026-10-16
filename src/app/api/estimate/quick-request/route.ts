import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { allowRequest, clientIp } from '@/lib/publicRateLimit';
import { isProtectedContact } from '@/lib/protectedContacts';
import { isSuppressed, notifyAdmins } from '@/lib/services/smsConsent';
import { sendTeamAlert } from '@/lib/services/replyAlerts';
import { advancePipeline } from '@/lib/services/leadPipeline';

export const maxDuration = 30;

function nextBusinessDay(): Date {
  const d = new Date();
  do { d.setUTCDate(d.getUTCDate() + 1); } while ([0, 6].includes(d.getUTCDay()));
  d.setUTCHours(16, 0, 0, 0);
  return d;
}

/**
 * POST /api/estimate/quick-request  (public)  { c: <code from the text link>, mode: 'text' | 'call' }
 * One-tap request from the estimate page for someone who arrived from our text: no form fields. The code identifies the lead,
 * and we reach them at the number we texted. Asking us to text them is recorded as consent to be texted about their estimate.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { c?: unknown; mode?: unknown } | null;
  const code = typeof body?.c === 'string' ? body.c : '';
  const mode = body?.mode === 'call' ? 'call' : body?.mode === 'text' ? 'text' : null;
  if (!mode || !/^[a-z0-9]{4,16}$/i.test(code)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  if (!allowRequest(`quick:${clientIp(req.headers)}`, 10, 60 * 60 * 1000)) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });

  try {
    const db = getSupabaseAdmin();
    const { data: link } = await db.from('link_clicks').select('lead_id').eq('token', code).eq('sequence_name', 'estimate_outreach').maybeSingle();
    if (!link?.lead_id) return NextResponse.json({ error: 'This link has expired. Please use the form below.' }, { status: 404 });
    const { data: lead } = await db.from('leads').select('id,address,city,state,owner_name,contact_name,contact_phone,primary_agent_id,sms_opted_out_at').eq('id', link.lead_id).maybeSingle();
    if (!lead) return NextResponse.json({ error: 'This link has expired. Please use the form below.' }, { status: 404 });
    if (isProtectedContact(lead.owner_name, lead.contact_name)) return NextResponse.json({ ok: true });

    const digits = String(lead.contact_phone ?? '').replace(/\D/g, '');
    const last4 = digits.slice(-4);
    const event = mode === 'call' ? 'call_requested' : 'text_requested';
    const { data: dup } = await db.from('estimate_journey_events').select('id').eq('lead_id', lead.id).eq('event', event)
      .gte('created_at', new Date(Date.now() - 10 * 60_000).toISOString()).limit(1);
    if (dup?.length) return NextResponse.json({ ok: true, last4 });

    const now = new Date().toISOString();
    await db.from('estimate_journey_events').insert({ code, lead_id: lead.id, session_id: `quick-${code}`, event, data: { source: 'quick_request' } });

    // Consent to be texted is recorded only when they asked for a text and the number is not on the opt-out list.
    const suppressed = !!lead.sms_opted_out_at || await isSuppressed(db, lead.contact_phone);
    if (mode === 'text' && !suppressed) await db.from('leads').update({ sms_opt_in: true, sms_opt_in_at: now, opt_in_source: 'estimate_page_text_request' }).eq('id', lead.id);

    const place = [lead.address, lead.city, lead.state].filter(Boolean).join(', ');
    const who = lead.contact_name || lead.owner_name || 'The homeowner';
    const reason = mode === 'call' ? 'Asked for a call from the estimate page' : 'Asked us to text them from the estimate page';
    await db.from('leads').update({ stage: 'human_outreach', escalated_at: now, escalation_reason: reason }).eq('id', lead.id);
    await Promise.allSettled([
      advancePipeline(db, lead.id, 'callback_scheduled'),
      db.from('lead_tasks').insert({
        lead_id: lead.id, title: `${mode === 'call' ? 'Call' : 'Text'} homeowner: ${who}`,
        description: `${who} tapped "${mode === 'call' ? 'Call me' : 'Text me this'}" on the estimate page for ${place}.${mode === 'text' && suppressed ? ' Their number is on the opt-out list: call instead of texting.' : ''}`,
        task_type: 'call', status: 'pending', priority: 'high', due_date: nextBusinessDay().toISOString(), assigned_to: lead.primary_agent_id ?? null,
      }),
      sendTeamAlert({ key: `home-quick:${mode}:${lead.id}`, text: `Homeowner tapped "${mode === 'call' ? 'Call me' : 'Text me this'}": ${who}, ${place}`, url: `${(process.env.NEXT_PUBLIC_SITE_URL || 'https://prospect.staytrvlr.com').replace(/\/$/, '')}/lead-profile?id=${encodeURIComponent(lead.id)}` }),
      notifyAdmins(db, { title: 'Homeowner wants contact', message: `${who} asked us to ${mode === 'call' ? 'call' : 'text'} them about ${place}.`, metadata: { lead_id: lead.id, reason: 'estimate_quick_request' } }),
    ]);
    return NextResponse.json({ ok: true, last4 });
  } catch (e) {
    console.error('quick-request failed', e);
    return NextResponse.json({ error: 'Something went wrong. Please use the form below.' }, { status: 500 });
  }
}
