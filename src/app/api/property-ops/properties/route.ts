import { NextRequest, NextResponse } from 'next/server';
import { adminContext, fail } from '@/lib/propertyOpsApi';
import { ensureManagedProperty, syncOnboardingSignals } from '@/lib/services/propertyOps';

// GET /api/property-ops/properties — every managed property with onboarding progress, upcoming turnovers and this month's revenue.
export async function GET(req: NextRequest) {
  const ctx = await adminContext(req);
  if ('error' in ctx) return ctx.error;
  const { db } = ctx;

  const { data: properties, error } = await db.from('managed_properties').select('*').order('created_at', { ascending: false });
  if (error) return fail(error.message, 500);
  const ids = (properties ?? []).map((p) => p.id);
  if (!ids.length) return NextResponse.json({ properties: [] });
  const leadIds = (properties ?? []).map((p) => p.lead_id);

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const [tasks, jobs, bookings] = await Promise.all([
    db.from('onboarding_tasks').select('property_id, status').in('property_id', ids),
    db.from('cleaning_jobs').select('property_id, scheduled_date, status, cleaner_id').in('property_id', ids).gte('scheduled_date', today).order('scheduled_date'),
    db.from('bookings').select('lead_id, gross_revenue, check_out, status').in('lead_id', leadIds).gte('check_out', monthStart),
  ]);

  const result = (properties ?? []).map((p) => {
    const t = (tasks.data ?? []).filter((x) => x.property_id === p.id);
    const j = (jobs.data ?? []).filter((x) => x.property_id === p.id);
    const b = (bookings.data ?? []).filter((x) => x.lead_id === p.lead_id && x.check_out <= today && x.status !== 'pending');
    return {
      ...p,
      onboarding: { done: t.filter((x) => x.status === 'done' || x.status === 'skipped').length, total: t.length },
      upcomingTurnovers: j.length,
      nextTurnover: j[0]?.scheduled_date ?? null,
      unassignedTurnovers: j.filter((x) => !x.cleaner_id && x.status === 'Scheduled').length,
      monthRevenue: Math.round(b.reduce((s, x) => s + Number(x.gross_revenue ?? 0), 0)),
    };
  });
  return NextResponse.json({ properties: result });
}

// POST /api/property-ops/properties { leadId } — add a lead to managed properties (also done automatically when its agreement is signed).
export async function POST(req: NextRequest) {
  const ctx = await adminContext(req);
  if ('error' in ctx) return ctx.error;
  const { leadId } = await req.json() as { leadId?: string };
  if (!leadId) return fail('leadId is required');
  try {
    const id = await ensureManagedProperty(ctx.db, leadId, { createdBy: ctx.actor.user.id });
    await syncOnboardingSignals(ctx.db, id);
    return NextResponse.json({ id });
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not add the property', 400);
  }
}
