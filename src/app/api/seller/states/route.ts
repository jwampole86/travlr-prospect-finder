import { NextRequest, NextResponse } from 'next/server';
import { fail, sellerContext } from '@/lib/seller/api';
import { isJurisdiction } from '@/lib/seller/stateActivation';

const FIELDS = ['status', 'brokers_can_pay', 'unlicensed_payee_allowed', 'must_pay_through_brokerage', 'written_agreement_required', 'out_of_state_notes', 'lookup_url', 'citations', 'counsel_name', 'counsel_reviewed_at', 'notes'] as const;
const ANSWERS = ['yes', 'no', 'unknown'];

/** GET returns the saved state rows; any state with no row is simply not active. */
export async function GET(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  let q = ctx.db.from('state_activation').select('*').limit(100);
  if (ctx.orgId) q = q.eq('organization_id', ctx.orgId);
  const { data, error } = await q;
  if (error) return fail(error.message, 500);
  return NextResponse.json({ items: data ?? [] });
}

/** PATCH { state, ...fields } saves one state's checklist. A state can only be switched on once counsel's review date is recorded. */
export async function PATCH(req: NextRequest) {
  const ctx = await sellerContext(req);
  if ('error' in ctx) return ctx.error;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const state = typeof body.state === 'string' ? body.state.toUpperCase() : '';
  if (!isJurisdiction(state)) return fail('Unknown state');

  const patch: Record<string, unknown> = {};
  for (const k of FIELDS) if (k in body) patch[k] = body[k] === '' ? null : body[k];
  for (const k of ['brokers_can_pay', 'unlicensed_payee_allowed', 'must_pay_through_brokerage', 'written_agreement_required'] as const) {
    if (k in patch && !ANSWERS.includes(String(patch[k]))) return fail(`${k} must be yes, no or unknown`);
  }
  if ('status' in patch && !['not_active', 'pilot', 'live'].includes(String(patch.status))) return fail('Unknown status');
  if ('counsel_reviewed_at' in patch && patch.counsel_reviewed_at !== null) {
    const t = Date.parse(String(patch.counsel_reviewed_at));
    if (!Number.isFinite(t) || t > Date.now() + 86_400_000) return fail('Counsel review date must be a real date, not in the future');
    patch.counsel_reviewed_at = new Date(t).toISOString();
  }

  let cq = ctx.db.from('state_activation').select('*').eq('state', state);
  if (ctx.orgId) cq = cq.eq('organization_id', ctx.orgId);
  const { data: current } = await cq.maybeSingle();
  const next = { ...(current ?? {}), ...patch } as Record<string, unknown>;
  if (patch.status && patch.status !== 'not_active' && !next.counsel_reviewed_at) return fail('Record counsel\'s review date before switching this state on.', 409);
  if (patch.status && patch.status !== 'not_active' && (next.brokers_can_pay !== 'yes' || next.unlicensed_payee_allowed === 'yes')) {
    return fail('Answer the checklist first: licensed brokers may pay referral fees, and unlicensed people may not be paid.', 409);
  }
  // Taking away counsel's sign-off switches the state off again.
  if ('counsel_reviewed_at' in patch && patch.counsel_reviewed_at === null && next.status !== 'not_active') patch.status = 'not_active';

  const row = { ...patch, state, ...(ctx.orgId ? { organization_id: ctx.orgId } : {}) };
  const { data, error } = current
    ? await ctx.db.from('state_activation').update(patch).eq('id', (current as { id: string }).id).select('*').maybeSingle()
    : await ctx.db.from('state_activation').insert(row).select('*').single();
  if (error) return fail(error.message, 422);
  return NextResponse.json({ item: data });
}
