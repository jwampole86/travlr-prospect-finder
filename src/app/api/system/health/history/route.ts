import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { SERVICES, serviceHistory } from '@/lib/services/systemHealth';

/** GET /api/system/health/history?service=database&hours=24  ->  response time and status of each stored check (public, like the page). */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams; const service = q.get('service') ?? '';
  if (!SERVICES.some(s => s.id === service)) return NextResponse.json({ error: 'Unknown service.' }, { status: 400 });
  const hours = [6, 24, 72, 168].includes(Number(q.get('hours'))) ? Number(q.get('hours')) : 24;
  try { return NextResponse.json({ service, hours, points: await serviceHistory(getSupabaseAdmin(), service, hours) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ error: 'History could not be loaded.' }, { status: 500 }); }
}
