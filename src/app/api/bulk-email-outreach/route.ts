import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveVariables } from '@/lib/services/variableResolutionService';
import { getResendClient, getResendFrom } from '@/lib/email/resend';

interface BulkEmailPayload {
  templateId: string;
  leadIds: string[];
  senderName?: string;
  senderEmail?: string;
  dryRun?: boolean;
}

interface Lead {
  id: string;
  email: string | null;
  contact_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  source: string | null;
  stage: string | null;
  email_opt_in: boolean | null;
  do_not_contact: boolean | null;
  portfolio: string | null;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string | null;
  portfolio: string | null;
}

function fillVariables(text: string, lead: Lead, senderName: string): string {
  const resolved = resolveVariables(
    { contactName: lead.contact_name || '', address: lead.address || '', city: lead.city || '', state: lead.state || '' },
    { senderName }
  );
  return (text || '')
    .replace(/\{\{contactName\}\}/g, resolved.contactName)
    .replace(/\{\{senderName\}\}/g, resolved.senderName || senderName)
    .replace(/\{\{address\}\}/g, resolved.address)
    .replace(/\{\{city\}\}/g, lead.city || '')
    .replace(/\{\{state\}\}/g, lead.state || '')
    .replace(/\{\{price\}\}/g, lead.price ? `$${lead.price.toLocaleString()}` : '')
    .replace(/\{\{beds\}\}/g, String(lead.beds || ''))
    .replace(/\{\{baths\}\}/g, String(lead.baths || ''))
    .replace(/\{\{source\}\}/g, lead.source || '')
    .replace(/\{\{proposedRent\}\}/g, '')
    .replace(/\{\{leaseTerm\}\}/g, '')
    .replace(/\{\{proposedStartDate\}\}/g, '')
    .replace(/\{\{localBlurb\}\}/g, resolved.localBlurb);
}

function extractTemplateText(body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) {
      return parsed
        .map((block: { content?: string }) => block.content || '')
        .filter(Boolean)
        .join('\n\n');
    }
  } catch { /* plain text template */ }
  return body || '';
}

