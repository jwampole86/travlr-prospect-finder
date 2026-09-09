import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * GET /api/agent/leads
 * Server-side authorized lead list.
 * Agents can only retrieve their assigned leads; admins can retrieve all leads or filter by agent.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user: cookieUser } } = await supabase.auth.getUser();

    // Verify auth. Prefer Supabase SSR cookies, but keep bearer-token support for callers that pass it explicitly.
    const authHeader = req.headers.get('authorization');
    let user = cookieUser;

    if (!user && authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user: bearerUser }, error: authErr } = await supabaseAdmin.auth.getUser(token);
      if (!authErr && bearerUser) user = bearerUser;
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify role
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('app_role, role, is_active')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 });
    }

    const effectiveRole = profile.app_role || profile.role || user.user_metadata?.role || user.raw_user_meta_data?.role || 'admin';
    const isAdmin = ['admin', 'owner', 'operator', 'super_admin'].includes(effectiveRole);
    const isAgent = effectiveRole === 'agent';

    if (!isAdmin && !isAgent) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Deactivated agent check
    if (isAgent && profile.is_active === false) {
      return NextResponse.json({ error: 'Account deactivated. Contact your administrator.' }, { status: 403 });
    }

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 1000);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const priorityOnly = url.searchParams.get('priority_only') === 'true';
    const followUpDue = url.searchParams.get('follow_up_due') === 'true';
    const verifiedWithNumbers = url.searchParams.get('verified_with_numbers') === 'true';
    const search = url.searchParams.get('search') || null;

    // For agents: enforce server-side scope — they ONLY see their assigned leads
    // For admins: they can optionally pass agent_id to view a specific agent's leads
    let query = supabaseAdmin
      .from('leads')
      .select(`
        id, owner_name, contact_name, property_address, address, city, state, phone, contact_phone,
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

    if (verifiedWithNumbers) {
      query = query
        .eq('verified_owner', true)
        .eq('verified_number', true)
        .not('verified_address', 'is', null)
        .neq('verified_address', '')
        .neq('verified_address', 'false');
    }

    if (search) {
      query = query.or(`owner_name.ilike.%${search}%,property_address.ilike.%${search}%,city.ilike.%${search}%`);
    }

    const { data: leads, error: leadsErr } = await query;

    if (leadsErr) {
      return NextResponse.json({ error: leadsErr.message }, { status: 500 });
    }

    const normalizedLeads = (leads || []).map((lead) => ({
      ...lead,
      owner_name: lead.owner_name || lead.contact_name || '',
      property_address: lead.property_address || lead.address || '',
      phone: lead.phone || lead.contact_phone || '',
    }));

    const visibleLeads = verifiedWithNumbers
      ? normalizedLeads.filter((lead) => lead.property_address && lead.phone)
      : normalizedLeads;

    return NextResponse.json({ leads: visibleLeads, agentId: isAgent ? user.id : null, role: effectiveRole });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
