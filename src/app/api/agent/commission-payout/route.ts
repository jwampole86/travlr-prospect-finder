import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

// ─── GET /api/agent/commission-payout ────────────────────────────────────────
// Returns commission payout data scoped strictly to the requesting agent.
// Never returns portfolio-wide revenue figures to agent-role requests.
// Admin/owner requests receive full data.

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Verify session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Load role from user_profiles (authoritative source)
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('app_role')
      .eq('id', userId)
      .single();

    const role = profile?.app_role ?? session.user.user_metadata?.role ?? 'agent';

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
    const { data: portfolioRevenue } = await supabase
      .from('leads')
      .select('estimated_net_monthly, stage')
      .eq('stage', 'Live');

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
