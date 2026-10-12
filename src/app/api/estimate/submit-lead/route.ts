import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getChatCompletion } from '@/lib/ai/chatCompletion';
import { buildHomeownerReport } from '@/lib/homeownerEstimate';
import { upsertHomeownerLead, logHomeownerActivity, createFollowUpTask } from '@/lib/homeownerLeads';
import { deliverReportEmail } from '@/lib/homeownerReportDelivery';
import { validateContact } from '@/lib/contactValidation';
import { allowRequest, clientIp } from '@/lib/publicRateLimit';
import { parseEquipment, EQUIPMENT } from '@/lib/homeownerReportContent';

export const maxDuration = 30;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

function nextBusinessDay(): Date {
  const d = new Date();
  do { d.setUTCDate(d.getUTCDate() + 1); } while ([0, 6].includes(d.getUTCDay()));
  d.setUTCHours(16, 0, 0, 0);
  return d;
}

/**
 * POST /api/estimate/submit-lead  (public)
 * The homeowner has seen their estimate and left their details. Creates (or updates) their lead, queues a follow-up call,
 * enrolls new leads in the default nurture sequence and emails the report.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }); }
  if (clean(body.website, 50)) return NextResponse.json({ success: true });

  if (!allowRequest(`submit:${clientIp(req.headers)}`, 8, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  const address = clean(body.address, 300);
  const contact = {
    firstName: clean(body.contact?.firstName, 60),
    lastName: clean(body.contact?.lastName, 60),
    email: clean(body.contact?.email, 160).toLowerCase(),
    phone: clean(body.contact?.phone, 30),
    smsConsent: body.qualification?.smsConsent === true,
  };
  const qualification = {
    propertyType: clean(body.qualification?.propertyType, 80),
    rentalStatus: clean(body.qualification?.rentalStatus, 80),
    timelineInterest: clean(body.qualification?.timelineInterest, 80),
    smsConsent: contact.smsConsent,
    // null = not answered. Stored so the agent knows which safety and smart-home items the home still needs.
    equipment: Array.isArray(body.qualification?.equipment) ? parseEquipment(body.qualification.equipment.join(',')) : null,
  };
  if (address.length < 5 || !EMAIL_RE.test(contact.email) || !contact.firstName) {
    return NextResponse.json({ error: 'Address, name and a valid email are required' }, { status: 400 });
  }

  // Validate on our side too: a bad address means the report never arrives and the lead cannot be reached.
  const check = await validateContact({ email: contact.email, phone: contact.phone, phoneRequired: true, keepEmail: body.contact?.emailConfirmed === true });
  if (Object.keys(check.errors).length) {
    return NextResponse.json({ error: 'Please check your contact details', fields: check.errors, suggestion: check.emailSuggestion }, { status: 422 });
  }
  contact.email = check.email.normalized;
  contact.phone = check.phone.normalized || contact.phone;
  const validation = {
    checked_at: new Date().toISOString(),
    email: { level: check.email.level, code: check.email.code, mx: check.email.mx },
    phone: { level: check.phone.level, code: check.phone.code, normalized: check.phone.normalized },
  };

  let db;
  try { db = getSupabaseAdmin(); } catch { return NextResponse.json({ error: 'Service unavailable' }, { status: 503 }); }

  try {
    const report = await buildHomeownerReport(address);
    const expected = report.scenarios[1];

    const have = new Set(qualification.equipment ?? []);
    const equipmentLine = qualification.equipment === null ? 'not answered' : (EQUIPMENT.filter(e => have.has(e.key)).map(e => e.label).join(', ') || 'none of the listed items');
    let summary = '';
    try {
      const res = await Promise.race([
        getChatCompletion('ANTHROPIC', 'claude-haiku-4-5-20251001', [
          { role: 'system', content: 'You are a CRM assistant for TRAVLR Vacation Homes. Write a concise, factual 2-3 sentence summary of a homeowner self-submission for an agent to read.' },
          { role: 'user', content: `Homeowner self-submitted via the estimate page.\nAddress: ${address}\nName: ${contact.firstName} ${contact.lastName}\nProperty type: ${qualification.propertyType || 'not specified'}\nCurrent rental status: ${qualification.rentalStatus || 'not specified'}\nTimeline: ${qualification.timelineInterest || 'not specified'}\nExisting equipment: ${equipmentLine}\nEstimate shown: $${expected.netMonthly.toLocaleString()}/mo net, $${expected.annualNet.toLocaleString()}/yr. Local rules: ${report.regulation.headline}.` },
        ], { max_tokens: 200, temperature: 0.3 }),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 8000)),
      ]);
      summary = res?.choices?.[0]?.message?.content ?? '';
    } catch { /* fall back below */ }
    if (!summary) {
      summary = `Homeowner self-submitted via the estimate page for ${address}. Property type: ${qualification.propertyType || 'unspecified'}. Timeline: ${qualification.timelineInterest || 'unspecified'}.`;
    }

    const lead = await upsertHomeownerLead(db, { address, report, contact, origin: 'estimate_form', qualification, summary, validation });

    const phoneLine = contact.phone ? `Phone: ${contact.phone}` : 'No phone given';
    await Promise.allSettled([
      createFollowUpTask(db, lead, {
        title: `Call new homeowner inquiry: ${contact.firstName} ${contact.lastName}`.trim(),
        description: `${summary}\nEmail: ${contact.email}\n${phoneLine}\nTimeline: ${qualification.timelineInterest || 'not specified'}\nExisting equipment: ${equipmentLine}`,
        type: 'call', due: nextBusinessDay(),
      }),
      logHomeownerActivity(db, lead, { title: 'Homeowner self-submitted via estimate page', body: summary, kind: 'homeowner_estimate_submitted', metadata: { merged: lead.merged } }),
    ]);

    if (!lead.merged) {
      try {
        const { data: seq } = await db.from('cadence_sequences').select('id, steps').eq('is_default', true).eq('is_active', true).limit(1).maybeSingle();
        if (seq) {
          const first = (Array.isArray(seq.steps) ? seq.steps : [])[0] as { delay_days?: number; delay_hours?: number } | undefined;
          const nextSendAt = new Date(Date.now() + ((first?.delay_days || 0) * 86_400_000) + ((first?.delay_hours || 0) * 3_600_000)).toISOString();
          await db.from('cadence_enrollments').insert({ lead_id: lead.leadId, sequence_id: seq.id, current_step: 0, status: 'active', next_send_at: nextSendAt, enrolled_at: new Date().toISOString(), metadata: { enroll_reason: 'estimate_form_submission' } });
          await db.from('leads').update({ next_scheduled_touch_at: nextSendAt }).eq('id', lead.leadId);
        }
      } catch { /* enrollment is optional */ }
    }

    const base = (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, '');
    const delivery = await deliverReportEmail(db, { base, address, leadId: lead.leadId, firstName: contact.firstName, to: contact.email, report, equipment: qualification.equipment ?? undefined });
    return NextResponse.json({ success: true, leadId: lead.leadId, merged: lead.merged, emailed: delivery.ok, emailError: delivery.ok ? null : delivery.error });
  } catch (err) {
    console.error('[estimate/submit-lead]', err);
    return NextResponse.json({ error: 'We could not save your details. Please try again.' }, { status: 500 });
  }
}
