import { NextRequest, NextResponse } from 'next/server';
import { getApiActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ensureFresh, healthReport, runAndRecord } from '@/lib/services/systemHealth';

export const maxDuration = 60;

// Public on purpose: it backs the /system-health status page. Without a leadership login it returns status, speed, uptime and
// incident timing only; the written explanations behind each check are included for admins.
const isAdmin = async (req: NextRequest) => { try { return (await getApiActor(req))?.isAdmin === true; } catch { return false; } };

/** GET /api/system/health  ->  service status, 30 and 90 day uptime, 90 day bars and incidents derived from the stored checks. */
export async function GET(req: NextRequest) {
  const db = getSupabaseAdmin(); const admin = await isAdmin(req);
  try {
    await ensureFresh(db);
    return NextResponse.json({ ...(await healthReport(db, { detail: admin })), viewer: { admin } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('system health failed', e);
    return NextResponse.json({ error: 'Status could not be loaded.' }, { status: 500 });
  }
}

/** POST /api/system/health  (admin only)  ->  runs every check now, records it and returns the new report. */
export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: 'Leadership accounts only.' }, { status: 403 });
  const db = getSupabaseAdmin();
  try {
    await runAndRecord(db);
    return NextResponse.json({ ...(await healthReport(db, { detail: true })), viewer: { admin: true } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('system health run failed', e);
    return NextResponse.json({ error: 'The checks could not be run.' }, { status: 500 });
  }
}
