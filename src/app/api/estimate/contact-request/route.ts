import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { buildHomeownerReport } from '@/lib/homeownerEstimate';
import { upsertHomeownerLead, logHomeownerActivity, createFollowUpTask } from '@/lib/homeownerLeads';
import { buildTeamInquiryEmail, buildHomeownerConfirmationEmail, whenLabel, type InquiryDetails } from '@/lib/email/homeownerInquiryEmails';
import { sendTrackedEmail } from '@/lib/email/trackedSend';
import { validateContact } from '@/lib/contactValidation';
import { allowRequest, clientIp } from '@/lib/publicRateLimit';
import { CONTACT_EMAIL } from '@/lib/homeownerContact';

export const maxDuration = 30;

const WINDOWS = ['morning', 'afternoon', 'evening'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

function nextBusinessDay(): Date {
  const d = new Date();
  do { d.setUTCDate(d.getUTCDate() + 1); } while ([0, 6].includes(d.getUTCDay()));
  d.setUTCHours(16, 0, 0, 0);
  return d;
}

/**
 * POST /api/estimate/contact-request  (public)
 * { address, type: 'call' | 'question', firstName, lastName?, email, phone?, preferredDate?, preferredWindow?, timezone?, message?, smsConsent? }
 * Saves the request, attaches it to the homeowner's lead, creates a follow-up task and emails the team and the homeowner.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }

  // Bots fill hidden fields; answer as if it worked and store nothing.
  if (clean(body.website, 50)) return NextResponse.json({ ok: true });

  if (!allowRequest(`contact:${clientIp(req.headers)}`, 6, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  const type = body.type === 'question' ? 'question' : 'call';
  const address = clean(body.address, 300);
  const firstName = clean(body.firstName, 60);
  const lastName = clean(body.lastName, 60);
  const emailRaw = clean(body.email, 160).toLowerCase();
  const phoneRaw = clean(body.phone, 30);
  const message = clean(body.message, 2000);
  const timezone = clean(body.timezone, 60) || null;
  const smsConsent = body.smsConsent === true;
  const preferredWindow = (WINDOWS as readonly string[]).includes(String(body.preferredWindow)) ? String(body.preferredWindow) : null;
  let preferredDate: string | null = null;
  if (typeof body.preferredDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.preferredDate)) {
    const t = new Date(`${body.preferredDate}T12:00:00Z`).getTime();
    const day = 86_400_000;
    if (Number.isFinite(t) && t >= Date.now() - day && t <= Date.now() + 90 * day) preferredDate = body.preferredDate;
  }

  const errors: Record<string, string> = {};
  if (address.length < 5) errors.address = 'Address is required';
  if (!firstName) errors.firstName = 'Please enter your first name';
  if (!EMAIL_RE.test(emailRaw)) errors.email = 'Please enter a valid email';
  const digits = phoneRaw.replace(/\D/g, '');
  if (type === 'call' && digits.length < 10) errors.phone = 'Please enter a phone number we can call';
  if (phoneRaw && digits.length < 10) errors.phone = 'Please enter a valid phone number';
  if (type === 'question' && message.length < 5) errors.message = 'Please type your question';
  if (Object.keys(errors).length) return NextResponse.json({ error: 'Please check the highlighted fields', fields: errors }, { status: 422 });
  const check = await validateContact({ email: emailRaw, phone: phoneRaw, phoneRequired: type === 'call', keepEmail: body.emailConfirmed === true });
  if (Object.keys(check.errors).length) return NextResponse.json({ error: 'Please check the highlighted fields', fields: check.errors, suggestion: check.emailSuggestion }, { status: 422 });
  const email = check.email.normalized;
  const phone = check.phone.normalized;
  const phoneDisplay = check.phone.formatted || phone;

  let db;
  try { db = getSupabaseAdmin(); } catch { return NextResponse.json({ error: 'Service unavailable' }, { status: 503 }); }

  try {
    // The same person pressing the button twice should not create two tasks.
    const { data: dup } = await db.from('homeowner_inquiries').select('id')
      .ilike('email', email.replace(/[%_\\]/g, '\\$&')).eq('inquiry_type', type).gte('created_at', new Date(Date.now() - 10 * 60_000).toISOString()).limit(1);
    if (dup && dup.length) return NextResponse.json({ ok: true, duplicate: true });

    const report = await buildHomeownerReport(address);
    const lead = await upsertHomeownerLead(db, {
      address, report, origin: type === 'call' ? 'call_request' : 'question',
      contact: { firstName, lastName, email, phone, smsConsent },
    });

    const details: InquiryDetails = {
      type, name: `${firstName} ${lastName}`.trim(), email, phone: phoneDisplay, address, preferredDate, preferredWindow, timezone, message,
    };

    const { data: inquiry, error: insErr } = await db.from('homeowner_inquiries').insert({
      lead_id: lead.leadId, inquiry_type: type, first_name: firstName, last_name: lastName || null, email,
      phone: phone || null, address, preferred_date: preferredDate, preferred_window: preferredWindow,
      timezone, message: message || null, sms_consent: smsConsent,
      report_snapshot: { annualNet: report.scenarios[1].annualNet, netMonthly: report.scenarios[1].netMonthly, regulation: report.regulation.status, basis: report.basis },
    }).select('id').single();
    if (insErr) throw new Error(insErr.message);

    const when = whenLabel(details);
    const title = type === 'call'
      ? `Call homeowner: ${details.name} (${when})`
      : `Reply to homeowner question: ${details.name}`;
    const description = [
      `${details.name} asked for ${type === 'call' ? 'a call' : 'more information'} after viewing their estimate.`,
      `Email: ${email}`, phone ? `Phone: ${phone}` : '', type === 'call' ? `Preferred time: ${when}` : '', message ? `Message: ${message}` : '',
    ].filter(Boolean).join('\n');

    let due = nextBusinessDay();
    if (preferredDate) {
      const d = new Date(`${preferredDate}T16:00:00Z`);
      if (d.getTime() > Date.now()) due = d;
    }
    await Promise.allSettled([
      createFollowUpTask(db, lead, { title, description, type: type === 'call' ? 'call' : 'email', due }),
      logHomeownerActivity(db, lead, { title: type === 'call' ? 'Homeowner requested a call' : 'Homeowner asked a question', body: description, kind: type === 'call' ? 'homeowner_call_requested' : 'homeowner_question', metadata: { inquiry_id: inquiry?.id } }),
    ]);

    // Emails and in-app alerts. A failure here must not fail the request: the inquiry is already saved.
    const base = (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, '');
    const reportUrl = `${base}/estimate/report?address=${encodeURIComponent(address)}`;
    const leadUrl = `${base}/lead-profile?id=${encodeURIComponent(lead.leadId)}`;
    let teamNotified = false;
    let confirmed = false;
    try {
      const team = buildTeamInquiryEmail(details, report, { lead: leadUrl, report: reportUrl });
      const teamTo = process.env.ESTIMATE_NOTIFY_EMAIL || process.env.RESEND_FROM_EMAIL || CONTACT_EMAIL;
      const ack = buildHomeownerConfirmationEmail(details, report, { report: reportUrl }, CONTACT_EMAIL);
      const [t, c] = await Promise.all([
        sendTrackedEmail(db, { to: teamTo, replyTo: email, subject: team.subject, html: team.html, text: team.text, leadId: lead.leadId, kind: 'team_inquiry_alert', metadata: { inquiry_id: inquiry?.id } }),
        sendTrackedEmail(db, { to: email, replyTo: process.env.RESEND_FROM_EMAIL || CONTACT_EMAIL, subject: ack.subject, html: ack.html, text: ack.text, leadId: lead.leadId, kind: 'homeowner_confirmation', metadata: { inquiry_id: inquiry?.id } }),
      ]);
      teamNotified = t.ok;
      confirmed = c.ok;
    } catch (e) {
      console.warn('[estimate/contact-request] email failed:', e instanceof Error ? e.message : e);
    }

    try {
      const { data: admins } = await db.from('user_profiles').select('id').in('app_role', ['admin', 'owner']).limit(10);
      if (admins?.length) {
        await db.from('app_notifications').insert(admins.map(a => ({
          user_id: a.id, type: 'homeowner_inquiry', title: type === 'call' ? 'Homeowner requested a call' : 'Homeowner asked a question',
          message: `${details.name} \u00b7 ${address}${type === 'call' ? ` \u00b7 ${when}` : ''}`, severity: 'info', category: 'leads',
          metadata: { lead_id: lead.leadId, inquiry_id: inquiry?.id },
        })));
      }
    } catch { /* optional */ }

    return NextResponse.json({ ok: true, inquiryId: inquiry?.id, leadId: lead.leadId, confirmed, teamNotified });
  } catch (err) {
    console.error('[estimate/contact-request]', err);
    return NextResponse.json({ error: 'We could not send your request. Please email us instead.' }, { status: 500 });
  }
}
