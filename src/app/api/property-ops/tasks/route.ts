import { NextRequest, NextResponse } from 'next/server';
import { adminContext, fail, isDate } from '@/lib/propertyOpsApi';
import { recomputeStatus } from '@/lib/services/propertyOps';

// PATCH { id, status?, notes?, dueDate? } — update one onboarding task.
export async function PATCH(req: NextRequest) {
  const ctx = await adminContext(req);
  if ('error' in ctx) return ctx.error;
  const { id, status, notes, dueDate } = await req.json() as { id?: string; status?: string; notes?: string; dueDate?: string | null };
  if (!id) return fail('id is required');

  const update: Record<string, unknown> = {};
  if (status !== undefined) {
    if (!['todo', 'done', 'blocked', 'skipped'].includes(status)) return fail('Invalid status');
    update.status = status;
    update.completed_at = status === 'done' ? new Date().toISOString() : null;
    update.completed_by = status === 'done' ? ctx.actor.user.id : null;
  }
  if (notes !== undefined) update.notes = notes;
  if (dueDate !== undefined) { if (dueDate !== null && !isDate(dueDate)) return fail('Invalid due date'); update.due_date = dueDate; }

  const { data, error } = await ctx.db.from('onboarding_tasks').update(update).eq('id', id).select('property_id').single();
  if (error) return fail(error.message, 500);
  await recomputeStatus(ctx.db, data.property_id);
  return NextResponse.json({ success: true });
}
