import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

// A cleaner opens a private link (a 32-character token) for one job. No account is needed; the token is the credential.
const OPEN = ['Scheduled', 'In Progress', 'Needs Redo'];
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const COLUMNS = 'id, property_id, cleaning_type, scheduled_date, time_window, special_instructions, status, same_day, checklist, issues, cleaner_notes, checked_in_at, checked_out_at, before_photos, after_photos';

async function loadJob(token: string | null) {
  if (!token || !/^[a-f0-9]{32}$/.test(token)) return null;
  const db = getSupabaseAdmin();
  const { data: job } = await db.from('cleaning_jobs').select(COLUMNS).eq('access_token', token).maybeSingle();
  return job ? { db, job } : null;
}

export async function GET(req: NextRequest) {
  const found = await loadJob(new URL(req.url).searchParams.get('token'));
  if (!found) return fail('This job link is not valid.', 404);
  const { db, job } = found;
  const { data: property } = job.property_id ? await db.from('managed_properties').select('address, city, state').eq('id', job.property_id).maybeSingle() : { data: null };

  const sign = async (paths: string[]) => paths.length ? ((await db.storage.from('cleaning-photos').createSignedUrls(paths, 3600)).data ?? []).map((s) => s.signedUrl) : [];
  const { before_photos, after_photos, ...rest } = job;
  return NextResponse.json({
    job: { ...rest, beforePhotos: await sign(before_photos ?? []), afterPhotos: await sign(after_photos ?? []), editable: OPEN.includes(job.status) },
    property,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { token?: string; action?: string; items?: Array<{ label: string; done: boolean }>; notes?: string; issues?: string };
  const found = await loadJob(body.token ?? null);
  if (!found) return fail('This job link is not valid.', 404);
  const { db, job } = found;
  if (!OPEN.includes(job.status)) return fail('This job is already finished.', 409);
  const now = new Date().toISOString();

  switch (body.action) {
    case 'check_in':
      await db.from('cleaning_jobs').update({ status: 'In Progress', checked_in_at: now, checked_out_at: null, updated_at: now }).eq('id', job.id);
      return NextResponse.json({ success: true });
    case 'checklist': {
      const current = (job.checklist ?? []) as Array<{ label: string; done: boolean }>;
      if (!Array.isArray(body.items) || body.items.length !== current.length) return fail('Invalid checklist');
      const next = current.map((c, i) => ({ label: c.label, done: Boolean(body.items![i].done) }));
      await db.from('cleaning_jobs').update({ checklist: next, updated_at: now }).eq('id', job.id);
      return NextResponse.json({ success: true });
    }
    case 'note':
      await db.from('cleaning_jobs').update({ cleaner_notes: String(body.notes ?? '').slice(0, 2000), issues: String(body.issues ?? '').slice(0, 2000), updated_at: now }).eq('id', job.id);
      return NextResponse.json({ success: true });
    case 'check_out': {
      if (!job.checked_in_at || job.status !== 'In Progress') return fail('Check in before checking out.', 409);
      if (((job.checklist ?? []) as Array<{ done: boolean }>).some((c) => !c.done)) return fail('Finish the checklist first.', 409);
      if (!(job.after_photos ?? []).length) return fail('Add at least one after photo first.', 409);
      await db.from('cleaning_jobs').update({ status: 'Completed', checked_out_at: now, updated_at: now }).eq('id', job.id);
      return NextResponse.json({ success: true });
    }
    default:
      return fail('Unknown action');
  }
}
