import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getDocuSignConfigStatus, getDocuSignAccessToken, docusignWebhookUrl } from '@/lib/services/docusignService';

// GET /api/docusign/status — admins only: is DocuSign connected, and what still needs attention.
export async function GET(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const config = getDocuSignConfigStatus();
  const webhookReachable = Boolean(docusignWebhookUrl());
  if (!config.configured) return NextResponse.json({ ok: false, ...config, webhookReachable }, { status: 503 });

  try {
    await getDocuSignAccessToken();
    return NextResponse.json({ ok: true, ...getDocuSignConfigStatus(), webhookReachable });
  } catch (err) {
    return NextResponse.json({ ok: false, ...config, webhookReachable, error: err instanceof Error ? err.message : 'DocuSign connection failed' }, { status: 502 });
  }
}