function buildHtml(body: string): string {
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1a1a1a;line-height:1.7;font-size:15px;">
  <p style="white-space:pre-wrap;">${escaped}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;">
  <p style="font-size:11px;color:#9ca3af;">
    You are receiving this email because you listed a property that may be a fit for our vacation rental program.
    To unsubscribe, reply with STOP or 
    <a href="{{unsubscribeUrl}}" style="color:#6b7280;">click here</a>.
  </p>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  try {
    const body: BulkEmailPayload = await req.json();
    const { templateId, leadIds, senderName = process.env.RESEND_FROM_NAME || 'TRAVLR Team', dryRun = false } = body;
    const resend = getResendClient();
    const from = getResendFrom();

    if (!templateId || !leadIds?.length) {
      return NextResponse.json({ success: false, error: 'Missing templateId or leadIds' }, { status: 400 });
    }

    if (leadIds.length > 500) {
      return NextResponse.json({ success: false, error: 'Batch size exceeds 500 leads. Split into smaller batches.' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Fetch template
    const { data: template, error: tplErr } = await supabase
      .from('email_templates')
      .select('id, name, subject, body, category, portfolio')
      .eq('id', templateId)
      .single();

    if (tplErr || !template) {
      return NextResponse.json({ success: false, error: 'Template not found' }, { status: 404 });
    }

    const tpl = template as EmailTemplate;

    // Fetch leads in batches of 100 (Supabase limit)
    const allLeads: Lead[] = [];
    for (let i = 0; i < leadIds.length; i += 100) {
      const chunk = leadIds.slice(i, i + 100);
      const { data: chunkLeads } = await supabase
        .from('leads')
        .select('id, email, contact_name, address, city, state, price, beds, baths, source, stage, email_opt_in, do_not_contact, portfolio')
        .in('id', chunk);
      if (chunkLeads) allLeads.push(...(chunkLeads as Lead[]));
    }

    // Compliance filter
    const eligible = allLeads.filter(l => {
      if (!l.email) return false;
      if (l.do_not_contact === true) return false;
      if (l.email_opt_in === false) return false;
      return true;
    });

    const skipped = allLeads.length - eligible.length;
    const skippedReasons = {
      noEmail: allLeads.filter(l => !l.email).length,
      doNotContact: allLeads.filter(l => l.do_not_contact === true).length,
      optedOut: allLeads.filter(l => l.email_opt_in === false && l.do_not_contact !== true && l.email).length,
    };

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        totalRequested: leadIds.length,
        eligible: eligible.length,
        skipped,
        skippedReasons,
        templateName: tpl.name,
        sampleSubject: eligible[0] ? fillVariables(tpl.subject, eligible[0], senderName) : tpl.subject,
        sampleBody: eligible[0] ? fillVariables(extractTemplateText(tpl.body), eligible[0], senderName) : extractTemplateText(tpl.body),
      });
    }

    // Send emails
    const results: { leadId: string; email: string; success: boolean; resendId?: string; error?: string }[] = [];
    const outreachRows: Record<string, unknown>[] = [];
    const deliveryEventRows: Record<string, unknown>[] = [];
    const campaignId: string | null = (body as Record<string, unknown>).campaignId as string | null || null;

    for (const lead of eligible) {
      const filledSubject = fillVariables(tpl.subject, lead, senderName);
      const filledBody = fillVariables(extractTemplateText(tpl.body), lead, senderName);
      const html = buildHtml(filledBody).replace('{{unsubscribeUrl}}', '#');
      const eventTimestamp = new Date().toISOString();

      try {
        const { data: emailData, error: emailErr } = await resend.emails.send({
          from,
          to: [lead.email!],
          subject: filledSubject,
          html,
          tags: [
            { name: 'portfolio', value: lead.portfolio || 'unknown' },
            { name: 'template_id', value: tpl.id },
            { name: 'category', value: tpl.category || 'outreach' },
            { name: 'lead_id', value: lead.id },
          ],
        });

        if (emailErr) {
          results.push({ leadId: lead.id, email: lead.email!, success: false, error: emailErr.message });
          outreachRows.push({
            lead_id: lead.id,
            channel: 'email',
            subject: filledSubject,
            body_preview: filledBody.slice(0, 200),
            full_body: filledBody,
            status: 'failed',
            failure_reason: emailErr.message,
            recipient_email: lead.email,
            template_id: tpl.id,
            sent_at: eventTimestamp,
          });
          // Log delivery event
          if (campaignId) {
            deliveryEventRows.push({
              campaign_id: campaignId,
              channel: 'email',
              recipient: lead.email!,
              lead_id: lead.id,
              status: 'failed',
              error_message: emailErr.message,
              provider_name: 'resend',
              provider_message_id: null,
              timestamp: eventTimestamp,
            });
          }
        } else {
          results.push({ leadId: lead.id, email: lead.email!, success: true, resendId: emailData?.id });
          outreachRows.push({
            lead_id: lead.id,
            channel: 'email',
            subject: filledSubject,
            body_preview: filledBody.slice(0, 200),
            full_body: filledBody,
            status: 'sent',
            recipient_email: lead.email,
            template_id: tpl.id,
            sent_at: eventTimestamp,
          });
          // Log delivery event
          if (campaignId) {
            deliveryEventRows.push({
              campaign_id: campaignId,
              channel: 'email',
              recipient: lead.email!,
              lead_id: lead.id,
              status: 'delivered',
              error_message: null,
              provider_name: 'resend',
              provider_message_id: emailData?.id || null,
              timestamp: eventTimestamp,
            });
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Send error';
        results.push({ leadId: lead.id, email: lead.email!, success: false, error: msg });
        outreachRows.push({
          lead_id: lead.id,
          channel: 'email',
          subject: filledSubject,
          body_preview: filledBody.slice(0, 200),
          status: 'failed',
          failure_reason: msg,
          recipient_email: lead.email,
          template_id: tpl.id,
          sent_at: eventTimestamp,
        });
        if (campaignId) {
          deliveryEventRows.push({
            campaign_id: campaignId,
            channel: 'email',
            recipient: lead.email!,
            lead_id: lead.id,
            status: 'failed',
            error_message: msg,
            provider_name: 'resend',
            provider_message_id: null,
            timestamp: eventTimestamp,
          });
        }
      }

      // Rate limit: 2 per second to stay within Resend free tier
      await new Promise(r => setTimeout(r, 500));
    }

    // Batch insert outreach history
    if (outreachRows.length > 0) {
      for (let i = 0; i < outreachRows.length; i += 50) {
        await supabase.from('outreach_history').insert(outreachRows.slice(i, i + 50));
      }
    }

    // Batch insert delivery events
    if (deliveryEventRows.length > 0) {
      for (let i = 0; i < deliveryEventRows.length; i += 50) {
        await supabase.from('campaign_delivery_events').insert(deliveryEventRows.slice(i, i + 50)).catch(() => {});
      }
    }

    const sent = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      totalRequested: leadIds.length,
      eligible: eligible.length,
      sent,
      failed,
      skipped,
      skippedReasons,
      templateName: tpl.name,
      results: results.map(r => ({ leadId: r.leadId, success: r.success, error: r.error })),
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
