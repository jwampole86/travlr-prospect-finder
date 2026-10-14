import { NextRequest, NextResponse } from 'next/server';
import { adminContext, fail, isDate } from '@/lib/propertyOpsApi';
import { DEFAULT_CHECKLIST, generateTurnovers } from '@/lib/services/propertyOps';

const STATUSES = ['Scheduled', 'In Progress', 'Completed', 'Verified', 'Needs Redo'];
const TYPES = ['Turnover', 'Deep Clean', 'Mid-stay', 'Custom'];

// GET ?from=&to=&status=  — jobs with property, cleaner and (signed) photo links.
export async function GET(req: NextRequest) {
  const ctx = await adminContext(req);
  if ('error' in ctx) return ctx.error;
  const { db } = ctx;
  const sp = new URL(req.url).searchParams;
  const from = isDate(sp.get('from')) ? sp.get('from')! : new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const to = isDate(sp.get('to')) ? sp.get('to')! : new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  let q = db.from('cleaning_jobs').select('id, lead_id, property_id, booking_id, cleaner_id, cleaning_type, scheduled_date, time_window, special_instructions, status, same_day, checklist, issues, cost, cleaner_notes, checked_in_at, checked_out_at, before_photos, after_photos, verified_at, link_sent_at, access_token').gte('scheduled_date', from).lte('scheduled_date', to).order('scheduled_date').order('time_window');
  if (sp.get('status')) q = q.eq('status', sp.get('status')!);
  const { data: jobs, error } = await q;
  if (error) return fail(error.message, 500);

  const propertyIds = [...new Set((jobs ?? []).map((j) => j.property_id).filter(Boolean))];
  const [{ data: props }, { data: cleaners }] = await Promise.all([
    propertyIds.length ? db.from('managed_properties').select('id, address, city, state').in('id', propertyIds) : Promise.resolve({ data: [] as Array<{ id: string; address: string; city: string | null; state: string | null }> }),
    db.from('cleaners').select('id, full_name, email, phone, status, rate_per_turnover').order('full_name'),
  ]);
  const byProp = new Map((props ?? []).map((p) => [p.id, p]));

  const result = await Promise.all((jobs ?? []).map(async ({ access_token, before_photos, after_photos, ...j }) => {
    const paths = [...(before_photos ?? []), ...(after_photos ?? [])] as string[];
    const signed = paths.length ? (await db.storage.from('cleaning-photos').createSignedUrls(paths, 3600)).data ?? [] : [];
    const url = (p: string) => signed.find((s) => s.path === p)?.signedUrl ?? null;
    return { ...j, property: byProp.get(j.property_id ?? '') ?? null, beforePhotos: (before_photos ?? []).map(url).filter(Boolean), afterPhotos: (after_photos ?? []).map(url).filter(Boolean), linkToken: access_token };
  }));
  return NextResponse.json({ jobs: result, cleaners: cleaners ?? [] });
}

// POST { action: 'generate', propertyId? } plans turnovers after every upcoming checkout.
// POST { action: 'create', propertyId, date, type?, timeWindow?, instructions? } adds one job by hand.
export async function POST(req: NextRequest) {
  const ctx = await adminContext(req);
  if ('error' in ctx) return ctx.error;
  const b = await req.json() as { action?: string; propertyId?: string; date?: string; type?: string; timeWindow?: string; instructions?: string };
  if (b.action === 'generate') return NextResponse.json(await generateTurnovers(ctx.db, { propertyId: b.propertyId }));

  if (b.action === 'create') {
    if (!b.propertyId || !isDate(b.date) || (b.type && !TYPES.includes(b.type))) return fail('propertyId, a date and a valid type are required');
    const { data: property } = await ctx.db.from('managed_properties').select('lead_id').eq('id', b.propertyId).maybeSingle();
    if (!property) return fail('Property not found', 404);
    const { data, error } = await ctx.db.from('cleaning_jobs').insert({
      lead_id: property.lead_id, property_id: b.propertyId, cleaning_type: b.type ?? 'Deep Clean', scheduled_date: b.date, time_window: b.timeWindow || '10:00 AM – 2:00 PM',
      special_instructions: b.instructions?.trim() || null, status: 'Scheduled', scheduled_by: ctx.actor.user.id, checklist: DEFAULT_CHECKLIST.map((label) => ({ label, done: false })),
    }).select('id').single();
    return error ? fail(error.message, 500) : NextResponse.json({ id: data.id });
  }
  return fail('Unknown action');
}

// PATCH { id, cleanerId?, status?, date?, timeWindow?, instructions?, cost?, issues? } — assign, reschedule, verify or send back for a redo.
export async function PATCH(req: NextRequest) {
  const ctx = await adminContext(req);
  if ('error' in ctx) return ctx.error;
  const b = await req.json() as { id?: string; cleanerId?: string | null; status?: string; date?: string; timeWindow?: string; instructions?: string; cost?: number | null; issues?: string };
  if (!b.id) return fail('id is required');

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('cleanerId' in b) update.cleaner_id = b.cleanerId || null;
  if (b.status) {
    if (!STATUSES.includes(b.status)) return fail('Invalid status');
    update.status = b.status;
    if (b.status === 'Verified') { update.verified_by = ctx.actor.user.id; update.verified_at = new Date().toISOString(); }
  }
  if (b.date) { if (!isDate(b.date)) return fail('Invalid date'); update.scheduled_date = b.date; }
  if (b.timeWindow !== undefined) update.time_window = b.timeWindow;
  if (b.instructions !== undefined) update.special_instructions = b.instructions;
  if (b.issues !== undefined) update.issues = b.issues;
  if ('cost' in b) { if (b.cost !== null && !(Number(b.cost) >= 0)) return fail('Invalid cost'); update.cost = b.cost; }

  const { data: job, error } = await ctx.db.from('cleaning_jobs').update(update).eq('id', b.id).select('id, property_id, scheduled_date, cost, status').single();
  if (error) return fail(error.message, 500);

  // A verified, priced clean is billed to the owner as an expense once.
  if (job.status === 'Verified' && job.property_id && Number(job.cost) > 0) {
    const { data: exists } = await ctx.db.from('property_expenses').select('id').eq('cleaning_job_id', job.id).maybeSingle();
    if (!exists) await ctx.db.from('property_expenses').insert({ property_id: job.property_id, expense_date: job.scheduled_date, category: 'Cleaning', description: 'Turnover clean', amount: job.cost, cleaning_job_id: job.id, created_by: ctx.actor.user.id });
  }
  return NextResponse.json({ success: true });
}
