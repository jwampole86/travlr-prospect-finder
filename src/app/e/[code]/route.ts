import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { classifyClick, geoFromHeaders } from '@/lib/clickClassifier';

/**
 * GET /e/[code]
 * Short link used in outreach texts. Redirects to the lead's estimate page and records every hit.
 * Link-preview and security scanners are logged but flagged as bots, and only a real visitor sets the lead's first-click time.
 * Only links we created for our own estimate page are followed.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const base = (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, '');
  const fallback = NextResponse.redirect(`${base}/estimate`, 302);

  if (!/^[a-z0-9]{4,16}$/i.test(code)) return fallback;
  try {
    const db = getSupabaseAdmin();
    const { data } = await db.from('link_clicks').select('lead_id, original_url, clicked_at').eq('token', code).eq('sequence_name', 'estimate_outreach').maybeSingle();
    if (!data?.original_url) return fallback;

    const target = new URL(data.original_url);
    if (target.origin !== new URL(base).origin || target.pathname !== '/estimate') return fallback;

    const ua = req.headers.get('user-agent');
    const info = classifyClick(ua, req.headers);
    const geo = geoFromHeaders(req.headers);
    // Logging must never delay or break the redirect.
    await Promise.allSettled([
      db.from('sms_link_events').insert({
        code, lead_id: data.lead_id, is_bot: info.isBot, bot_reason: info.botReason, device: info.device, os: info.os, browser: info.browser,
        user_agent: ua?.slice(0, 300) ?? null, country: geo.country, region: geo.region, city: geo.city, referrer: req.headers.get('referer')?.slice(0, 300) ?? null,
      }),
      !data.clicked_at && !info.isBot ? db.from('link_clicks').update({ clicked_at: new Date().toISOString(), user_agent: ua?.slice(0, 300) ?? null }).eq('token', code) : Promise.resolve(),
    ]);

    // The code travels with the visitor so the estimate page can report what they do, without any personal data in the link.
    target.searchParams.set('c', code);
    const res = NextResponse.redirect(target.toString(), 302);
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch {
    return fallback;
  }
}
