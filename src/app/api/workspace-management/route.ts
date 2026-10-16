import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

type Db = ReturnType<typeof getSupabaseAdmin>;
type GranularRole = 'owner' | 'team_lead' | 'agent' | 'analyst';

type WorkspaceAction = 'updateRole' | 'setAssignments' | 'setActive';

type UserProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  app_role: string | null;
  role: string | null;
  is_active: boolean | null;
  created_at: string | null;
  last_active_at: string | null;
  perm_lead_access: boolean | null;
  perm_export: boolean | null;
  perm_sync: boolean | null;
  perm_pipeline: boolean | null;
  perm_analytics: boolean | null;
  perm_settings: boolean | null;
  deactivated_at: string | null;
};

type AgentProfileRow = {
  id: string;
  owner_user_id: string | null;
  full_name: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
  last_active_at: string | null;
  deactivated_at: string | null;
};

type AgentInviteRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  assigned_portfolios: string[] | null;
  role: string | null;
  status: string | null;
  invited_by: string | null;
  sent_at: string | null;
  expires_at: string | null;
  completed_at: string | null;
  agent_user_id: string | null;
  created_at: string | null;
};

type ActivityRow = {
  id: string;
  event_type: string | null;
  description: string | null;
  detail: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  source: string | null;
  lead_state: string | null;
  event_timestamp: string | null;
  created_at: string | null;
};

type PortfolioRow = {
  state_code: string;
  portfolio_key: string;
};

type PermissionDefaults = {
  appRole: 'admin' | 'agent';
  role: 'admin' | 'agent';
  permissions: {
    leadAccess: boolean;
    export: boolean;
    sync: boolean;
    pipeline: boolean;
    analytics: boolean;
    settings: boolean;
  };
};

const GRANULAR_ROLES = new Set<GranularRole>(['owner', 'team_lead', 'agent', 'analyst']);

const ROLE_DEFAULTS: Record<GranularRole, PermissionDefaults> = {
  owner: {
    appRole: 'admin',
    role: 'admin',
    permissions: { leadAccess: true, export: true, sync: true, pipeline: true, analytics: true, settings: true },
  },
  team_lead: {
    appRole: 'agent',
    role: 'agent',
    permissions: { leadAccess: true, export: true, sync: false, pipeline: true, analytics: true, settings: false },
  },
  agent: {
    appRole: 'agent',
    role: 'agent',
    permissions: { leadAccess: true, export: false, sync: false, pipeline: true, analytics: false, settings: false },
  },
  analyst: {
    appRole: 'agent',
    role: 'agent',
    permissions: { leadAccess: false, export: true, sync: false, pipeline: false, analytics: true, settings: false },
  },
};

function normalizeGranularRole(...values: Array<string | null | undefined>): GranularRole {
  for (const value of values) {
    if (!value) continue;
    const normalized = value.trim().toLowerCase();
    if (GRANULAR_ROLES.has(normalized as GranularRole)) {
      return normalized as GranularRole;
    }
  }

  for (const value of values) {
    if (!value) continue;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'admin' || normalized === 'owner') return 'owner';
  }

  return 'agent';
}

function splitName(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: 'New', lastName: 'Member' };
  const parts = trimmed.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? 'New',
    lastName: parts.slice(1).join(' ') || 'Member',
  };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'NA';
}

function chunk<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

async function countLeadsByState(db: Db, states: string[]) {
  const counts: Record<string, number> = {};
  for (const group of chunk(states, 8)) {
    await Promise.all(group.map(async (stateCode) => {
      const { count, error } = await db.from('leads').select('id', { count: 'exact', head: true }).eq('state', stateCode);
      if (error) throw new Error(error.message);
      counts[stateCode] = count ?? 0;
    }));
  }
  return counts;
}

