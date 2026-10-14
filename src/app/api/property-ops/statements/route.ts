import { NextRequest, NextResponse } from 'next/server';
import { adminContext, fail, isDate } from '@/lib/propertyOpsApi';
import { computeStatement } from '@/lib/services/propertyOps';
import { getResendClient, getResendFrom } from '@/lib/email/resend';
import { BRAND } from '@/config/brand';

const usd = (n: number) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function GET(req: NextRequest) {
  const ctx = await adminContext(req);
  if ('error' in ctx) return ctx.error;
  const propertyId = new URL(req.url).searchParams.get('propertyId');
  let q = ctx.db.from('owner_statements').select('id, property_id, period_start, period_end, gross_revenue, management_fee, expenses_total, net_payout, fee_percent, status, sent_at, paid_at').order('period_start', { ascending: false }).limit(200);
  if (propertyId) q = q.eq('property_id', propertyId);
  const { data, error } = await q;
  if (error) return fail(error.message, 500);
  const ids = [...new Set((data ?? []).map((s) => s.property_id))];
  const { data: props } = ids.length ? await ctx.db.from('managed_properties').select('id, address, city, state, owner_name, owner_email').in('id', ids) : { data: [] };
  const byId = new Map((props ?? []).map((p) => [p.id, p]));
  return NextResponse.json({ statements: (data ?? []).map((s) => ({ ...s, property: byId.get(s.property_id) ?? null })) });
}

// POST { propertyId, start, end } builds (or rebuilds a draft) statement for the period.
export async function POST(req: NextRequest) {
  const ctx = await adminContext(req);
  if ('error' in ctx) return ctx.error;
  const { propertyId, start, end } = await req.json() as { propertyId?: string; start?: string; end?: string };
  if (!propertyId || !isDate(start) || !isDate(end) || start > end) return fail('propertyId and a valid period are required');

  const { data: existing } = await ctx.db.from('owner_statements').select('id, status').eq('property_id', propertyId).eq('period_start', start).eq('period_end', end).maybeSingle();
  if (existing && existing.status !== 'draft') return fail(`A ${existing.status} statement already exists for this period`, 409);

  const t = await computeStatement(ctx.db, propertyId, start, end);
  const row = { property_id: propertyId, period_start: start, period_end: end, gross_revenue: t.gross, management_fee: t.fee, expenses_total: t.expenses, net_payout: t.net, fee_percent: t.feePercent, line_items: { bookings: t.bookings, expenses: t.expenseLines }, created_by: ctx.actor.user.id };
  const { data, error } = await ctx.db.from('owner_statements').upsert(row, { onConflict: 'property_id,period_start,period_end' }).select('id').single();
  return error ? fail(error.message, 500) : NextResponse.json({ id: data.id, ...t });
}

// PATCH { id, action: 'send' | 'paid' } — send the statement to the owner, then mark it paid.
export async function PATCH(req: NextRequest) {
  const ctx = await adminContext(req);
  if ('error' in ctx) return ctx.error;
  const { id, action } = await req.json() as { id?: string; action?: string };
  if (!id || !['send', 'paid'].includes(action ?? '')) return fail('id and a valid action are required');
  const { db } = ctx;

  const { data: st } = await db.from('owner_statements').select('*').eq('id', id).maybeSingle();
  if (!st) return fail('Statement not found', 404);
  const { data: property } = await db.from('managed_properties').select('id, lead_id, address, owner_name, owner_email').eq('id', st.property_id).single();
  if (!property) return fail('Property not found', 404);

  const now = new Date().toISOString();
  const viewUrl = `/api/owner-statements/${id}/view`;
  const { data: owner } = await db.from('property_homeowners').select('homeowner_user_id').eq('lead_id', property.lead_id).limit(1).maybeSingle();

  if (action === 'send') {
    if (st.status !== 'draft') return fail('Only a draft statement can be sent', 409);
    let payoutId: string | null = null;
    if (owner?.homeowner_user_id) {
      const { data: payout } = await db.from('payouts').insert({ homeowner_user_id: owner.homeowner_user_id, lead_id: property.lead_id, gross_amount: st.gross_revenue, net_amount: st.net_payout, management_fee: st.management_fee, period_start: st.period_start, period_end: st.period_end, status: 'pending', statement_url: viewUrl }).select('id').single();
      payoutId = payout?.id ?? null;
    }
    let emailed = false;
    if (property.owner_email) {
      const { error } = await getResendClient().emails.send({
        from: getResendFrom(), to: [property.owner_email], subject: `Your owner statement: ${property.address}, ${st.period_start} to ${st.period_end}`,
        html: `<div style="font-family:sans-serif;max-width:560px"><p>Hi ${property.owner_name ?? 'there'},</p><p>Your statement for <strong>${property.address}</strong> (${st.period_start} to ${st.period_end}) is ready.</p><table style="border-collapse:collapse"><tr><td style="padding:4px 16px 4px 0">Gross booking revenue</td><td><strong>${usd(st.gross_revenue)}</strong></td></tr><tr><td style="padding:4px 16px 4px 0">Management fee (${st.fee_percent ?? 0}%)</td><td>-${usd(st.management_fee)}</td></tr><tr><td style="padding:4px 16px 4px 0">Expenses</td><td>-${usd(st.expenses_total)}</td></tr><tr><td style="padding:4px 16px 4px 0"><strong>Net to you</strong></td><td><strong>${usd(st.net_payout)}</strong></td></tr></table><p>Sign in to your owner portal to see every booking and expense line: <a href="${(process.env.NEXT_PUBLIC_SITE_URL || BRAND.appUrl).replace(/\/$/, '')}/homeowner/revenue">View statement</a></p></div>`,
      });
      emailed = !error;
    }
    await db.from('owner_statements').update({ status: 'sent', sent_at: now, payout_id: payoutId }).eq('id', id);
    return NextResponse.json({ success: true, emailed, inPortal: Boolean(payoutId) });
  }

  if (st.status !== 'sent') return fail('Send the statement before marking it paid', 409);
  await db.from('owner_statements').update({ status: 'paid', paid_at: now }).eq('id', id);
  if (st.payout_id) await db.from('payouts').update({ status: 'paid', updated_at: now }).eq('id', st.payout_id);
  return NextResponse.json({ success: true });
}
