import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  runPersonalizationReconciliation,
  resolveRecipientPersonalization,
  TRAVLR_OUTREACH_TEMPLATE,
  type SmsRecipient,
} from '@/lib/services/smsPersonalizationService';
import { dispatchSMS, isTwilioConfigured } from '@/lib/services/twilioService';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      leadIds,
      templateId,
      templateBody,
      campaignId,
      agentId,
      action, // 'reconcile' | 'send'
    } = body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: 'leadIds array is required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // ── Load canonical lead data from DB (send-time revalidation) ────────────
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select(
        'id, contact_name, contact_phone, owner_name, address, city, state, zip, verified_owner, verified_number, verified_address, has_phone, do_not_contact, enrichment_status'
      )
      .in('id', leadIds);

    if (leadsError) {
      return NextResponse.json({ error: 'Failed to load lead data', details: leadsError.message }, { status: 500 });
    }

    if (!leads || leads.length === 0) {
      return NextResponse.json({ error: 'No leads found for provided IDs' }, { status: 404 });
    }

    // Map DB rows to SmsRecipient shape
    const recipients: SmsRecipient[] = leads.map(l => ({
      leadId: l.id,
      phone: l.contact_phone || '',
      contactName: l.contact_name || '',
      ownerName: l.owner_name || '',
      address: l.address || '',
      city: l.city || '',
      state: l.state || '',
      zip: l.zip || '',
      verifiedOwner: l.verified_owner === true,
      verifiedNumber: l.verified_number === true,
      verifiedAddress: l.verified_address || null,
      hasPhone: l.has_phone === true,
      doNotContact: l.do_not_contact === true,
    }));

    // Filter out DNC leads before personalization
    const dncLeads = recipients.filter(r => r.doNotContact);
    const eligibleForPersonalization = recipients.filter(r => !r.doNotContact && r.phone?.trim());

    // Resolve template
    const template = templateBody?.trim() || TRAVLR_OUTREACH_TEMPLATE;

    // ── Run personalization reconciliation ────────────────────────────────────
    const reconciliation = runPersonalizationReconciliation(eligibleForPersonalization, template);

    // ── RECONCILE action: return preview without sending ─────────────────────
    if (action === 'reconcile' || !action) {
      return NextResponse.json({
        success: true,
        action: 'reconcile',
        dncExcluded: dncLeads.length,
        reconciliation: {
          totalSelected: reconciliation.totalSelected + dncLeads.length,
          personalizationReady: reconciliation.personalizationReady,
          missingFirstName: reconciliation.missingFirstName,
          missingAddress: reconciliation.missingAddress,
          unverifiedFirstName: reconciliation.unverifiedFirstName,
          unverifiedAddress: reconciliation.unverifiedAddress,
          ambiguousOwner: reconciliation.ambiguousOwner,
          ambiguousProperty: reconciliation.ambiguousProperty,
          duplicatePhone: reconciliation.duplicatePhone,
          dncBlocked: dncLeads.length,
          excluded: reconciliation.excluded + dncLeads.length,
          finalQueued: reconciliation.finalQueued,
          hasUnresolvedVariables: reconciliation.hasUnresolvedVariables,
        },
        // Sample previews (up to 10)
        samplePreviews: reconciliation.readyRecipients.slice(0, 10).map(r => ({
          leadId: r.leadId,
          firstName: r.firstName,
          propertyAddress: r.outreachAddress,
          phone: r.phone,
          renderedMessage: r.renderedMessage,
          status: r.status,
          firstNameSource: r.firstNameSource,
          addressSource: r.addressSource,
        })),
        // Excluded recipients with reasons
        excluded: reconciliation.excludedRecipients.map(r => ({
          leadId: r.leadId,
          phone: r.phone,
          status: r.status,
          exclusionReason: r.exclusionReason,
        })),
        // Full recipient table
        recipientTable: reconciliation.recipients.map(r => ({
          leadId: r.leadId,
          firstName: r.firstName,
          propertyAddress: r.outreachAddress,
          phone: r.phone,
          status: r.status,
          exclusionReason: r.exclusionReason,
          firstNameVerified: r.firstNameVerified,
          addressVerified: r.addressVerified,
        })),
        twilioConfigured: isTwilioConfigured(),
      });
    }

    // ── SEND action: dispatch personalized messages ───────────────────────────
    if (action === 'send') {
      if (reconciliation.hasUnresolvedVariables) {
        return NextResponse.json(
          {
            error: 'SAFETY_BLOCK: Unresolved variables detected in ready recipients. Sending aborted.',
            hasUnresolvedVariables: true,
          },
          { status: 422 }
        );
      }

      if (reconciliation.readyRecipients.length === 0) {
        return NextResponse.json(
          { error: 'No recipients passed personalization validation. Nothing to send.' },
          { status: 422 }
        );
      }

      const sendResults: Array<{
        leadId: string;
        phone: string;
        status: string;
        messageSid?: string;
        error?: string;
      }> = [];

      const campaignRef = campaignId || `bulk-${Date.now()}`;

      for (const recipient of reconciliation.readyRecipients) {
        try {
          // Send-time revalidation: reload this specific lead
          const { data: freshLead } = await supabase
            .from('leads')
            .select('contact_phone, do_not_contact, verified_owner, verified_number, verified_address, contact_name, owner_name, address, city, state, zip')
            .eq('id', recipient.leadId)
            .single();

          if (!freshLead || freshLead.do_not_contact) {
            sendResults.push({ leadId: recipient.leadId, phone: recipient.phone, status: 'blocked_dnc' });
            continue;
          }

          // Re-resolve with fresh data to prevent stale personalization
          const freshRecipient: SmsRecipient = {
            leadId: recipient.leadId,
            phone: freshLead.contact_phone || recipient.phone,
            contactName: freshLead.contact_name || '',
            ownerName: freshLead.owner_name || '',
            address: freshLead.address || '',
            city: freshLead.city || '',
            state: freshLead.state || '',
            zip: freshLead.zip || '',
            verifiedOwner: freshLead.verified_owner === true,
            verifiedNumber: freshLead.verified_number === true,
            verifiedAddress: freshLead.verified_address || null,
          };

          const freshResolved = resolveRecipientPersonalization(freshRecipient, template);

          if (freshResolved.status !== 'READY') {
            sendResults.push({
              leadId: recipient.leadId,
              phone: recipient.phone,
              status: 'personalization_failed',
              error: freshResolved.exclusionReason,
            });
            continue;
          }

          // Dispatch via Twilio
          const result = await dispatchSMS({
            to: freshResolved.phone,
            body: freshResolved.renderedMessage,
            leadId: recipient.leadId,
            templateId: templateId ?? undefined,
            agentId: agentId ?? undefined,
            metadata: { bulkBatch: true, campaignId: campaignRef },
          });

          // Store exact rendered message audit record
          await supabase.from('sms_campaign_sends').insert({
            campaign_id: campaignRef,
            template_id: templateId || 'travlr_outreach_v1',
            template_version: '1.0',
            lead_id: recipient.leadId,
            phone: freshResolved.phone,
            resolved_first_name: freshResolved.firstName,
            resolved_address: freshResolved.outreachAddress,
            first_name_source: freshResolved.firstNameSource,
            address_source: freshResolved.addressSource,
            first_name_verified: freshResolved.firstNameVerified,
            address_verified: freshResolved.addressVerified,
            rendered_message: freshResolved.renderedMessage,
            rendered_at: new Date().toISOString(),
            twilio_message_sid: result.messageSid || null,
            send_status: result.success ? 'sent' : 'failed',
            personalization_status: 'READY',
          });

          // Also log to outreach_history
          await supabase.from('outreach_history').insert({
            lead_id: recipient.leadId,
            channel: 'sms',
            template_id: templateId ?? null,
            agent_id: agentId ?? null,
            status: result.success ? 'sent' : 'failed',
            sent_at: new Date().toISOString(),
            metadata: {
              to: freshResolved.phone,
              message_sid: result.messageSid,
              bulk_batch: true,
              campaign_id: campaignRef,
              resolved_first_name: freshResolved.firstName,
              resolved_address: freshResolved.outreachAddress,
              rendered_message: freshResolved.renderedMessage,
            },
          });

          sendResults.push({
            leadId: recipient.leadId,
            phone: freshResolved.phone,
            status: result.success ? 'sent' : 'failed',
            messageSid: result.messageSid,
          });
        } catch (err) {
          sendResults.push({
            leadId: recipient.leadId,
            phone: recipient.phone,
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      const sentCount = sendResults.filter(r => r.status === 'sent').length;
      const failedCount = sendResults.filter(r => r.status === 'failed' || r.status === 'error').length;
      const blockedCount = sendResults.filter(r => r.status === 'blocked_dnc' || r.status === 'personalization_failed').length;

      return NextResponse.json({
        success: true,
        action: 'send',
        campaignId: campaignRef,
        sentCount,
        failedCount,
        blockedCount,
        totalAttempted: sendResults.length,
        results: sendResults,
        twilioConfigured: isTwilioConfigured(),
      });
    }

    return NextResponse.json({ error: 'Invalid action. Use "reconcile" or "send".' }, { status: 400 });
  } catch (err) {
    console.error('[Bulk SMS Personalization API]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    service: 'TRAVLR Bulk SMS Personalization',
    version: '1.0',
    twilioConfigured: isTwilioConfigured(),
    template: TRAVLR_OUTREACH_TEMPLATE,
    actions: ['reconcile', 'send'],
    description: 'POST with { leadIds, action: "reconcile"|"send", templateBody? } to personalize and dispatch bulk SMS.',
  });
}
