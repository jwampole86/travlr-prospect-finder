import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

// ─── POST /api/webhooks/base44-estimate ───────────────────────────────────────
// Incoming webhook from Base44's public /estimate landing page.
// Accepts homeowner form submissions and runs them through the existing
// lead-matching logic: match by address → update existing lead, or create
// a new lead tagged "Warm — Contact Confirmed".
//
// Base44 should POST to:
//   https://travlrpro3047.builtwithrocket.new/api/webhooks/base44-estimate
//
// Optional security: set WEBHOOK_SECRET env var and pass it as
//   Authorization: Bearer <secret>   OR   X-Webhook-Secret: <secret>

interface Base44EstimatePayload {
  first_name?: string;
  firstName?: string;
  last_name?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  address?: string;
  property_address?: string;
  propertyAddress?: string;
  sms_consent?: boolean;
  smsConsent?: boolean;
  // Allow any extra fields Base44 may send
  [key: string]: unknown;
}

function normalizeStreet(address: string): string {
  // Extract the street portion (before first comma) and lowercase/trim
  return address.split(',')[0].toLowerCase().trim();
}

export async function POST(req: NextRequest) {
  // ── 0. Optional webhook secret verification ──────────────────────────────
  const webhookSecret = process.env.WEBHOOK_SECRET;
  const secretConfigured = Boolean(webhookSecret) && !/your-|placeholder|changeme|example/i.test(webhookSecret!);
  if (secretConfigured) {
    const authHeader = req.headers.get('authorization') ?? '';
    const secretHeader = req.headers.get('x-webhook-secret') ?? '';
    const providedSecret = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : secretHeader;

    if (providedSecret !== webhookSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let rawBody: Base44EstimatePayload;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // ── 1. Normalize field names (Base44 may use snake_case or camelCase) ────
  const firstName = (rawBody.first_name ?? rawBody.firstName ?? '').toString().trim();
  const lastName = (rawBody.last_name ?? rawBody.lastName ?? '').toString().trim();
  const phone = (rawBody.phone ?? '').toString().trim();
  const email = (rawBody.email ?? '').toString().trim();
  const address = (
    rawBody.address ?? rawBody.property_address ?? rawBody.propertyAddress ?? ''
  ).toString().trim();
  const smsConsent =
    rawBody.sms_consent === true ||
    rawBody.smsConsent === true ||
    rawBody.sms_consent === 'true' ||
    rawBody.smsConsent === 'true';

  // ── 2. Validate required fields ──────────────────────────────────────────
  if (!address || !email) {
    return NextResponse.json(
      { error: 'property_address and email are required' },
      { status: 400 }
    );
  }

  const contactName = [firstName, lastName].filter(Boolean).join(' ') || email;
  const supabase = createClient();
  const receivedAt = new Date().toISOString();

  // ── 3. Log the raw webhook payload ───────────────────────────────────────
  await supabase
    .from('webhook_logs')
    .insert({
      source: 'base44_estimate',
      payload: rawBody as Record<string, unknown>,
      received_at: receivedAt,
      status: 'processing',
    })
    .then(({ error }) => {
      if (error) console.warn('[base44-webhook] webhook_logs insert:', error.message);
    });

  // ── 4. Address-based lead matching (mirrors submit-lead logic) ───────────
  const streetKey = normalizeStreet(address);

  const { data: existingLeads } = await supabase
    .from('leads')
    .select('id, address, stage, contact_name, assigned_agent_id')
    .ilike('address', `%${streetKey}%`)
    .limit(5);

  const matchedLead = existingLeads?.find(l =>
    normalizeStreet(l.address ?? '').includes(streetKey) ||
    streetKey.includes(normalizeStreet(l.address ?? ''))
  );

  const activityNote = `Homeowner submitted /estimate form on staytrvlr.com. Name: ${contactName}. Phone: ${phone || 'not provided'}. Email: ${email}. SMS consent: ${smsConsent ? 'yes' : 'no'}.`;

  if (matchedLead) {
    // ── 5a. Merge into existing lead ────────────────────────────────────────
    await supabase
      .from('leads')
      .update({
        contact_name: contactName,
        ...(phone ? { phone } : {}),
        email,
        lead_status_tag: 'Warm — Contact Confirmed',
        contact_info_source: 'self_submitted',
        sms_opt_in: smsConsent,
        ...(smsConsent ? { sms_opt_in_at: receivedAt } : {}),
        opt_in_source: 'base44_estimate_form',
        updated_at: receivedAt,
      } as Record<string, unknown>)
      .eq('id', matchedLead.id);

    // Activity log
    await supabase
      .from('activity_events')
      .insert({
        lead_id: matchedLead.id,
        event_type: 'info_request_submitted',
        title: 'Homeowner submitted estimate form (Base44)',
        description: activityNote,
        metadata: {
          source: 'base44_estimate_webhook',
          merged: true,
          sms_consent: smsConsent,
        },
        created_at: receivedAt,
      })
      .catch(() => {});

    // Notify assigned agent if present
    if (matchedLead.assigned_agent_id) {
      await supabase
        .from('notifications')
        .insert({
          user_id: matchedLead.assigned_agent_id,
          type: 'info_request_submitted',
          priority: 'high',
          title: 'Homeowner confirmed contact info via estimate form',
          message: `${contactName} submitted the /estimate form on staytrvlr.com for ${matchedLead.address}. Ready for direct outreach.`,
          lead_id: matchedLead.id,
          read: false,
          created_at: receivedAt,
        })
        .catch(() => {});
    }

    // Update webhook log to success
    await supabase
      .from('webhook_logs')
      .update({ status: 'matched', lead_id: matchedLead.id })
      .eq('source', 'base44_estimate')
      .eq('received_at', receivedAt)
      .catch(() => {});

    return NextResponse.json({
      success: true,
      action: 'updated',
      lead_id: matchedLead.id,
      status_tag: 'Warm — Contact Confirmed',
    });
  } else {
    // ── 5b. Create new lead ─────────────────────────────────────────────────
    const { data: newLead, error: insertError } = await supabase
      .from('leads')
      .insert({
        address,
        contact_name: contactName,
        ...(phone ? { phone } : {}),
        email,
        source: 'self_submitted',
        lead_source_type: 'self_submitted',
        lead_status_tag: 'Warm — Contact Confirmed',
        stage: 'nurturing',
        cadence_step: 0,
        email_opt_in: true,
        email_opt_in_at: receivedAt,
        sms_opt_in: smsConsent,
        sms_opt_in_at: smsConsent ? receivedAt : null,
        opt_in_source: 'base44_estimate_form',
        contact_info_source: 'self_submitted',
        notes: activityNote,
        created_at: receivedAt,
        updated_at: receivedAt,
      } as Record<string, unknown>)
      .select('id')
      .single();

    if (insertError) {
      console.error('[base44-webhook] lead insert error:', insertError.message);

      await supabase
        .from('webhook_logs')
        .update({ status: 'error', error_message: insertError.message })
        .eq('source', 'base44_estimate')
        .eq('received_at', receivedAt)
        .catch(() => {});

      return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
    }

    if (newLead?.id) {
      // Activity log
      await supabase
        .from('activity_events')
        .insert({
          lead_id: newLead.id,
          event_type: 'note',
          title: 'New lead created via Base44 estimate form',
          description: activityNote,
          metadata: {
            source: 'base44_estimate_webhook',
            merged: false,
            sms_consent: smsConsent,
          },
          created_at: receivedAt,
        })
        .catch(() => {});

      // Admin event log
      await supabase
        .from('admin_event_log')
        .insert({
          event_type: 'lead_created',
          event_category: 'lead_change',
          lead_id: newLead.id,
          title: 'New lead created via Base44 estimate webhook',
          description: `Self-submitted from staytrvlr.com /estimate: ${address}`,
          severity: 'info',
          new_value: { stage: 'nurturing', source: 'base44_estimate_webhook', status_tag: 'Warm — Contact Confirmed' },
          event_timestamp: receivedAt,
        })
        .catch(() => {});

      // Auto-enroll in default cadence sequence
      const { data: defaultSeq } = await supabase
        .from('cadence_sequences')
        .select('id, steps')
        .eq('is_default', true)
        .eq('is_active', true)
        .single();

      if (defaultSeq) {
        const steps = Array.isArray(defaultSeq.steps) ? defaultSeq.steps : [];
        const firstStep = steps[0];
        const nextSendAt = firstStep
          ? new Date(
              Date.now() +
                (firstStep.delay_days || 0) * 86400000 +
                (firstStep.delay_hours || 0) * 3600000
            ).toISOString()
          : receivedAt;

        await supabase
          .from('cadence_enrollments')
          .insert({
            lead_id: newLead.id,
            sequence_id: defaultSeq.id,
            current_step: 0,
            status: 'active',
            next_send_at: nextSendAt,
            enrolled_at: receivedAt,
            metadata: { enroll_reason: 'base44_estimate_webhook' },
          })
          .catch(() => {});

        await supabase
          .from('leads')
          .update({ next_scheduled_touch_at: nextSendAt })
          .eq('id', newLead.id)
          .catch(() => {});
      }

      // Update webhook log
      await supabase
        .from('webhook_logs')
        .update({ status: 'created', lead_id: newLead.id })
        .eq('source', 'base44_estimate')
        .eq('received_at', receivedAt)
        .catch(() => {});
    }

    return NextResponse.json({
      success: true,
      action: 'created',
      lead_id: newLead?.id,
      status_tag: 'Warm — Contact Confirmed',
    });
  }
}

// ── GET — health check so Base44 can verify the endpoint is reachable ────────
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'base44-estimate webhook',
    accepts: ['first_name', 'last_name', 'phone', 'email', 'address', 'sms_consent'],
  });
}
