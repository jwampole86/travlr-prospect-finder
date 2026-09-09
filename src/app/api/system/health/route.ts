import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type HealthStatus = 'operational' | 'degraded' | 'outage' | 'maintenance';

function configured(value: string | undefined): boolean {
  return Boolean(value && !/your-|placeholder|changeme|example/i.test(value));
}

export async function GET() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  const twilioReady = configured(process.env.TWILIO_ACCOUNT_SID) && configured(process.env.TWILIO_AUTH_TOKEN) && configured(process.env.TWILIO_FROM_NUMBER);
  checks.sms = {
    status: twilioReady ? 'operational' : 'maintenance',
    responseTime: null,
    detail: twilioReady ? 'Twilio credentials configured' : 'Twilio credentials are not configured',
  };

  const emailReady = configured(process.env.RESEND_API_KEY);
  checks.email = {
    status: emailReady ? 'operational' : 'maintenance',
    responseTime: null,
    detail: emailReady ? 'Resend credentials configured' : 'Resend credentials are not configured',
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
