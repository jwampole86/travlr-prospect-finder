import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * GET /e/[code]
 * Short link used in outreach texts. Redirects to the lead's estimate page and records the first click.
 * Only links we created for our own estimate page are followed.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const base = (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, '');
  const fallback = NextResponse.redirect(`${base}/estimate`, 302);

  if (!/^[a-z0-9]{4,16}$/i.test(code)) return fallback;
  try {
    const db = getSupabaseAdmin();
    const { data } = await db.from('link_clicks').select('original_url, clicked_at').eq('token', code).eq('sequence_name', 'estimate_outreach').maybeSingle();
    if (!data?.original_url) return fallback;

    const target = new URL(data.original_url);
    if (target.origin !== new URL(base).origin || target.pathname !== '/estimate') return fallback;

    if (!data.clicked_at) await db.from('link_clicks').update({ clicked_at: new Date().toISOString() }).eq('token', code);
    const res = NextResponse.redirect(target.toString(), 302);
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch {
    return fallback;
  }
}
