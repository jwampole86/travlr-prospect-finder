import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getResendConfigStatus } from '@/lib/email/resend';
import { getTwilioConfigStatus } from '@/lib/services/twilioService';

type HealthStatus = 'operational' | 'degraded' | 'outage' | 'maintenance';

function configured(value: string | undefined): boolean {
  return Boolean(value && !/your-|placeholder|changeme|example/i.test(value));
}

// GET /api/system/health is intentionally public — it backs /system-health,
// a public "status.travlr.com"-style page with no login wall. It previously
// required an authenticated session and 401'd for every anonymous visitor,
// which made the public status page report every service as "Outage" for
// anyone not logged in. None of the checks below expose sensitive data: the
// leads query uses head:true/count-only (no rows returned), and the rest are
// just configured/not-configured booleans for third-party providers.
export async function GET() {
  const supabase = await createClient();

  const checkedAt = new Date().toISOString();
  const checks: Record<string, { status: HealthStatus; responseTime: number | null; detail: string }> = {};

  const dbStart = Date.now();
  try {
    const { error } = await supabase.from('leads').select('id', { head: true, count: 'exact' }).limit(1);
    const responseTime = Date.now() - dbStart;
    checks.database = error
      ? { status: 'outage', responseTime, detail: error.message }
      : { status: responseTime > 2000 ? 'degraded' : 'operational', responseTime, detail: 'Database query succeeded' };
  } catch (error) {
    checks.database = { status: 'outage', responseTime: Date.now() - dbStart, detail: error instanceof Error ? error.message : 'Database check failed' };
  }

  checks.api = { status: 'operational', responseTime: 0, detail: 'Health endpoint responding' };

  const twilioStatus = getTwilioConfigStatus();
  const twilioReady = twilioStatus.smsConfigured;
  checks.sms = {
    status: twilioReady ? 'operational' : 'maintenance',
    responseTime: null,
    detail: twilioReady ? `Twilio SMS configured via ${twilioStatus.authMode}` : `Twilio incomplete: ${twilioStatus.missing.join(', ')}`,
  };

  const resendStatus = getResendConfigStatus();
  const emailReady = resendStatus.apiKeyConfigured && resendStatus.senderConfigured;
  checks.email = {
    status: emailReady ? 'operational' : 'maintenance',
    responseTime: null,
    detail: emailReady
      ? `Resend configured for ${resendStatus.senderDomain}`
      : 'Resend API key or sender email is not configured',
  };

  const enrichmentReady = configured(process.env.BATCHDATA_API_KEY) || configured(process.env.PROPERTYREACH_API_KEY);
  checks.enrichment = {
    status: enrichmentReady ? 'operational' : 'maintenance',
    responseTime: null,
    detail: enrichmentReady ? 'Authorized enrichment provider configured' : 'No authorized enrichment provider configured',
  };

  checks.webhooks = {
    status: 'operational',
    responseTime: null,
    detail: 'Webhook routes are available; delivery is verified per provider event',
  };

  return NextResponse.json({ checkedAt, checks }, { headers: { 'Cache-Control': 'no-store' } });
}
