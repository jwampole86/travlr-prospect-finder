import { NextRequest, NextResponse } from 'next/server';
import { adminContext, fail, isDate } from '@/lib/propertyOpsApi';

const CATEGORIES = ['Cleaning', 'Supplies', 'Repairs and maintenance', 'Utilities', 'Permits and licenses', 'Inspection', 'Other'];

export async function POST(req: NextRequest) {
  const ctx = await adminContext(req);
  if ('error' in ctx) return ctx.error;
  const b = await req.json() as { propertyId?: string; date?: string; category?: string; description?: string; amount?: number; cleaningJobId?: string };
  const amount = Number(b.amount);
  if (!b.propertyId || !isDate(b.date) || !CATEGORIES.includes(b.category ?? '') || !(amount >= 0) || !Number.isFinite(amount)) return fail('propertyId, date, category and a valid amount are required');
  const { data, error } = await ctx.db.from('property_expenses').insert({ property_id: b.propertyId, expense_date: b.date, category: b.category, description: b.description?.trim() || null, amount, cleaning_job_id: b.cleaningJobId ?? null, created_by: ctx.actor.user.id }).select('id').single();
  if (error) return fail(error.message, 500);
  return NextResponse.json({ id: data.id });
}

export async function DELETE(req: NextRequest) {
  const ctx = await adminContext(req);
  if ('error' in ctx) return ctx.error;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail('id is required');
  const { error } = await ctx.db.from('property_expenses').delete().eq('id', id);
  return error ? fail(error.message, 500) : NextResponse.json({ success: true });
}
