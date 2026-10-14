import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

// POST multipart: token, kind (before|after), file — adds one photo to the job.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const token = String(form.get('token') ?? '');
  const kind = form.get('kind') === 'before' ? 'before' : 'after';
  const file = form.get('file') as Blob | string | null;
  if (!/^[a-f0-9]{32}$/.test(token) || typeof file !== 'object' || file === null) return NextResponse.json({ error: 'A valid link and photo are required' }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'Photos must be JPG, PNG, WebP or HEIC' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That photo is over 8 MB' }, { status: 413 });

  const db = getSupabaseAdmin();
  const { data: job } = await db.from('cleaning_jobs').select('id, status, before_photos, after_photos').eq('access_token', token).maybeSingle();
  if (!job) return NextResponse.json({ error: 'This job link is not valid.' }, { status: 404 });
  if (!['Scheduled', 'In Progress', 'Needs Redo'].includes(job.status)) return NextResponse.json({ error: 'This job is already finished.' }, { status: 409 });

  const column = kind === 'before' ? 'before_photos' : 'after_photos';
  const existing = ((job as Record<string, unknown>)[column] ?? []) as string[];
  if (existing.length >= 12) return NextResponse.json({ error: 'Up to 12 photos per section' }, { status: 409 });

  const path = `${job.id}/${randomUUID()}.${ext}`;
  const { error } = await db.storage.from('cleaning-photos').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
  if (error) return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  await db.from('cleaning_jobs').update({ [column]: [...existing, path], updated_at: new Date().toISOString() }).eq('id', job.id);
  return NextResponse.json({ success: true });
}
