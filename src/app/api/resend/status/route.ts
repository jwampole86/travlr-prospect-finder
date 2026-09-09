import { NextResponse } from 'next/server';
import { getResendConfigStatus, getResendFrom } from '@/lib/email/resend';

export async function GET() {
  const status = getResendConfigStatus();

  if (!status.apiKeyConfigured || !status.senderConfigured) {
    return NextResponse.json({
      ok: false,
      configured: false,
      apiKeyConfigured: status.apiKeyConfigured,
      senderConfigured: status.senderConfigured,
      senderDomain: status.senderDomain,
      missing: [
        ...(!status.apiKeyConfigured ? ['RESEND_API_KEY'] : []),
        ...(!status.senderConfigured ? ['RESEND_FROM_EMAIL'] : []),
      ],
    }, { status: 503 });
  }

  try {
    const response = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      cache: 'no-store',
    });
    const body = await response.json().catch(() => null);
    const isSendOnlyRestrictedKey = response.status === 401 && /restricted to only send emails/i.test(body?.message || body?.error || '');

    return NextResponse.json({
      ok: response.ok || isSendOnlyRestrictedKey,
      configured: true,
      sender: getResendFrom(),
      senderDomain: status.senderDomain,
      providerReachable: response.ok || isSendOnlyRestrictedKey,
      providerStatus: response.status,
      mode: isSendOnlyRestrictedKey ? 'send_only_key' : 'full_api_key',
      domains: Array.isArray(body?.data)
        ? body.data.map((domain: { name?: string; status?: string }) => ({ name: domain.name, status: domain.status }))
        : [],
      error: response.ok || isSendOnlyRestrictedKey ? null : body?.message || body?.error || 'Resend domain check failed',
      note: isSendOnlyRestrictedKey ? 'API key is send-only; domain listing is unavailable but email sending can still work.' : null,
    }, { status: response.ok || isSendOnlyRestrictedKey ? 200 : 502 });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      configured: true,
      sender: getResendFrom(),
      senderDomain: status.senderDomain,
      providerReachable: false,
      error: err instanceof Error ? err.message : 'Resend status check failed',
    }, { status: 502 });
  }
}
