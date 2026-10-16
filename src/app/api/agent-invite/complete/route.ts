import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

type InviteRole = 'owner' | 'team_lead' | 'agent' | 'analyst';

const ROLE_DEFAULTS: Record<InviteRole, {
  appRole: 'admin' | 'agent';
  permissions: {
    leadAccess: boolean;
    export: boolean;
    sync: boolean;
    pipeline: boolean;
    analytics: boolean;
    settings: boolean;
  };
}> = {
  owner: { appRole: 'admin', permissions: { leadAccess: true, export: true, sync: true, pipeline: true, analytics: true, settings: true } },
  team_lead: { appRole: 'agent', permissions: { leadAccess: true, export: true, sync: false, pipeline: true, analytics: true, settings: false } },
  agent: { appRole: 'agent', permissions: { leadAccess: true, export: false, sync: false, pipeline: true, analytics: false, settings: false } },
  analyst: { appRole: 'agent', permissions: { leadAccess: false, export: true, sync: false, pipeline: false, analytics: true, settings: false } },
};

function initials(fullName: string) {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'NA';
}

export async function POST(req: NextRequest) {
  try {
    const { token, password, firstName, lastName } = await req.json();
    if (!token || !password) {
      return NextResponse.json({ error: 'Token and password are required.' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from('agent_invites')
      .select('*')
      .eq('invite_token', token)
      .maybeSingle();

    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Invalid invite token.' }, { status: 404 });
    }
    if (invite.status === 'completed') {
      return NextResponse.json({ error: 'This invite has already been used.' }, { status: 410 });
    }
    if (invite.status === 'expired' || new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This invite has expired. Contact your admin for a new one.' }, { status: 410 });
    }

    const workspaceRole = (['owner', 'team_lead', 'agent', 'analyst'].includes(invite.role) ? invite.role : 'agent') as InviteRole;
    const defaults = ROLE_DEFAULTS[workspaceRole];
    const fullName = `${firstName || invite.first_name} ${lastName || invite.last_name}`.trim();
    const metadataRole = defaults.appRole;

    const { data: authData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: metadataRole,
        workspace_role: workspaceRole,
        invite_token: token,
      },
    });

    if (createUserError || !authData.user) {
      return NextResponse.json({ error: createUserError?.message || 'Failed to create account.' }, { status: 500 });
    }

    const userId = authData.user.id;

    const { error: profileError } = await supabaseAdmin.from('user_profiles').upsert({
      id: userId,
      email: invite.email,
      full_name: fullName,
      app_role: defaults.appRole,
      role: defaults.appRole,
      tour_view_count: 0,
      is_active: true,
      perm_lead_access: defaults.permissions.leadAccess,
      perm_export: defaults.permissions.export,
      perm_sync: defaults.permissions.sync,
      perm_pipeline: defaults.permissions.pipeline,
      perm_analytics: defaults.permissions.analytics,
      perm_settings: defaults.permissions.settings,
    }, { onConflict: 'id' });

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    const { error: inviteUpdateError } = await supabaseAdmin
      .from('agent_invites')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        agent_user_id: userId,
      })
      .eq('id', invite.id);

    if (inviteUpdateError) {
      return NextResponse.json({ error: inviteUpdateError.message }, { status: 500 });
    }

    if (defaults.appRole === 'agent') {
      const { error: agentProfileError } = await supabaseAdmin.from('agent_profiles').upsert({
        id: userId,
        owner_user_id: userId,
        full_name: fullName,
        email: invite.email,
        role: workspaceRole,
        status: 'active',
        avatar_initials: initials(fullName),
        bio: '',
      }, { onConflict: 'id' });
      if (agentProfileError) {
        return NextResponse.json({ error: agentProfileError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, userId, email: invite.email });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
