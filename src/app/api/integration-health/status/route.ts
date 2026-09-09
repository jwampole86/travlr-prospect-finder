import { NextResponse } from 'next/server';
import { getTwilioConfigStatus } from '@/lib/services/twilioService';
import { getResendConfigStatus } from '@/lib/email/resend';
import { getDocuSignConfigStatus } from '@/lib/services/docusignService';

function configured(value: string | undefined): boolean {
  return Boolean(value && !/your-|placeholder|changeme|example|here/i.test(value));
}

/**
 * GET /api/integration-health/status
 * Aggregates real configuration + reachability status for outreach integrations.
 * Replaces fabricated mock metrics on the Integration Health page.
 */
export async function GET() {
  const batchDataConfigured = configured(process.env.BATCHDATA_API_KEY);
  const pdlConfigured = configured(process.env.PDL_API_KEY) || configured(process.env.NEXT_PUBLIC_PDL_API_KEY);

  const twilioStatus = getTwilioConfigStatus();
  let twilioReachable = false;
  let twilioError: string | null = null;
  if (twilioStatus.smsConfigured) {
    try {
      const authSid = process.env.TWILIO_ACCOUNT_SID!;
      const authToken = process.env.TWILIO_AUTH_TOKEN!;
      const accountSid = authSid.startsWith('SK') ? process.env.TWILIO_ACCOUNT_SID_MAIN! : authSid;
      const credentials = Buffer.from(`${authSid}:${authToken}`).toString('base64');
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json?PageSize=1`, {
        headers: { Authorization: `Basic ${credentials}` },
        cache: 'no-store',
      });
      twilioReachable = response.ok;
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        twilioError = body?.message || `Twilio returned HTTP ${response.status}`;
      }
    } catch (err) {
      twilioError = err instanceof Error ? err.message : 'Twilio status check failed';
    }
  }

  const resendStatus = getResendConfigStatus();
  const resendConfigured = resendStatus.apiKeyConfigured && resendStatus.senderConfigured;
  let resendReachable = false;
  let resendError: string | null = null;
  if (resendConfigured) {
    try {
      const response = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        cache: 'no-store',
      });
      // Send-only keys get 401 on /domains but can still send — treat as reachable.
      resendReachable = response.ok || response.status === 401;
      if (!response.ok && response.status !== 401) {
        resendError = `Resend returned HTTP ${response.status}`;
      }
    } catch (err) {
      resendError = err instanceof Error ? err.message : 'Resend status check failed';
    }
  }

  const docusignStatus = getDocuSignConfigStatus();
  let docusignReachable = false;
  let docusignError: string | null = null;
  if (docusignStatus.configured) {
    try {
      const { getDocuSignAccessToken } = await import('@/lib/services/docusignService');
      await getDocuSignAccessToken();
      docusignReachable = true;
    } catch (err) {
      docusignError = err instanceof Error ? err.message : 'DocuSign connection failed';
    }
  }

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    integrations: {
      batchdata: {
        configured: batchDataConfigured,
        status: batchDataConfigured ? 'operational' : 'down',
        message: batchDataConfigured ? 'API key configured' : 'BATCHDATA_API_KEY is not set',
      },
      pdl: {
        configured: pdlConfigured,
        status: pdlConfigured ? 'operational' : 'down',
        message: pdlConfigured ? 'API key configured' : 'PDL_API_KEY is not set',
      },
      twilio: {
        configured: twilioStatus.smsConfigured,
        status: !twilioStatus.smsConfigured ? 'down' : twilioReachable ? 'operational' : 'degraded',
        message: !twilioStatus.smsConfigured
          ? `Twilio incomplete: ${twilioStatus.missing.join(', ')}`
          : twilioReachable
            ? 'Twilio credentials validated'
            : twilioError || 'Twilio provider unreachable',
      },
      resend: {
        configured: resendConfigured,
        status: !resendConfigured ? 'down' : resendReachable ? 'operational' : 'degraded',
        message: !resendConfigured
          ? 'Resend API key or sender email is not configured'
          : resendReachable
            ? 'Resend credentials validated'
            : resendError || 'Resend provider unreachable',
      },
      docusign: {
        configured: docusignStatus.configured,
        status: !docusignStatus.configured ? 'down' : docusignReachable ? 'operational' : 'degraded',
        message: !docusignStatus.configured
          ? `DocuSign incomplete: ${docusignStatus.missing.join(', ')}`
          : docusignReachable
            ? 'DocuSign JWT auth validated'
            : docusignError || 'DocuSign connection failed',
      },
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
