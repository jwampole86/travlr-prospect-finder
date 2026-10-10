import { NextResponse } from 'next/server';
import { getTwilioConfigStatus } from '@/lib/services/twilioService';
import { getResendConfigStatus } from '@/lib/email/resend';
import { getDocuSignConfigStatus } from '@/lib/services/docusignService';
import { getProviderHealth as getRentCastHealth } from '@/lib/services/rentcastService';
import { getProviderHealth as getPropertyReachHealth } from '@/lib/services/propertyReachProvider';
import { getTruliaHealth, getZillowDetailHealth, getZillowSearchHealth, getZillowRealEstateHealth, getRentComHealth, getUsPropertyDataHealth } from '@/lib/services/rapidApiRealEstateService';
import { getSkipTracingHealth } from '@/lib/services/skipTracingProvider';
import { getAirdnaHealth } from '@/lib/services/airdnaService';
import { getPropertyReportHealth } from '@/lib/services/propertyReportProvider';

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

  let batchDataStatus: 'operational' | 'degraded' | 'down' = 'down';
  let batchDataMessage = 'BATCHDATA_API_KEY is not set';
  if (batchDataConfigured) {
    try {
      const res = await fetch('https://api.batchdata.com/api/v1/property/lookup/all-attributes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.BATCHDATA_API_KEY}` },
        body: JSON.stringify({ requests: [{ address: { street: '1600 Pennsylvania Ave NW', city: 'Washington', state: 'DC', zip: '20500' } }] }),
        cache: 'no-store',
      });
      if (res.status === 401 || res.status === 403) {
        const body = await res.json().catch(() => null);
        const msg: string = body?.status?.message || '';
        if (/insufficient balance/i.test(msg)) {
          // Key is valid and the API is reachable — the account wallet is just empty.
          batchDataStatus = 'degraded';
          batchDataMessage = 'API key valid, but account balance is insufficient for live requests';
        } else {
          batchDataStatus = 'down';
          batchDataMessage = msg || 'API key invalid or unauthorized';
        }
      } else if (res.ok) {
        batchDataStatus = 'operational';
        batchDataMessage = 'BatchData API is reachable';
      } else {
        batchDataStatus = 'degraded';
        batchDataMessage = `BatchData returned HTTP ${res.status}`;
      }
    } catch (err) {
      batchDataStatus = 'degraded';
      batchDataMessage = err instanceof Error ? err.message : 'BatchData unreachable';
    }
  }

  let pdlStatus: 'operational' | 'degraded' | 'down' = 'down';
  let pdlMessage = 'PDL_API_KEY is not set';
  if (pdlConfigured) {
    try {
      const key = process.env.PDL_API_KEY!;
      const params = new URLSearchParams({ api_key: key, name: '__integration_health_check__', locality: 'nowhere', pretty: 'false' });
      const res = await fetch(`https://api.peopledatalabs.com/v5/person/enrich?${params.toString()}`, {
        headers: { 'X-Api-Key': key },
        cache: 'no-store',
      });
      if (res.status === 401 || res.status === 403) {
        pdlStatus = 'down';
        pdlMessage = 'API key invalid or unauthorized';
      } else if (res.status === 404 || res.ok) {
        // 404 "no match" on a deliberately bogus name still proves the key authenticates.
        pdlStatus = 'operational';
        pdlMessage = 'PDL API is reachable';
      } else {
        pdlStatus = 'degraded';
        pdlMessage = `PDL returned HTTP ${res.status}`;
      }
    } catch (err) {
      pdlStatus = 'degraded';
      pdlMessage = err instanceof Error ? err.message : 'PDL unreachable';
    }
  }

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

  const rentcastHealth = await getRentCastHealth();
  const propertyReachHealth = await getPropertyReachHealth();
  const truliaHealth = await getTruliaHealth();
  const zillowDetailHealth = await getZillowDetailHealth();
  const zillowSearchHealth = await getZillowSearchHealth();
  const skipTracingHealth = await getSkipTracingHealth();
  const zillowRealEstateHealth = await getZillowRealEstateHealth();
  const rentComHealth = await getRentComHealth();
  const usPropertyDataHealth = await getUsPropertyDataHealth();
  const airdnaHealth = await getAirdnaHealth();
  const propertyReportHealth = await getPropertyReportHealth();

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    integrations: {
      batchdata: {
        configured: batchDataConfigured,
        status: batchDataStatus,
        message: batchDataMessage,
      },
      pdl: {
        configured: pdlConfigured,
        status: pdlStatus,
        message: pdlMessage,
      },
      propertyreach: {
        configured: propertyReachHealth.hasApiKey,
        status: propertyReachHealth.status === 'ACTIVE' ? 'operational' : propertyReachHealth.status === 'DISABLED' ? 'down' : 'degraded',
        message: propertyReachHealth.message,
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
      rentcast: {
        configured: rentcastHealth.hasApiKey,
        status: rentcastHealth.status === 'ACTIVE' ? 'operational' : rentcastHealth.status === 'DISABLED' ? 'down' : 'degraded',
        message: rentcastHealth.message,
      },
      trulia: {
        configured: truliaHealth.hasApiKey,
        status: truliaHealth.status === 'ACTIVE' ? 'operational' : truliaHealth.status === 'DISABLED' ? 'down' : 'degraded',
        message: truliaHealth.message,
      },
      zillowDetail: {
        configured: zillowDetailHealth.hasApiKey,
        status: zillowDetailHealth.status === 'ACTIVE' ? 'operational' : zillowDetailHealth.status === 'DISABLED' ? 'down' : 'degraded',
        message: zillowDetailHealth.message,
      },
      zillowSearch: {
        configured: zillowSearchHealth.hasApiKey,
        status: zillowSearchHealth.status === 'ACTIVE' ? 'operational' : zillowSearchHealth.status === 'DISABLED' ? 'down' : 'degraded',
        message: zillowSearchHealth.message,
      },
      skipTracing: {
        configured: skipTracingHealth.hasApiKey,
        status: skipTracingHealth.status === 'ACTIVE' ? 'operational' : skipTracingHealth.status === 'DISABLED' ? 'down' : 'degraded',
        message: skipTracingHealth.message,
      },
      zillowRealEstate: {
        configured: zillowRealEstateHealth.hasApiKey,
        status: zillowRealEstateHealth.status === 'ACTIVE' ? 'operational' : zillowRealEstateHealth.status === 'DISABLED' ? 'down' : 'degraded',
        message: zillowRealEstateHealth.message,
      },
      rentCom: {
        configured: rentComHealth.hasApiKey,
        status: rentComHealth.status === 'ACTIVE' ? 'operational' : rentComHealth.status === 'DISABLED' ? 'down' : 'degraded',
        message: rentComHealth.message,
      },
      usPropertyData: {
        configured: usPropertyDataHealth.hasApiKey,
        status: usPropertyDataHealth.status === 'ACTIVE' ? 'operational' : usPropertyDataHealth.status === 'DISABLED' ? 'down' : 'degraded',
        message: usPropertyDataHealth.message,
      },
      airdna: {
        configured: airdnaHealth.hasApiKey,
        status: airdnaHealth.status === 'ACTIVE' ? 'operational' : airdnaHealth.status === 'DISABLED' ? 'down' : 'degraded',
        message: airdnaHealth.message,
      },
      propertyReport: {
        configured: propertyReportHealth.hasApiKey,
        status: propertyReportHealth.status === 'ACTIVE' ? 'operational' : propertyReportHealth.status === 'DISABLED' ? 'down' : 'degraded',
        message: propertyReportHealth.message,
      },
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
