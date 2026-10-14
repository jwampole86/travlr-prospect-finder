import { NextRequest, NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { SERVICES, serviceHistory } from '@/lib/services/systemHealth';

/** GET /api/system/health/history?service=database&hours=24 or &date=2026-10-13  ->  stored checks (public; written reasons for admins only). */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams; const service = q.get('service') ?? '';
  if (!SERVICES.some(s => s.id === service)) return NextResponse.json({ error: 'Unknown service.' }, { status: 400 });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q.get('date') ?? '') ? q.get('date') : null;
  const hours = [6, 24, 72, 168].includes(Number(q.get('hours'))) ? Number(q.get('hours')) : 24;
  const admin = await getApiActor(req).then(a => a?.isAdmin === true).catch(() => false);
  try { return NextResponse.json({ service, hours, date, points: await serviceHistory(getSupabaseAdmin(), service, hours, { detail: admin, date }) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'History could not be loaded.' }, { status: 500 }); }
}
