import { NextRequest, NextResponse } from 'next/server';
import { requireLeadAccess } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { sendTrackedEmail } from '@/lib/email/trackedSend';
import { renderTemplate } from '@/lib/followUpTemplates';

export const maxDuration = 60;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://prospect.staytrvlr.com').replace(/\/$/, '');
const POSTAL = process.env.COHOST_POSTAL_ADDRESS ?? '17 Coronel Pl, Aliso Viejo, CA 92656-1631';
const REPLY_TO = process.env.REPLY_ALERT_EMAIL ?? 'info@staytrvlr.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FALLBACK = { subject: 'Following up on {{address}}', body: 'Hi {{contactName}},\n\nI wanted to follow up about {{address}}. Would you be open to a quick conversation about what it could earn as a managed vacation rental?\n\nBest regards,\n{{senderName}}' };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = (text: string, unsub: string) => `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1a1a1a;line-height:1.6;font-size:15px;">${text.split(/\n{2,}/).map(p => `<p style="margin:0 0 12px;">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;"><p style="font-size:11px;color:#6b7280;">TRAVLR Vacation Homes, ${esc(POSTAL)}.<br>If you would rather not hear from us, <a href="${unsub}" style="color:#6b7280;">unsubscribe here</a>.</p></body></html>`;

/**
 * POST /api/follow-up/cadence  { stepId, action: 'preview' | 'send' | 'done' | 'skip', templateId? }
 * Sends one email cadence step to the lead's own address on file, or marks a step done or skipped.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { stepId?: string; action?: string; templateId?: string };
  const stepId = String(body.stepId ?? ''); const action = String(body.action ?? '');
  if (!stepId || !['preview', 'send', 'done', 'skip'].includes(action)) return NextResponse.json({ error: 'Choose a step and an action.' }, { status: 400 });
  const db = getSupabaseAdmin();

  const { data: step } = await db.from('outreach_cadences').select('*').eq('id', stepId).maybeSingle();
  if (!step) return NextResponse.json({ error: 'That step no longer exists.' }, { status: 404 });
  const access = await requireLeadAccess(req, step.lead_id);
  if (!access.actor) return NextResponse.json({ error: access.error }, { status: access.status });
  if (step.status !== 'pending') return NextResponse.json({ error: `This step is already ${step.status}.` }, { status: 409 });

  if (action === 'done' || action === 'skip') {
    const status = action === 'done' ? 'sent' : 'skipped';
    await db.from('outreach_cadences').update({ status }).eq('id', stepId);
    if (action === 'done') await db.from('contact_history').insert({ id: crypto.randomUUID(), lead_id: step.lead_id, type: step.channel, subject: `Cadence step ${step.step_number}`, body: '', outcome: 'Completed via cadence', contacted_at: new Date().toISOString() });
    return NextResponse.json({ ok: true, status });
  }

  if (step.channel !== 'email') return NextResponse.json({ error: 'Only email steps can be sent from here. Mark this one done after you contact the lead.' }, { status: 400 });

  const { data: lead } = await db.from('leads').select('id,address,city,state,contact_name,owner_name,price,email_opt_in').eq('id', step.lead_id).maybeSingle();
  if (!lead) return NextResponse.json({ error: 'The lead for this step was not found.' }, { status: 404 });
  if (lead.email_opt_in === false) return NextResponse.json({ error: 'This lead unsubscribed from email. Do not send.' }, { status: 409 });

  const { data: emails } = await db.from('enriched_emails').select('email_address,is_selected,verified_status,created_at').eq('lead_id', lead.id);
  const to = (emails ?? []).filter(e => EMAIL_RE.test(String(e.email_address)) && !/invalid|bounce/i.test(String(e.verified_status ?? '')))
    .sort((a, b) => Number(!!b.is_selected) - Number(!!a.is_selected) || Number(/verified/i.test(b.verified_status ?? '')) - Number(/verified/i.test(a.verified_status ?? '')) || String(b.created_at).localeCompare(String(a.created_at)))[0]?.email_address as string | undefined;
  if (!to) return NextResponse.json({ error: 'There is no email address on file for this lead. Add or find one in the lead profile first.', code: 'no_email' }, { status: 422 });

  const templateId = body.templateId || step.template_id || null;
  const { data: tpl } = templateId ? await db.from('email_templates').select('id,subject,body').eq('id', templateId).maybeSingle() : { data: null };
  const { data: profile } = await db.from('user_profiles').select('full_name').eq('id', access.actor.user.id).maybeSingle();
  const senderName = String(profile?.full_name ?? '').trim() || process.env.RESEND_FROM_NAME || 'The TRAVLR team';
  const mail = renderTemplate(tpl?.subject ?? FALLBACK.subject, tpl?.body ?? FALLBACK.body, lead, senderName);
  if (mail.missing.length) return NextResponse.json({ error: `This template needs fields we cannot fill automatically: ${mail.missing.map(m => `{{${m}}}`).join(', ')}. Pick another template or edit it first.`, code: 'missing_fields' }, { status: 422 });

  if (action === 'preview') return NextResponse.json({ ok: true, to, subject: mail.subject, text: mail.text, templateId: tpl?.id ?? null, senderName });

  const { data: tok } = await db.from('email_unsubscribe_tokens').insert({ lead_id: lead.id }).select('token').single();
  const unsub = tok?.token ? `${SITE}/api/cadence/unsubscribe?token=${tok.token}` : `${SITE}/unsubscribe`;
  const text = `${mail.text}\n\n--\nTRAVLR Vacation Homes, ${POSTAL}\nTo stop hearing from us: ${unsub}`;
  const sent = await sendTrackedEmail(db, { to, subject: mail.subject, html: html(mail.text, unsub), text, replyTo: REPLY_TO, leadId: lead.id, kind: 'cadence_followup', metadata: { cadence_step_id: stepId, step_number: step.step_number, template_id: tpl?.id ?? null, sent_by: access.actor.user.id } });
  if (!sent.ok) return NextResponse.json({ error: `The email could not be sent: ${sent.error ?? 'unknown error'}` }, { status: 502 });
  await db.from('outreach_cadences').update({ status: 'sent', ...(tpl?.id ? { template_id: tpl.id } : {}) }).eq('id', stepId);
  return NextResponse.json({ ok: true, to, status: 'sent' });
}
