import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { allowRequest, clientIp } from '@/lib/publicRateLimit';
import { unsubscribeSubscriber } from '@/lib/services/futureStr';

const page = (title: string, msg: string, status = 200) => new NextResponse(
  `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:Georgia,serif;max-width:480px;margin:72px auto;padding:0 20px;color:#1a2230;line-height:1.6;"><p style="font:700 13px Arial,sans-serif;letter-spacing:1px;color:#1f7ae0;">VAYO AI</p><h1 style="font-size:24px;color:#12263f;">${title}</h1><p>${msg}</p></body></html>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });

async function run(req: NextRequest) {
  if (!allowRequest(`future-str-unsub:${clientIp(req.headers)}`, 20, 10 * 60_000)) return false;
  return unsubscribeSubscriber(getSupabaseAdmin(), req.nextUrl.searchParams.get('s') ?? '', req.nextUrl.searchParams.get('t') ?? '');
}

/** GET /api/future-str/unsubscribe?s=<id>&t=<signature>: the unsubscribe link in every email. Always works. */
export async function GET(req: NextRequest) {
  const r = await run(req);
  if (r === null) return page('This link is not valid', 'It may have been copied incorrectly. Reply to the email and we will remove you right away.', 400);
  if (r === false) return page('Please try again later', 'Too many requests.', 429);
  return page('You are unsubscribed', 'We will not email you again. Thank you for taking part.');
}

/** POST: the one-click unsubscribe that mail apps send for the List-Unsubscribe header. */
export async function POST(req: NextRequest) {
  const r = await run(req);
  return r === true ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Invalid link' }, { status: r === false ? 429 : 400 });
}
