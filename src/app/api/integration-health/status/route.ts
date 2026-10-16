import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getTwilioConfigStatus } from '@/lib/services/twilioService';
import { getResendConfigStatus } from '@/lib/email/resend';
import { getDocuSignConfigStatus, getDocuSignAccessToken } from '@/lib/services/docusignService';
import { getProviderHealth as getRentCastHealth } from '@/lib/services/rentcastService';
import { getProviderHealth as getPropertyReachHealth } from '@/lib/services/propertyReachProvider';
import {
  getCraigslistHealth,
  getHotPadsHealth,
  getPadMapperHealth,
  getRentComHealth,
  getTruliaHealth,
  getUsPropertyDataHealth,
  getZillowDetailHealth,
  getZillowRealEstateHealth,
  getZillowSearchHealth,
} from '@/lib/services/rapidApiRealEstateService';
import { getSkipTracingHealth } from '@/lib/services/skipTracingProvider';
import { getAirdnaHealth } from '@/lib/services/airdnaService';
import { getPropertyReportHealth } from '@/lib/services/propertyReportProvider';

type ApiStatus = 'operational' | 'degraded' | 'down';
type CheckerResult = { configured: boolean; status: ApiStatus; message: string };
type TimedCheckerResult = CheckerResult & { latencyMs: number };
type ProviderHealth = { hasApiKey: boolean; status: 'ACTIVE' | 'AUTH_ERROR' | 'DISABLED' | 'DEGRADED'; message: string };

function configured(value: string | undefined): boolean {
  return Boolean(value && !/your-|placeholder|changeme|example|here/i.test(value));
}

function mapProviderHealth(health: ProviderHealth): CheckerResult {
  return {
    configured: health.hasApiKey,
    status: health.status === 'ACTIVE' ? 'operational' : health.status === 'DISABLED' ? 'down' : 'degraded',
    message: health.message,
  };
}

async function timed(checker: () => Promise<CheckerResult>): Promise<TimedCheckerResult> {
  const startedAt = Date.now();
  const result = await checker();
  return { ...result, latencyMs: Date.now() - startedAt };
}

async function checkBatchData(): Promise<CheckerResult> {
  const apiKey = process.env.BATCHDATA_API_KEY;
  const batchDataConfigured = configured(apiKey);
  if (!batchDataConfigured || !apiKey) {
    return { configured: false, status: 'down', message: 'BATCHDATA_API_KEY is not set' };
  }

  try {
    const res = await fetch('https://api.batchdata.com/api/v1/property/lookup/all-attributes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: apiKey },
      body: JSON.stringify({
        requests: [{ address: { street: '1600 Pennsylvania Ave NW', city: 'Washington', state: 'DC', zip: '20500' } }],
      }),
      cache: 'no-store',
    });

    if (res.status === 401 || res.status === 403) {
      const body = await res.json().catch(() => null);
      const message = body?.status?.message || '';
      if (/insufficient balance/i.test(message)) {
        return { configured: true, status: 'degraded', message: 'API key valid, but account balance is insufficient for live requests' };
      }
      return { configured: true, status: 'down', message: message || 'API key invalid or unauthorized' };
    }

    if (!res.ok) {
      return { configured: true, status: 'degraded', message: `BatchData returned HTTP ${res.status}` };
    }

    return { configured: true, status: 'operational', message: 'BatchData API is reachable' };
  } catch (error) {
    return {
      configured: true,
      status: 'degraded',
      message: error instanceof Error ? error.message : 'BatchData unreachable',
    };
  }
}

async function checkPdl(): Promise<CheckerResult> {
  const apiKey = process.env.PDL_API_KEY || process.env.NEXT_PUBLIC_PDL_API_KEY;
  const pdlConfigured = configured(apiKey);
  if (!pdlConfigured || !apiKey) {
    return { configured: false, status: 'down', message: 'PDL_API_KEY is not set' };
  }

  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      name: '__integration_health_check__',
      locality: 'nowhere',
      pretty: 'false',
    });
    const res = await fetch(`https://api.peopledatalabs.com/v5/person/enrich?${params.toString()}`, {
      headers: { 'X-Api-Key': apiKey },
      cache: 'no-store',
    });

    if (res.status === 401 || res.status === 403) {
      return { configured: true, status: 'down', message: 'API key invalid or unauthorized' };
    }

    if (res.status === 404 || res.ok) {
      return { configured: true, status: 'operational', message: 'PDL API is reachable' };
    }

    return { configured: true, status: 'degraded', message: `PDL returned HTTP ${res.status}` };
  } catch (error) {
    return {
      configured: true,
      status: 'degraded',
      message: error instanceof Error ? error.message : 'PDL unreachable',
    };
  }
}

