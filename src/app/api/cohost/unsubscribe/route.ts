import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { allowRequest, clientIp } from '@/lib/publicRateLimit';
import { optOutOwner, verifyUnsubscribe } from '@/lib/services/cohostEmail';

const page = (title: string, msg: string, status = 200) => new NextResponse(
  `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:Georgia,serif;max-width:480px;margin:15vh auto;padding:0 24px;color:#1a1a1a;line-height:1.6"><h1 style="font-size:20px">${title}</h1><p>${msg}</p></body></html>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });

async function unsubscribe(req: NextRequest) {
  const m = req.nextUrl.searchParams.get('m') ?? ''; const t = req.nextUrl.searchParams.get('t') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(m) || !verifyUnsubscribe(m, t)) return null;
  if (!allowRequest(`cohost-unsub:${clientIp(req.headers)}`, 20, 10 * 60_000)) return false;
  const db = getSupabaseAdmin();
  const { data } = await db.from('cohost_email_messages').select('property_id').eq('id', m).maybeSingle();
  if (!data) return null;
  await optOutOwner(db, data.property_id, 'unsubscribed from a co-host email');
  return true;
}

/** GET /api/cohost/unsubscribe?m=<message id>&t=<signature>  (public). The unsubscribe link in every co-host email. */
export async function GET(req: NextRequest) {
  const r = await unsubscribe(req);
  if (r === null) return page('This link is not valid', 'It may have been copied incorrectly. Reply to the email and we will remove you right away.', 400);
  if (r === false) return page('Please try again later', 'Too many requests.', 429);
  return page('You are unsubscribed', 'We will not contact you again. Sorry for the interruption.');
}

/** POST: the one-click unsubscribe that mail apps send for the List-Unsubscribe header. */
export async function POST(req: NextRequest) {
  const r = await unsubscribe(req);
  return r === true ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Invalid link' }, { status: r === false ? 429 : 400 });
}
