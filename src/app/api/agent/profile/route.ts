import { NextRequest, NextResponse } from 'next/server';
import { requireApiActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { TIMEZONES, mergePrefs, validPrefsPatch } from '@/lib/agentPrefs';
import { isTwilioConfigured } from '@/lib/services/twilioService';
import { getResendConfigStatus } from '@/lib/email/resend';
import { toE164 } from '@/lib/services/smsConsent';

type Db = ReturnType<typeof getSupabaseAdmin>;
const BOARD_STAGES = ['prospect', 'queued', 'texted', 'engaged', 'hot', 'human', 'contract', 'live', 'unreachable', 'closed'];

async function snapshot(db: Db, id: string) {
  const { data: p } = await db.from('user_profiles').select('id,email,full_name,phone,timezone,bio,avatar_initials,sms_opt_in,app_role,role,perm_lead_access,perm_export,perm_sync,perm_pipeline,perm_analytics,perm_settings,created_at,last_active_at,session_count,agent_preferences').eq('id', id).maybeSingle();
  if (!p) return null;
  const [counts, { data: notes }, { count: unread }] = await Promise.all([
    Promise.all(BOARD_STAGES.map(async s => [s, (await db.from('pipeline_board_leads').select('id', { count: 'exact', head: true }).eq('primary_agent_id', id).eq('board_stage', s)).count ?? 0] as const)),
    db.from('app_notifications').select('id,title,message,created_at,read').eq('user_id', id).order('created_at', { ascending: false }).limit(6),
    db.from('app_notifications').select('id', { count: 'exact', head: true }).eq('user_id', id).eq('read', false),
  ]);
  const byStage = Object.fromEntries(counts.filter(([, n]) => n > 0));
  return {
    profile: { id: p.id, email: p.email, fullName: p.full_name ?? '', phone: p.phone ?? '', timezone: p.timezone || 'America/Denver', bio: p.bio ?? '', avatarInitials: p.avatar_initials ?? '', smsOptIn: !!p.sms_opt_in, role: p.app_role, createdAt: p.created_at, lastActiveAt: p.last_active_at, sessionCount: p.session_count ?? 0,
      permissions: { 'Lead access': p.perm_lead_access, 'Export data': p.perm_export, 'Data sync': p.perm_sync, 'Pipeline': p.perm_pipeline, 'Analytics': p.perm_analytics, 'Settings': p.perm_settings } },
    prefs: mergePrefs(p.agent_preferences),
    myLeads: { total: Object.values(byStage).reduce((a, b) => a + b, 0), byStage },
    notifications: { unread: unread ?? 0, recent: notes ?? [] },
    channels: { email: getResendConfigStatus().apiKeyConfigured, sms: isTwilioConfigured() },
  };
}

/** GET /api/agent/profile  ->  the signed-in user's profile, settings, lead counts and recent notifications. */
export async function GET(req: NextRequest) {
  const auth = await requireApiActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const data = await snapshot(getSupabaseAdmin(), auth.actor.user.id);
  return data ? NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
}

/** PATCH /api/agent/profile  ->  saves only the fields a person may change about themselves (never role or permissions). */
export async function PATCH(req: NextRequest) {
  const auth = await requireApiActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const b = await req.json().catch(() => null) as Record<string, any> | null;
  if (!b) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const id = auth.actor.user.id; const db = getSupabaseAdmin();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (b.fullName !== undefined) { const v = String(b.fullName).trim(); if (v.length < 2 || v.length > 80) return NextResponse.json({ error: 'Enter your full name (2 to 80 characters).' }, { status: 400 }); patch.full_name = v; }
  if (b.phone !== undefined) { const raw = String(b.phone).trim(); if (raw) { const e = toE164(raw); if (!e) return NextResponse.json({ error: 'Enter a valid US phone number.' }, { status: 400 }); patch.phone = e; } else patch.phone = ''; }
  if (b.timezone !== undefined) { if (!TIMEZONES.includes(b.timezone)) return NextResponse.json({ error: 'Choose a timezone from the list.' }, { status: 400 }); patch.timezone = b.timezone; }
  if (b.bio !== undefined) { const v = String(b.bio).trim(); if (v.length > 300) return NextResponse.json({ error: 'Keep your bio under 300 characters.' }, { status: 400 }); patch.bio = v; }
  if (b.avatarInitials !== undefined) { const v = String(b.avatarInitials).trim().toUpperCase(); if (!/^[A-Z]{1,3}$/.test(v)) return NextResponse.json({ error: 'Initials must be 1 to 3 letters.' }, { status: 400 }); patch.avatar_initials = v; }
  if (b.smsOptIn !== undefined) patch.sms_opt_in = !!b.smsOptIn;
  if (b.prefs !== undefined) {
    const bad = validPrefsPatch(b.prefs); if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    const { data: cur } = await db.from('user_profiles').select('agent_preferences').eq('id', id).maybeSingle();
    const next = mergePrefs({ ...(b.prefs as object) });
    patch.agent_preferences = { ...((cur?.agent_preferences as object) ?? {}), notif: next.notif, dash: next.dash, hours: next.hours };
  }

  const { error } = await db.from('user_profiles').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: 'Your changes could not be saved.' }, { status: 500 });
  if (patch.full_name || patch.phone !== undefined) {
    const { data: u } = await db.auth.admin.getUserById(id);
    await db.auth.admin.updateUserById(id, { user_metadata: { ...(u.user?.user_metadata ?? {}), ...(patch.full_name ? { full_name: patch.full_name } : {}), ...(patch.phone !== undefined ? { phone: patch.phone } : {}) } }).catch(() => null);
  }
  return NextResponse.json(await snapshot(db, id), { headers: { 'Cache-Control': 'no-store' } });
}