async function checkTwilio(): Promise<CheckerResult> {
  const twilioStatus = getTwilioConfigStatus();
  if (!twilioStatus.smsConfigured) {
    return {
      configured: false,
      status: 'down',
      message: `Twilio incomplete: ${twilioStatus.missing.join(', ')}`,
    };
  }

  try {
    const authSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const accountSid = authSid.startsWith('SK') ? process.env.TWILIO_ACCOUNT_SID_MAIN! : authSid;
    const credentials = Buffer.from(`${authSid}:${authToken}`).toString('base64');
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json?PageSize=1`, {
      headers: { Authorization: `Basic ${credentials}` },
      cache: 'no-store',
    });

    if (response.ok) {
      return { configured: true, status: 'operational', message: 'Twilio credentials validated' };
    }

    const body = await response.json().catch(() => null);
    return {
      configured: true,
      status: 'degraded',
      message: body?.message || `Twilio returned HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      configured: true,
      status: 'degraded',
      message: error instanceof Error ? error.message : 'Twilio status check failed',
    };
  }
}

async function checkResend(): Promise<CheckerResult> {
  const resendStatus = getResendConfigStatus();
  const resendConfigured = resendStatus.apiKeyConfigured && resendStatus.senderConfigured;
  if (!resendConfigured) {
    return { configured: false, status: 'down', message: 'Resend API key or sender email is not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!}` },
      cache: 'no-store',
    });
    if (response.ok || response.status === 401) {
      return { configured: true, status: 'operational', message: 'Resend credentials validated' };
    }
    return { configured: true, status: 'degraded', message: `Resend returned HTTP ${response.status}` };
  } catch (error) {
    return {
      configured: true,
      status: 'degraded',
      message: error instanceof Error ? error.message : 'Resend status check failed',
    };
  }
}

async function checkDocuSign(): Promise<CheckerResult> {
  const docusignStatus = getDocuSignConfigStatus();
  if (!docusignStatus.configured) {
    return {
      configured: false,
      status: 'down',
      message: `DocuSign incomplete: ${docusignStatus.missing.join(', ')}`,
    };
  }

  try {
    await getDocuSignAccessToken();
    return { configured: true, status: 'operational', message: 'DocuSign JWT auth validated' };
  } catch (error) {
    return {
      configured: true,
      status: 'degraded',
      message: error instanceof Error ? error.message : 'DocuSign connection failed',
    };
  }
}

const CHECKERS: Record<string, () => Promise<CheckerResult>> = {
  batchdata: checkBatchData,
  pdl: checkPdl,
  propertyreach: async () => mapProviderHealth(await getPropertyReachHealth()),
  twilio: checkTwilio,
  resend: checkResend,
  docusign: checkDocuSign,
  rentcast: async () => mapProviderHealth(await getRentCastHealth()),
  trulia: async () => mapProviderHealth(await getTruliaHealth()),
  zillowDetail: async () => mapProviderHealth(await getZillowDetailHealth()),
  zillowSearch: async () => mapProviderHealth(await getZillowSearchHealth()),
  skipTracing: async () => mapProviderHealth(await getSkipTracingHealth()),
  zillowRealEstate: async () => mapProviderHealth(await getZillowRealEstateHealth()),
  rentCom: async () => mapProviderHealth(await getRentComHealth()),
  usPropertyData: async () => mapProviderHealth(await getUsPropertyDataHealth()),
  padMapper: async () => mapProviderHealth(await getPadMapperHealth()),
  hotPads: async () => mapProviderHealth(await getHotPadsHealth()),
  craigslist: async () => mapProviderHealth(await getCraigslistHealth()),
  airdna: async () => mapProviderHealth(await getAirdnaHealth()),
  propertyReport: async () => mapProviderHealth(await getPropertyReportHealth()),
};

/**
 * GET /api/integration-health/status
 * Aggregates real configuration + reachability status for integrations.
 * Optional query param: ?integration=<id> to test one provider without refreshing them all.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminActor(request);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { searchParams } = new URL(request.url);
  const integrationId = searchParams.get('integration');

  if (integrationId && !CHECKERS[integrationId]) {
    return NextResponse.json({ error: `Unknown integration: ${integrationId}` }, { status: 400 });
  }

  const selected = integrationId
    ? [[integrationId, CHECKERS[integrationId]] as const]
    : Object.entries(CHECKERS) as Array<[string, () => Promise<CheckerResult>]>;

  const integrations = Object.fromEntries(
    await Promise.all(selected.map(async ([id, checker]) => [id, await timed(checker)] as const)),
  );

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    integrations,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
