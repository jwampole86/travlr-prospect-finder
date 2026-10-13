import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { allowRequest, clientIp } from '@/lib/publicRateLimit';
import { confirmSubscriber } from '@/lib/services/futureStr';

const page = (title: string, msg: string, status = 200) => new NextResponse(
  `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:Georgia,serif;max-width:480px;margin:72px auto;padding:0 20px;color:#1a2230;line-height:1.6;"><p style="font:700 13px Arial,sans-serif;letter-spacing:1px;color:#1f7ae0;">VAYO AI</p><h1 style="font-size:24px;color:#12263f;">${title}</h1><p>${msg}</p></body></html>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });

/** GET /api/future-str/confirm?s=<id>&t=<signature>: the confirm link in the sign-up confirmation email. */
export async function GET(req: NextRequest) {
  if (!allowRequest(`future-str-confirm:${clientIp(req.headers)}`, 20, 10 * 60_000)) return page('Please try again later', 'Too many requests.', 429);
  const r = await confirmSubscriber(getSupabaseAdmin(), req.nextUrl.searchParams.get('s') ?? '', req.nextUrl.searchParams.get('t') ?? '');
  if (r === null) return page('This link is not valid', 'It may have been copied incorrectly. You can sign up again from the original page.', 400);
  return r ? page('You are confirmed', 'Thank you. We will send occasional updates about the future of vacation rental operations, and you can unsubscribe at any time.') : page('We could not find that sign-up', 'It may have been removed.', 404);
}
