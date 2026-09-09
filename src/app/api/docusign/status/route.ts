import { NextResponse } from 'next/server';
import { getDocuSignConfigStatus, getDocuSignAccessToken } from '@/lib/services/docusignService';

export async function GET() {
  const config = getDocuSignConfigStatus();

  if (!config.configured) {
    return NextResponse.json({
      ok: false,
      configured: false,
      missing: config.missing,
      basePath: config.basePath,
      oauthBase: config.oauthBase,
    }, { status: 503 });
  }

  try {
    await getDocuSignAccessToken();
    return NextResponse.json({
      ok: true,
      configured: true,
      basePath: config.basePath,
      oauthBase: config.oauthBase,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      configured: true,
      error: err instanceof Error ? err.message : 'DocuSign connection failed',
      basePath: config.basePath,
      oauthBase: config.oauthBase,
    }, { status: 502 });
  }
}
