import { NextRequest, NextResponse } from 'next/server';
import { adminContext, fail } from '@/lib/propertyOpsApi';
import { syncOnboardingSignals } from '@/lib/services/propertyOps';

type Ctx = { params: Promise<{ id: string }> };

// GET one property with its onboarding tasks, bookings, turnovers, expenses and statements.
export async function GET(req: NextRequest, { params }: Ctx) {
  const ctx = await adminContext(req);
  if ('error' in ctx) return ctx.error;
  const { id } = await params;
  const { db } = ctx;

  await syncOnboardingSignals(db, id);
  const { data: property } = await db.from('managed_properties').select('*').eq('id', id).maybeSingle();
  if (!property) return fail('Property not found', 404);

  const [tasks, bookings, jobs, expenses, statements] = await Promise.all([
    db.from('onboarding_tasks').select('*').eq('property_id', id).order('sort_order'),
    db.from('bookings').select('id, guest_name, check_in, check_out, nights, gross_revenue, platform, status').eq('lead_id', property.lead_id).order('check_in', { ascending: false }).limit(60),
    db.from('cleaning_jobs').select('id, scheduled_date, time_window, status, cleaning_type, cleaner_id, same_day, cost, issues').eq('property_id', id).order('scheduled_date', { ascending: false }).limit(40),
    db.from('property_expenses').select('*').eq('property_id', id).order('expense_date', { ascending: false }).limit(100),
    db.from('owner_statements').select('id, period_start, period_end, gross_revenue, management_fee, expenses_total, net_payout, status, sent_at, paid_at').eq('property_id', id).order('period_start', { ascending: false }),
  ]);
  return NextResponse.json({ property, tasks: tasks.data ?? [], bookings: bookings.data ?? [], turnovers: jobs.data ?? [], expenses: expenses.data ?? [], statements: statements.data ?? [] });
}

const EDITABLE = ['owner_name', 'owner_email', 'owner_phone', 'status', 'management_fee_percent', 'payout_schedule', 'listing_urls', 'notes'] as const;

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const ctx = await adminContext(req);
  if ('error' in ctx) return ctx.error;
  const { id } = await params;
  const body = await req.json() as Record<string, unknown>;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of EDITABLE) if (key in body) update[key] = body[key];

  if ('status' in update && !['onboarding', 'active', 'paused', 'offboarded'].includes(String(update.status))) return fail('Invalid status');
  if ('listing_urls' in update && !(Array.isArray(update.listing_urls) && update.listing_urls.every((u) => typeof u === 'string' && /^https?:\/\//.test(u)))) return fail('Listing links must be web addresses');
  if (update.status === 'active') update.activated_at = new Date().toISOString();

  const { error } = await ctx.db.from('managed_properties').update(update).eq('id', id);
  if (error) return fail(error.message, 500);
  await syncOnboardingSignals(ctx.db, id);
  return NextResponse.json({ success: true });
}