async function loadLatestInvite(db: Db, userId: string | null, email: string | null) {
  let query = db
    .from('agent_invites')
    .select('id, email, first_name, last_name, assigned_portfolios, role, status, invited_by, sent_at, expires_at, completed_at, agent_user_id, created_at')
    .order('created_at', { ascending: false })
    .limit(1);

  if (userId) {
    query = query.eq('agent_user_id', userId);
  } else if (email) {
    query = query.eq('email', email.toLowerCase());
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data || [])[0] ?? null) as AgentInviteRow | null;
}

async function upsertInviteForUser(db: Db, actorId: string, profile: UserProfileRow, patch: Partial<AgentInviteRow>) {
  const existingInvite = await loadLatestInvite(db, profile.id, profile.email);
  const fullName = profile.full_name || profile.email || 'Workspace Member';
  const { firstName, lastName } = splitName(fullName);

  if (existingInvite) {
    const { error } = await db
      .from('agent_invites')
      .update({
        role: patch.role ?? existingInvite.role,
        assigned_portfolios: patch.assigned_portfolios ?? existingInvite.assigned_portfolios ?? [],
        agent_user_id: profile.id,
      })
      .eq('id', existingInvite.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await db.from('agent_invites').insert({
    email: (profile.email || '').toLowerCase(),
    first_name: firstName,
    last_name: lastName,
    assigned_portfolios: patch.assigned_portfolios ?? [],
    role: patch.role ?? 'agent',
    invited_by: actorId,
    status: 'completed',
    agent_user_id: profile.id,
    completed_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

async function loadSnapshot(db: Db) {
  const [profilesResult, agentProfilesResult, invitesResult, activityResult, portfoliosResult] = await Promise.all([
    db
      .from('user_profiles')
      .select('id, email, full_name, app_role, role, is_active, created_at, last_active_at, perm_lead_access, perm_export, perm_sync, perm_pipeline, perm_analytics, perm_settings, deactivated_at')
      .order('created_at', { ascending: false }),
    db
      .from('agent_profiles')
      .select('id, owner_user_id, full_name, email, role, status, last_active_at, deactivated_at'),
    db
      .from('agent_invites')
      .select('id, email, first_name, last_name, assigned_portfolios, role, status, invited_by, sent_at, expires_at, completed_at, agent_user_id, created_at')
      .order('created_at', { ascending: false }),
    db
      .from('activity_events')
      .select('id, event_type, description, detail, actor_user_id, actor_email, source, lead_state, event_timestamp, created_at')
      .order('event_timestamp', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(60),
    db
      .from('portfolio_registry')
      .select('state_code, portfolio_key')
      .eq('is_active', true)
      .order('state_code'),
  ]);

  if (profilesResult.error) throw new Error(profilesResult.error.message);
  if (agentProfilesResult.error) throw new Error(agentProfilesResult.error.message);
  if (invitesResult.error) throw new Error(invitesResult.error.message);
  if (activityResult.error) throw new Error(activityResult.error.message);
  if (portfoliosResult.error) throw new Error(portfoliosResult.error.message);

  const profiles = (profilesResult.data || []) as UserProfileRow[];
  const agentProfiles = (agentProfilesResult.data || []) as AgentProfileRow[];
  const invites = (invitesResult.data || []) as AgentInviteRow[];
  const activityRows = (activityResult.data || []) as ActivityRow[];
  const portfolioRows = (portfoliosResult.data || []) as PortfolioRow[];

  const agentProfileByUserId = new Map<string, AgentProfileRow>();
  for (const row of agentProfiles) {
    const userId = row.owner_user_id || row.id;
    if (!agentProfileByUserId.has(userId)) {
      agentProfileByUserId.set(userId, row);
    }
  }

  const inviteByUserId = new Map<string, AgentInviteRow>();
  const inviteByEmail = new Map<string, AgentInviteRow>();
  for (const invite of invites) {
    const email = invite.email?.toLowerCase();
    if (invite.agent_user_id && !inviteByUserId.has(invite.agent_user_id)) {
      inviteByUserId.set(invite.agent_user_id, invite);
    }
    if (email && !inviteByEmail.has(email)) {
      inviteByEmail.set(email, invite);
    }
  }

  const members = profiles
    .filter((profile) => (profile.app_role || '').toLowerCase() !== 'homeowner')
    .map((profile) => {
      const linkedInvite = inviteByUserId.get(profile.id) ?? inviteByEmail.get((profile.email || '').toLowerCase()) ?? null;
      const agentProfile = agentProfileByUserId.get(profile.id) ?? null;
      const granularRole = normalizeGranularRole(agentProfile?.role, linkedInvite?.role, profile.app_role, profile.role);
      const hasGlobalAccess = granularRole === 'owner' || (profile.app_role || '').toLowerCase() === 'admin';
      return {
        memberId: profile.id,
        source: 'user' as const,
        userId: profile.id,
        inviteId: linkedInvite?.id ?? null,
        email: profile.email || 'Unknown email',
        fullName: profile.full_name || profile.email || 'Unnamed member',
        appRole: profile.app_role || 'agent',
        granularRole,
        status: profile.is_active === false || (agentProfile?.status || '').toLowerCase() === 'inactive' ? 'inactive' : 'active',
        createdAt: profile.created_at || new Date().toISOString(),
        lastActiveAt: profile.last_active_at || agentProfile?.last_active_at || null,
        assignedPortfolios: hasGlobalAccess ? [] : linkedInvite?.assigned_portfolios ?? [],
        permissions: {
          leadAccess: profile.perm_lead_access ?? ROLE_DEFAULTS[granularRole].permissions.leadAccess,
          export: profile.perm_export ?? ROLE_DEFAULTS[granularRole].permissions.export,
          pipeline: profile.perm_pipeline ?? ROLE_DEFAULTS[granularRole].permissions.pipeline,
          analytics: profile.perm_analytics ?? ROLE_DEFAULTS[granularRole].permissions.analytics,
          settings: profile.perm_settings ?? ROLE_DEFAULTS[granularRole].permissions.settings,
        },
        hasGlobalAccess,
      };
    });

  const linkedInviteIds = new Set(members.map((member) => member.inviteId).filter(Boolean));
  const inviteOnlyMembers = invites
    .filter((invite) => !linkedInviteIds.has(invite.id) && ['invited', 'expired'].includes((invite.status || '').toLowerCase()))
    .map((invite) => {
      const granularRole = normalizeGranularRole(invite.role);
      const hasGlobalAccess = granularRole === 'owner';
      const fullName = [invite.first_name, invite.last_name].filter(Boolean).join(' ').trim() || invite.email || 'Pending invite';
      return {
        memberId: invite.id,
        source: 'invite' as const,
        userId: null,
        inviteId: invite.id,
        email: invite.email || 'Unknown email',
        fullName,
        appRole: ROLE_DEFAULTS[granularRole].appRole,
        granularRole,
        status: (invite.status || '').toLowerCase() === 'expired' ? 'expired' : 'pending',
        createdAt: invite.created_at || invite.sent_at || new Date().toISOString(),
        lastActiveAt: null,
        assignedPortfolios: hasGlobalAccess ? [] : invite.assigned_portfolios ?? [],
        permissions: {
          leadAccess: ROLE_DEFAULTS[granularRole].permissions.leadAccess,
          export: ROLE_DEFAULTS[granularRole].permissions.export,
          pipeline: ROLE_DEFAULTS[granularRole].permissions.pipeline,
          analytics: ROLE_DEFAULTS[granularRole].permissions.analytics,
          settings: ROLE_DEFAULTS[granularRole].permissions.settings,
        },
        hasGlobalAccess,
      };
    });

  const allMembers = [...members, ...inviteOnlyMembers];
  const memberByUserId = new Map(members.map((member) => [member.userId, member]));
  const memberByEmail = new Map(members.map((member) => [member.email.toLowerCase(), member]));

  const inviteActivity = invites.map((invite) => {
    const fullName = [invite.first_name, invite.last_name].filter(Boolean).join(' ').trim() || invite.email || 'Invite';
    const inviter = invite.invited_by ? memberByUserId.get(invite.invited_by) : undefined;
    const status = (invite.status || '').toLowerCase();
    const timestamp = status === 'completed'
      ? invite.completed_at || invite.created_at
      : status === 'expired'
        ? invite.expires_at || invite.created_at
        : invite.sent_at || invite.created_at;
    return {
      id: `invite-${invite.id}`,
      type: status === 'completed' ? 'invite_completed' : status === 'expired' ? 'invite_expired' : 'member_invited',
      title: fullName,
      description: status === 'completed'
        ? 'Invite accepted and account activated.'
        : status === 'expired'
          ? 'Invite expired before it was accepted.'
          : 'Invite sent and awaiting acceptance.',
      actorName: inviter?.fullName || 'Workspace admin',
      actorEmail: inviter?.email || null,
      source: 'invite',
      timestamp: timestamp || new Date().toISOString(),
      stateCode: null,
    };
  });

  const feed = [
    ...activityRows.map((row) => {
      const actorMember = (row.actor_user_id ? memberByUserId.get(row.actor_user_id) : undefined)
        ?? (row.actor_email ? memberByEmail.get(row.actor_email.toLowerCase()) : undefined);
      return {
        id: row.id,
        type: row.event_type || 'activity',
        title: row.description || row.event_type || 'Activity event',
        description: row.detail || null,
        actorName: actorMember?.fullName || row.actor_email?.split('@')[0] || row.source || 'System',
        actorEmail: actorMember?.email || row.actor_email || null,
        source: row.source || 'system',
        timestamp: row.event_timestamp || row.created_at || new Date().toISOString(),
        stateCode: row.lead_state || null,
      };
    }),
    ...inviteActivity,
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 60);

  const states = [...new Set(portfolioRows.map((row) => row.state_code))];
  const leadCountByState = await countLeadsByState(db, states);

  return {
    members: allMembers,
    activity: feed,
    leadCountByState,
  };
}

async function ensurePortfoliosExist(db: Db, keys: string[]) {
  if (keys.length === 0) return;
  const { data, error } = await db.from('portfolio_registry').select('portfolio_key').eq('is_active', true).in('portfolio_key', keys);
  if (error) throw new Error(error.message);
  const found = new Set((data || []).map((row) => row.portfolio_key as string));
  const missing = keys.filter((key) => !found.has(key));
  if (missing.length > 0) {
    throw new Error(`Unknown portfolio keys: ${missing.join(', ')}`);
  }
}

async function writeAudit(db: Db, targetUserId: string | null, actorId: string, changeType: string, oldValue: Record<string, unknown>, newValue: Record<string, unknown>, notes: string) {
  if (!targetUserId) return;
  await db.from('user_access_audit').insert({
    target_user_id: targetUserId,
    changed_by: actorId,
    change_type: changeType,
    old_value: oldValue,
    new_value: newValue,
    notes,
  }).then(undefined, () => {});
}

async function updateUserRole(db: Db, actorId: string, memberId: string, granularRole: GranularRole) {
  const { data: profile, error } = await db
    .from('user_profiles')
    .select('id, email, full_name, app_role, role, is_active, created_at, last_active_at, perm_lead_access, perm_export, perm_sync, perm_pipeline, perm_analytics, perm_settings, deactivated_at')
    .eq('id', memberId)
    .maybeSingle<UserProfileRow>();
  if (error) throw new Error(error.message);
  if (!profile) throw new Error('Member not found.');

  const defaults = ROLE_DEFAULTS[granularRole];
  const patch = {
    app_role: defaults.appRole,
    role: defaults.role,
    perm_lead_access: defaults.permissions.leadAccess,
    perm_export: defaults.permissions.export,
    perm_sync: defaults.permissions.sync,
    perm_pipeline: defaults.permissions.pipeline,
    perm_analytics: defaults.permissions.analytics,
    perm_settings: defaults.permissions.settings,
    updated_at: new Date().toISOString(),
  };

  const { error: updateError } = await db.from('user_profiles').update(patch).eq('id', memberId);
  if (updateError) throw new Error(updateError.message);

  const fullName = profile.full_name || profile.email || 'Workspace Member';
  const { data: existingAgentProfile } = await db
    .from('agent_profiles')
    .select('id, owner_user_id')
    .eq('owner_user_id', memberId)
    .maybeSingle();

  if (defaults.appRole === 'agent') {
    if (existingAgentProfile?.id) {
      const { error: agentUpdateError } = await db
        .from('agent_profiles')
        .update({
          full_name: fullName,
          email: profile.email,
          role: granularRole,
          status: profile.is_active === false ? 'inactive' : 'active',
          avatar_initials: initials(fullName),
          deactivated_at: profile.is_active === false ? profile.deactivated_at || new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingAgentProfile.id);
      if (agentUpdateError) throw new Error(agentUpdateError.message);
    } else {
      const { error: insertError } = await db.from('agent_profiles').insert({
        id: memberId,
        owner_user_id: memberId,
        full_name: fullName,
        email: profile.email,
        role: granularRole,
        status: profile.is_active === false ? 'inactive' : 'active',
        avatar_initials: initials(fullName),
        bio: '',
      });
      if (insertError) throw new Error(insertError.message);
    }
  } else if (existingAgentProfile?.id) {
    await db.from('agent_profiles').update({
      role: granularRole,
      status: 'inactive',
      deactivated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', existingAgentProfile.id).then(undefined, () => {});
  }

  await upsertInviteForUser(db, actorId, profile, { role: granularRole });

  await db.auth.admin.updateUserById(memberId, {
    user_metadata: {
      full_name: fullName,
      role: defaults.appRole,
      workspace_role: granularRole,
    },
  }).catch(() => null);

  await writeAudit(db, memberId, actorId, 'role_change', {
    app_role: profile.app_role,
    role: profile.role,
  }, {
    app_role: defaults.appRole,
    role: granularRole,
  }, 'Updated workspace role');
}

async function updateInviteRole(db: Db, actorId: string, memberId: string, granularRole: GranularRole) {
  const { data: invite, error } = await db
    .from('agent_invites')
    .select('id, email, first_name, last_name, assigned_portfolios, role, status, invited_by, sent_at, expires_at, completed_at, agent_user_id, created_at')
    .eq('id', memberId)
    .maybeSingle<AgentInviteRow>();
  if (error) throw new Error(error.message);
  if (!invite) throw new Error('Invite not found.');
  const { error: updateError } = await db.from('agent_invites').update({ role: granularRole }).eq('id', memberId);
  if (updateError) throw new Error(updateError.message);
  await writeAudit(db, invite.agent_user_id, actorId, 'role_change', { role: invite.role }, { role: granularRole }, 'Updated pending invite role');
}

async function setAssignments(db: Db, actorId: string, source: 'user' | 'invite', memberId: string, assignedPortfolios: string[]) {
  await ensurePortfoliosExist(db, assignedPortfolios);

  if (source === 'invite') {
    const { data: invite, error } = await db
      .from('agent_invites')
      .select('id, assigned_portfolios, agent_user_id')
      .eq('id', memberId)
      .maybeSingle<{ id: string; assigned_portfolios: string[] | null; agent_user_id: string | null }>();
    if (error) throw new Error(error.message);
    if (!invite) throw new Error('Invite not found.');
    const { error: updateError } = await db.from('agent_invites').update({ assigned_portfolios: assignedPortfolios }).eq('id', memberId);
    if (updateError) throw new Error(updateError.message);
    await writeAudit(db, invite.agent_user_id, actorId, 'permission_change', { assigned_portfolios: invite.assigned_portfolios ?? [] }, { assigned_portfolios: assignedPortfolios }, 'Updated invite portfolio assignments');
    return;
  }

  const { data: profile, error } = await db
    .from('user_profiles')
    .select('id, email, full_name, app_role, role, is_active, created_at, last_active_at, perm_lead_access, perm_export, perm_sync, perm_pipeline, perm_analytics, perm_settings, deactivated_at')
    .eq('id', memberId)
    .maybeSingle<UserProfileRow>();
  if (error) throw new Error(error.message);
  if (!profile) throw new Error('Member not found.');

  const existingInvite = await loadLatestInvite(db, profile.id, profile.email);
  await upsertInviteForUser(db, actorId, profile, {
    role: existingInvite?.role ?? normalizeGranularRole(profile.app_role, profile.role),
    assigned_portfolios: assignedPortfolios,
  });

  await writeAudit(db, profile.id, actorId, 'permission_change', { assigned_portfolios: existingInvite?.assigned_portfolios ?? [] }, { assigned_portfolios: assignedPortfolios }, 'Updated portfolio assignments');
}

async function setActive(db: Db, actorId: string, memberId: string, active: boolean) {
  const { data: profile, error } = await db
    .from('user_profiles')
    .select('id, email, full_name, app_role, role, is_active, created_at, last_active_at, perm_lead_access, perm_export, perm_sync, perm_pipeline, perm_analytics, perm_settings, deactivated_at')
    .eq('id', memberId)
    .maybeSingle<UserProfileRow>();
  if (error) throw new Error(error.message);
  if (!profile) throw new Error('Member not found.');

  const now = new Date().toISOString();
  const { error: updateError } = await db.from('user_profiles').update({
    is_active: active,
    deactivated_at: active ? null : now,
    updated_at: now,
  }).eq('id', memberId);
  if (updateError) throw new Error(updateError.message);

  await db.from('agent_profiles').update({
    status: active ? 'active' : 'inactive',
    deactivated_at: active ? null : now,
    updated_at: now,
  }).eq('owner_user_id', memberId).then(undefined, () => {});

  await writeAudit(db, memberId, actorId, 'status_change', { is_active: profile.is_active ?? true }, { is_active: active }, active ? 'Reactivated member' : 'Deactivated member');
}

export async function GET(req: NextRequest) {
  const authorization = await requireAdminActor(req);
  if (!authorization.actor) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  try {
    const snapshot = await loadSnapshot(getSupabaseAdmin());
    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load workspace data.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const authorization = await requireAdminActor(req);
  if (!authorization.actor) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const body = await req.json().catch(() => null) as {
    action?: WorkspaceAction;
    source?: 'user' | 'invite';
    memberId?: string;
    granularRole?: GranularRole;
    assignedPortfolios?: string[];
    active?: boolean;
  } | null;

  if (!body?.action || !body.memberId) {
    return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 });
  }

  try {
    const db = getSupabaseAdmin();
    if (body.action === 'updateRole') {
      if (!body.granularRole || !GRANULAR_ROLES.has(body.granularRole)) {
        return NextResponse.json({ error: 'Invalid workspace role.' }, { status: 400 });
      }
      if (body.source === 'invite') {
        await updateInviteRole(db, authorization.actor.user.id, body.memberId, body.granularRole);
      } else {
        await updateUserRole(db, authorization.actor.user.id, body.memberId, body.granularRole);
      }
    } else if (body.action === 'setAssignments') {
      await setAssignments(db, authorization.actor.user.id, body.source === 'invite' ? 'invite' : 'user', body.memberId, Array.isArray(body.assignedPortfolios) ? [...new Set(body.assignedPortfolios)].sort() : []);
    } else if (body.action === 'setActive') {
      if (typeof body.active !== 'boolean') {
        return NextResponse.json({ error: 'Missing active flag.' }, { status: 400 });
      }
      await setActive(db, authorization.actor.user.id, body.memberId, body.active);
    } else {
      return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to save workspace changes.' }, { status: 500 });
  }
}
