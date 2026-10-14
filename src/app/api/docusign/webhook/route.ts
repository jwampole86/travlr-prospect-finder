import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { docusignWebhookToken } from '@/lib/services/docusignService';
import { syncEnvelope } from '@/lib/services/signingSync';

/**
 * DocuSign envelope events. Each envelope is created with this URL and a shared token, so no Connect setup is
 * needed; an account-level Connect configuration is also accepted when DOCUSIGN_CONNECT_HMAC_KEY is set and
 * DocuSign signs the body. Either way the event is only a nudge: the real status is fetched from DocuSign.
 */
const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function authorized(req: NextRequest, rawBody: string): boolean {
  const expected = docusignWebhookToken();
  const token = new URL(req.url).searchParams.get('t');
  if (expected && token && safeEqual(token, expected)) return true;

  const key = process.env.DOCUSIGN_CONNECT_HMAC_KEY;
  if (!key) return false;
  const digest = createHmac('sha256', key).update(rawBody).digest('base64');
  return [1, 2, 3, 4, 5].some((n) => {
    const header = req.headers.get(`x-docusign-signature-${n}`);
    return Boolean(header) && safeEqual(header as string, digest);
  });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!authorized(req, raw)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { data?: { envelopeId?: string }; envelopeId?: string };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const envelopeId = body.data?.envelopeId ?? body.envelopeId;
  if (!envelopeId) return NextResponse.json({ received: true });

  try {
    const result = await syncEnvelope(envelopeId);
    return NextResponse.json({ received: true, ...result });
  } catch (err) {
    console.error('[docusign-webhook]', err instanceof Error ? err.message : err);
    // A non-2xx makes DocuSign retry; syncing is idempotent so retries are safe.
    return NextResponse.json({ error: 'Could not process the event' }, { status: 500 });
  }
}
