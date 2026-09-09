import { NextRequest, NextResponse } from 'next/server';
import { getEmbeddedSigningUrl, type SignerInfo } from '@/lib/services/docusignService';

// POST /api/docusign/signing-url
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      envelopeId: string;
      signer: SignerInfo;
      returnUrl?: string;
    };

    const { envelopeId, signer, returnUrl } = body;

    if (!envelopeId || !signer) {
      return NextResponse.json({ error: 'envelopeId and signer are required' }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://travlrpro3047.builtwithrocket.new';
    const callbackUrl = returnUrl ?? `${baseUrl}/homeowner/documents?signing=complete`;

    const { url } = await getEmbeddedSigningUrl(envelopeId, signer, callbackUrl);

    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[signing-url] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
