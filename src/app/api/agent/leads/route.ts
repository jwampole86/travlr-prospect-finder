import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * GET /api/agent/leads
 * Server-side authorized: returns only leads assigned to the calling agent.
 * Agents cannot retrieve other agents' leads by changing query params.
 */
export async function GET(req: NextRequest) {
  try {
    // Verify auth
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify role
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('app_role, is_active')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
    }

    const isAdmin = profile.app_role === 'admin';
    const isAgent = profile.app_role === 'agent';

    if (!isAdmin && !isAgent) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Deactivated agent check
    if (isAgent && profile.is_active === false) {
      return NextResponse.json({ error: 'Account deactivated. Contact your administrator.' }, { status: 403 });
    }

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const priorityOnly = url.searchParams.get('priority_only') === 'true';
    const followUpDue = url.searchParams.get('follow_up_due') === 'true';
    const search = url.searchParams.get('search') || null;

    // For agents: enforce server-side scope — they ONLY see their assigned leads
    // For admins: they can optionally pass agent_id to view a specific agent's leads
    let query = supabaseAdmin
      .from('leads')
      .select(`
        id, owner_name, property_address, city, state, phone,
        is_high_priority, priority_tier, luxury, verified_owner, verified_address, verified_number,
        lead_status, stage, prospect_score, next_follow_up_at,
        last_contacted_at, created_at, do_not_contact, estimated_net_monthly,
        notes, primary_agent_id
      `)
      .order('is_high_priority', { ascending: false })
      .order('prospect_score', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (isAgent) {
      // CRITICAL: agents can ONLY see their own assigned leads
      query = query.eq('primary_agent_id', user.id);
    } else if (isAdmin) {
      const agentId = url.searchParams.get('agent_id');
      if (agentId) {
        query = query.eq('primary_agent_id', agentId);
      }
    }

    if (priorityOnly) {
      query = query.eq('is_high_priority', true);
    }

    if (followUpDue) {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      query = query.lte('next_follow_up_at', tomorrow).not('next_follow_up_at', 'is', null);
    }

    if (search) {
      query = query.or(`owner_name.ilike.%${search}%,property_address.ilike.%${search}%,city.ilike.%${search}%`);
    }

    const { data: leads, error: leadsErr } = await query;

    if (leadsErr) {
      return NextResponse.json({ error: leadsErr.message }, { status: 500 });
    }

    return NextResponse.json({ leads: leads || [], agentId: isAgent ? user.id : null });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
