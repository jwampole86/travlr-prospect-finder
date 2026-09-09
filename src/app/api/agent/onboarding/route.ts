import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * POST /api/agent/onboarding
 * body: { action: 'start' | 'complete', userId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') || '';
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action } = await req.json();

    if (action === 'start') {
      await supabaseAdmin
        .from('user_profiles')
        .update({ agent_onboarding_started_at: new Date().toISOString() })
        .eq('id', user.id)
        .is('agent_onboarding_started_at', null); // only set once
      return NextResponse.json({ success: true });
    }

    if (action === 'complete') {
      await supabaseAdmin
        .from('user_profiles')
        .update({
          agent_onboarding_completed_at: new Date().toISOString(),
          agent_onboarding_version: '1.0',
        })
        .eq('id', user.id);

      // Log completion
      await supabaseAdmin.from('activity_events').insert({
        agent_id: user.id,
        event_type: 'onboarding_completed',
        metadata: { version: '1.0' },
        created_at: new Date().toISOString(),
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

/**
 * GET /api/agent/onboarding
 * Returns onboarding status for the current user.
 */
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace('Bearer ', '') || '';
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('app_role, agent_onboarding_started_at, agent_onboarding_completed_at, is_active')
      .eq('id', user.id)
      .single();

    return NextResponse.json({
      role: profile?.app_role || 'agent',
      onboardingStarted: !!profile?.agent_onboarding_started_at,
      onboardingCompleted: !!profile?.agent_onboarding_completed_at,
      isActive: profile?.is_active !== false,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
