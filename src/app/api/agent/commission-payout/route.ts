import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { requireApiActor } from '@/lib/auth/apiAuthorization';


// ─── GET /api/agent/commission-payout ────────────────────────────────────────
// Returns commission payout data scoped strictly to the requesting agent.
// Never returns portfolio-wide revenue figures to agent-role requests.
// Admin/owner requests receive full data.

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();

    const auth = await requireApiActor(req);
    if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const userId = auth.actor.user.id;
    const role = auth.actor.role;
    if (role !== 'agent' && !auth.actor.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    if (role === 'agent') {
      // ── Agent: return only their own commission payout data ──────────────
      // NEVER return portfolio-wide revenue figures to agent role
      const { data: payout } = await supabase
        .from('agent_commission_payouts')
        .select(
          'pending_payout, next_payout_date, next_payout_amount, total_earned_current_period, total_earned_lifetime, stripe_connect_status'
        )
        .eq('agent_id', userId)
        .single();

      return NextResponse.json({
        role: 'agent',
        payout: payout ?? {
          pending_payout: 0,
          next_payout_date: null,
          next_payout_amount: 0,
          total_earned_current_period: 0,
          total_earned_lifetime: 0,
          stripe_connect_status: 'not_connected',
        },
        // Explicitly exclude: portfolio_revenue, live_revenue, gross_revenue, net_revenue
      });
    }

    // ── Admin/Owner: return full financial data ───────────────────────────
    let liveQuery = supabase.from('leads').select('estimated_net_monthly, stage').eq('stage', 'Live');
    if (auth.actor.organizationId) liveQuery = liveQuery.eq('organization_id', auth.actor.organizationId);
    const { data: portfolioRevenue } = await liveQuery;

    const liveRevenue = (portfolioRevenue ?? []).reduce(
      (sum: number, l: any) => sum + (l.estimated_net_monthly ?? 0),
      0
    );

    return NextResponse.json({
      role,
      live_revenue: liveRevenue,
      payout: null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
