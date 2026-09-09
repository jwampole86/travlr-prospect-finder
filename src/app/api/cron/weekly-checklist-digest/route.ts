import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getResendClient, getResendFrom } from '@/lib/email/resend';
import { verifyJobRequest } from '@/lib/jobAuth';

/**
 * POST /api/cron/weekly-checklist-digest
 * Sends weekly digest emails to homeowners listing pending/under-review checklist steps
 * and documents. Protected by SEQUENCE_JOB_SECRET header (cron) or an authenticated admin session (UI).
 * Designed to run weekly via an external cron scheduler.
 */

const STEP_LABELS: Record<number, string> = {
  1: 'Assessment & Prep',
  2: 'Legal & Compliance',
  3: 'Photography & Content',
  4: 'Operations Setup',
  5: 'Listing Creation',
  6: 'Pre-Launch QA',
};

function buildDigestHtml(params: {
  homeownerName: string;
  propertyAddress: string;
  pendingSteps: Array<{ step_number: number; status: string }>;
  pendingDocs: Array<{ document_category: string; step_number: number; review_status: string }>;
  portalUrl: string;
}): string {
  const { homeownerName, propertyAddress, pendingSteps, pendingDocs, portalUrl } = params;

  const stepRows = pendingSteps
    .map(
      s => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6; font-size: 14px; color: #374151;">
          Step ${s.step_number}: ${STEP_LABELS[s.step_number] ?? 'Checklist Step'}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6; text-align: right;">
          <span style="display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; background: ${s.status === 'in_progress' ? '#fef3c7' : '#f3f4f6'}; color: ${s.status === 'in_progress' ? '#92400e' : '#6b7280'};">
            ${s.status === 'in_progress' ? 'In Progress' : 'Not Started'}
          </span>
        </td>
      </tr>`
    )
    .join('');

  const docRows = pendingDocs
    .map(
      d => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6; font-size: 14px; color: #374151;">
          ${d.document_category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          <span style="font-size: 12px; color: #9ca3af; margin-left: 6px;">(Step ${d.step_number})</span>
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f3f4f6; text-align: right;">
          <span style="display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; background: #dbeafe; color: #1e40af;">
            ${d.review_status === 'under_review' ? 'Under Review' : 'Pending Review'}
          </span>
        </td>
      </tr>`
    )
    .join('');

  const hasPendingSteps = pendingSteps.length > 0;
  const hasPendingDocs = pendingDocs.length > 0;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin: 0; padding: 0; background: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <div style="max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px 32px 28px;">
      <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.7); letter-spacing: 0.08em; text-transform: uppercase;">TRAVLR Vacation Homes</p>
      <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff;">Weekly Onboarding Update</h1>
      <p style="margin: 8px 0 0; font-size: 14px; color: rgba(255,255,255,0.8);">${propertyAddress}</p>
    </div>

    <!-- Body -->
    <div style="padding: 28px 32px;">
      <p style="margin: 0 0 20px; font-size: 15px; color: #374151; line-height: 1.6;">
        Hi ${homeownerName},<br /><br />
        Here's a quick summary of what's still pending on your STR-Ready Checklist. Completing these steps keeps your onboarding on track.
      </p>

      ${hasPendingSteps ? `
      <!-- Pending Steps -->
      <h2 style="margin: 0 0 12px; font-size: 15px; font-weight: 600; color: #111827;">Checklist Steps Needing Attention</h2>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Step</th>
            <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Status</th>
          </tr>
        </thead>
        <tbody>${stepRows}</tbody>
      </table>` : ''}

      ${hasPendingDocs ? `
      <!-- Pending Documents -->
      <h2 style="margin: 0 0 12px; font-size: 15px; font-weight: 600; color: #111827;">Documents Under Review</h2>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 10px 12px; text-align: left; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Document</th>
            <th style="padding: 10px 12px; text-align: right; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Status</th>
          </tr>
        </thead>
        <tbody>${docRows}</tbody>
      </table>` : ''}

      <!-- CTA -->
      <div style="text-align: center; margin: 28px 0 8px;">
        <a href="${portalUrl}" style="display: inline-block; padding: 14px 32px; background: #4f46e5; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.01em;">
          Go to My Checklist →
        </a>
      </div>
      <p style="margin: 12px 0 0; text-align: center; font-size: 12px; color: #9ca3af;">
        Or copy this link: <a href="${portalUrl}" style="color: #4f46e5;">${portalUrl}</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="padding: 20px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
        TRAVLR Vacation Homes · <a href="https://staytrvlr.com" style="color: #6b7280;">staytrvlr.com</a><br />
        You're receiving this because you have an active onboarding checklist.
      </p>
    </div>
  </div>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.staytrvlr.com';
  const portalUrl = `${siteUrl}/homeowner/str-checklist`;

  const results = {
    scanned: 0,
    sent: 0,
    skipped: 0,
    errors: [] as string[],
  };

  try {
    const resend = getResendClient();
    const from = getResendFrom();

    // Load all homeowner-property links with user email
    const { data: links, error: linksErr } = await supabase
      .from('property_homeowners')
      .select('homeowner_user_id, lead_id');

    if (linksErr) {
      return NextResponse.json({ error: linksErr.message }, { status: 500 });
    }

    const allLinks = links ?? [];
    results.scanned = allLinks.length;

    for (const link of allLinks) {
      try {
        const { homeowner_user_id, lead_id } = link;

        // Get homeowner email from auth
        const { data: authData } = await supabase.auth.admin
          ? (supabase as any).auth.admin.getUserById(homeowner_user_id)
          : { data: null };

        // Fallback: query user_profiles
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('email, full_name')
          .eq('id', homeowner_user_id)
          .single();

        const email = authData?.user?.email || profileData?.email;
        const name = authData?.user?.user_metadata?.full_name || profileData?.full_name || 'Homeowner';

        if (!email) {
          results.skipped++;
          continue;
        }

        // Get lead address
        const { data: leadData } = await supabase
          .from('leads')
          .select('address, city, state')
          .eq('id', lead_id)
          .single();

        const propertyAddress = leadData
          ? `${leadData.address}, ${leadData.city}, ${leadData.state}`
          : 'Your Property';

        // Get pending/in_progress checklist steps
        const { data: stepsData } = await supabase
          .from('str_checklist_steps')
          .select('step_number, status')
          .eq('lead_id', lead_id)
          .in('status', ['pending', 'in_progress']);

        // Get pending/under_review documents
        const { data: docsData } = await supabase
          .from('str_checklist_documents')
          .select('document_category, step_number, review_status')
          .eq('lead_id', lead_id)
          .in('review_status', ['pending_review', 'under_review']);

        const pendingSteps = stepsData ?? [];
        const pendingDocs = docsData ?? [];

        // Skip if nothing pending
        if (pendingSteps.length === 0 && pendingDocs.length === 0) {
          results.skipped++;
          continue;
        }

        const html = buildDigestHtml({
          homeownerName: name,
          propertyAddress,
          pendingSteps,
          pendingDocs,
          portalUrl,
        });

        const pendingCount = pendingSteps.length + pendingDocs.length;
        const subject = `Action needed: ${pendingCount} item${pendingCount !== 1 ? 's' : ''} pending on your STR checklist`;

        const { data: resendData, error: resendError } = await resend.emails.send({
          from,
          to: [email],
          subject,
          html,
        });

        if (resendError) {
          results.errors.push(`${email}: ${resendError.message || 'Resend error'}`);
          continue;
        }

        // Log to activity_events
        await supabase.from('activity_events').insert({
          user_id: homeowner_user_id,
          lead_id,
          lead_address: leadData?.address ?? null,
          lead_state: leadData?.state ?? null,
          event_type: 'email_sent',
          description: `Weekly checklist digest sent to ${email}`,
          detail: `${pendingSteps.length} pending step(s), ${pendingDocs.length} doc(s) under review`,
          source: 'cron_weekly_digest',
          metadata: {
            resend_id: resendData?.id,
            pending_steps: pendingSteps.length,
            pending_docs: pendingDocs.length,
            digest_type: 'weekly_checklist',
          },
          event_timestamp: new Date().toISOString(),
        });

        results.sent++;
      } catch (err) {
        results.errors.push(err instanceof Error ? err.message : 'Unknown error');
      }
    }

    // Log cron run
    await supabase.from('cron_job_runs').insert({
      job_name: 'weekly-checklist-digest',
      run_id: `digest_${Date.now()}`,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      leads_scanned: results.scanned,
      scores_recalculated: 0,
      reenrichment_triggered: 0,
      property_data_refreshed: 0,
      error_count: results.errors.length,
      errors: results.errors,
      status: results.errors.length === 0 ? 'success' : 'partial',
    });

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    description: 'Weekly checklist digest — sends homeowners a summary of pending/under-review checklist items',
    schedule: 'Weekly (e.g. every Monday 9am)',
    usage: 'POST /api/cron/weekly-checklist-digest with x-job-secret header',
  });
}
