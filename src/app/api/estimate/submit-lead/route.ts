import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';
import { getChatCompletion } from '@/lib/ai/chatCompletion';

// ─── Lead Submission API ──────────────────────────────────────────────────────
// Handles self-submitted homeowner leads from the landing page.
// Uses Claude to structure the submission and generate a plain-language summary.
// Deduplicates against existing leads by address.
// Auto-triggers BatchData Stage 1 enrichment on new lead creation.

interface SubmissionPayload {
  address: string;
  estimate: {
    estimatedADR: number;
    estimatedOccupancy: number;
    grossMonthly: number;
    netMonthly: number;
    annualNet: number;
    regulationSummary: string;
    regulationStatus: string;
  };
  contact: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
  };
  qualification: {
    propertyType: string;
    rentalStatus: string;
    timelineInterest: string;
    smsConsent?: boolean;
  };
}

export async function POST(req: NextRequest) {
  try {
    const payload: SubmissionPayload = await req.json();
    const { address, estimate, contact, qualification } = payload;

    if (!address || !contact?.email) {
      return NextResponse.json({ error: 'Address and email required' }, { status: 400 });
    }

    // ── 1. Generate Claude summary ────────────────────────────────────────────
    let claudeSummary = '';
    try {
      const summaryResponse = await getChatCompletion(
        'ANTHROPIC',
        'claude-haiku-4-5-20251001',
        [
          {
            role: 'system',
            content: 'You are a CRM assistant for TRAVLR Vacation Homes. Generate a concise, plain-language summary of a homeowner self-submission for an agent to read. Be specific and factual. 2-3 sentences max.',
          },
          {
            role: 'user',
            content: `Homeowner self-submitted via landing page.
Address: ${address}
Name: ${contact.firstName} ${contact.lastName}
Phone: ${contact.phone}
Email: ${contact.email}
Property type: ${qualification.propertyType || 'not specified'}
Current rental status: ${qualification.rentalStatus || 'not specified'}
Timeline interest: ${qualification.timelineInterest || 'not specified'}
Estimate shown: $${estimate?.netMonthly?.toLocaleString()}/mo net, $${estimate?.annualNet?.toLocaleString()}/yr annual net.

Write a 2-3 sentence agent-facing summary.`,
          },
        ],
        { max_tokens: 200, temperature: 0.3 }
      );
      claudeSummary = summaryResponse?.choices?.[0]?.message?.content ?? '';
    } catch {
      claudeSummary = `Homeowner self-submitted via landing page for ${address}. Property type: ${qualification.propertyType || 'unspecified'}. Timeline: ${qualification.timelineInterest || 'unspecified'}.`;
    }

    // ── 2. Check for existing lead (dedup by address) ─────────────────────────
    const supabase = createClient();

    const normalizedAddress = address.toLowerCase().trim();
    const { data: existingLeads } = await supabase
      .from('leads')
      .select('id, address, stage, contact_name')
      .ilike('address', `%${normalizedAddress.split(',')[0]}%`)
      .limit(3);

    const matchedLead = existingLeads?.find(l =>
      l.address?.toLowerCase().includes(normalizedAddress.split(',')[0].toLowerCase())
    );

    const landingPageSubmission = {
      submitted_at: new Date().toISOString(),
      estimate_shown: estimate
        ? {
            adr: estimate.estimatedADR,
            occupancy: estimate.estimatedOccupancy,
            gross_monthly: estimate.grossMonthly,
            net_monthly: estimate.netMonthly,
            annual_net: estimate.annualNet,
          }
        : null,
      contact_capture: {
        first_name: contact.firstName,
        last_name: contact.lastName,
        phone: contact.phone,
        email: contact.email,
      },
      optional_questionnaire: {
        property_type: qualification.propertyType,
        rental_status: qualification.rentalStatus,
        timeline_interest: qualification.timelineInterest,
      },
      claude_summary: claudeSummary,
    };

    if (matchedLead) {
      // ── 3a. Merge into existing lead ─────────────────────────────────────────
      await supabase
        .from('leads')
        .update({
          contact_name: `${contact.firstName} ${contact.lastName}`,
          phone: contact.phone,
          email: contact.email,
          lead_source_type: 'self_submitted',
          lead_status_tag: 'Inbound — Self-Qualified',
          landing_page_submission: landingPageSubmission,
          // Grant contact info access — homeowner has given consent via form submission
          contact_info_requested: true,
          contact_info_requested_at: new Date().toISOString(),
          // Self-submitted leads are NOT synthetic — they are real homeowner submissions
          is_synthetic: false,
        } as any)
        .eq('id', matchedLead.id);

      // Log activity
      await supabase.from('activity_events').insert({
        lead_id: matchedLead.id,
        event_type: 'note',
        title: 'Homeowner self-submitted via landing page',
        body: claudeSummary,
        metadata: { source: 'landing_page', merged: true },
      } as any).catch(() => {});

      // Trigger BatchData enrichment for merged lead (fire-and-forget)
      fetch('/api/enrichment/batchdata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: matchedLead.id, address, prospectScore: 70 }),
      }).catch(() => {});

      return NextResponse.json({ success: true, leadId: matchedLead.id, merged: true });
    } else {
      // ── 3b. Create new lead ───────────────────────────────────────────────────
      const { data: newLead, error: insertError } = await supabase
        .from('leads')
        .insert({
          address,
          contact_name: `${contact.firstName} ${contact.lastName}`,
          phone: contact.phone,
          email: contact.email,
          source: 'self_submitted',
          lead_source_type: 'self_submitted',
          lead_status_tag: 'Inbound — Self-Qualified',
          stage: 'nurturing',
          cadence_step: 0,
          email_opt_in: true,
          email_opt_in_at: new Date().toISOString(),
          sms_opt_in: qualification?.smsConsent === true,
          sms_opt_in_at: qualification?.smsConsent === true ? new Date().toISOString() : null,
          opt_in_source: 'landing_page_form',
          landing_page_submission: landingPageSubmission,
          notes: claudeSummary,
          // Grant contact info access — homeowner has given consent via form submission
          contact_info_requested: true,
          contact_info_requested_at: new Date().toISOString(),
          // Self-submitted leads are real homeowner data, not synthetic
          is_synthetic: false,
        } as any)
        .select('id')
        .single();

      if (insertError) {
        console.warn('[estimate/submit-lead] insert error:', insertError.message);
        return NextResponse.json({ success: true, leadId: null, merged: false });
      }

      // Auto-enroll in default cadence sequence
      if (newLead?.id) {
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
            ? new Date(Date.now() + ((firstStep.delay_days || 0) * 86400000) + ((firstStep.delay_hours || 0) * 3600000)).toISOString()
            : new Date().toISOString();

          await supabase.from('cadence_enrollments').insert({
            lead_id: newLead.id,
            sequence_id: defaultSeq.id,
            current_step: 0,
            status: 'active',
            next_send_at: nextSendAt,
            enrolled_at: new Date().toISOString(),
            metadata: { enroll_reason: 'form_submission_auto_trigger' },
          }).catch(() => {});

          await supabase.from('leads').update({ next_scheduled_touch_at: nextSendAt }).eq('id', newLead.id).catch(() => {});
        }

        // Log activity
        await supabase.from('activity_events').insert({
          lead_id: newLead.id,
          event_type: 'note',
          title: 'Homeowner self-submitted via landing page',
          body: claudeSummary,
          metadata: { source: 'landing_page', merged: false },
        } as any).catch(() => {});

        // Log admin event
        await supabase.from('admin_event_log').insert({
          event_type: 'lead_created',
          event_category: 'lead_change',
          lead_id: newLead.id,
          title: 'New lead created via landing page form',
          description: `Self-submitted: ${address}`,
          severity: 'info',
          new_value: { stage: 'nurturing', source: 'self_submitted' },
          event_timestamp: new Date().toISOString(),
        }).catch(() => {});

        // ── 4. Auto-trigger BatchData Stage 1 enrichment ──────────────────────
        // Fire-and-forget: enrich owner name, mailing address, ownership type
        fetch('/api/enrichment/batchdata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId: newLead.id, address, prospectScore: 70 }),
        }).catch(() => {});
      }

      return NextResponse.json({ success: true, leadId: newLead?.id, merged: false });
    }
  } catch (err) {
    console.error('[estimate/submit-lead]', err);
    return NextResponse.json({ error: 'Submission failed' }, { status: 500 });
  }
}
