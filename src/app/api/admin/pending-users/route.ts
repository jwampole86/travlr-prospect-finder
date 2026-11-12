import { NextRequest, NextResponse } from 'next/server';
import { requireAdminActor } from '@/lib/auth/apiAuthorization';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

const APPROVE_AS = {
  agent: { app_role: 'agent', role: 'agent', member: 'member', perm_lead_access: true, perm_pipeline: true, perm_export: false, perm_sync: false, perm_analytics: false, perm_settings: false },
  admin: { app_role: 'admin', role: 'admin', member: 'admin', perm_lead_access: true, perm_pipeline: true, perm_export: true, perm_sync: true, perm_analytics: true, perm_settings: true },
} as const;

/** GET: accounts that signed up and are waiting for a role. Admin only. */
export async function GET(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data, error } = await getSupabaseAdmin()
    .from('user_profiles')
    .select('id, email, full_name, created_at')
    .eq('app_role', 'pending')
    .neq('is_active', false)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data ?? [] });
}

/** POST { userId, action: 'approve' | 'reject', role?: 'agent' | 'admin' }. Admin only; only touches accounts that are still pending. */
export async function POST(req: NextRequest) {
  const auth = await requireAdminActor(req);
  if (!auth.actor) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await req.json().catch(() => ({}))) as { userId?: unknown; action?: unknown; role?: unknown };
  const userId = typeof body.userId === 'string' ? body.userId : '';
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

  const db = getSupabaseAdmin();
  const { data: profile } = await db.from('user_profiles').select('id, email, app_role').eq('id', userId).maybeSingle();
  if (!profile || profile.app_role !== 'pending') return NextResponse.json({ error: 'That account is not waiting for approval.' }, { status: 409 });

  if (body.action === 'reject') {
    await db.from('user_profiles').update({ is_active: false, status: 'inactive', deactivated_at: new Date().toISOString() }).eq('id', userId);
    await db.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
    return NextResponse.json({ ok: true, status: 'rejected' });
  }

  if (body.action !== 'approve') return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
  const grant = APPROVE_AS[body.role === 'admin' ? 'admin' : 'agent'];
  const orgId = auth.actor.organizationId;
  if (!orgId) return NextResponse.json({ error: 'Your account is not in an organization, so it cannot add members.' }, { status: 422 });

  const { error: memberError } = await db.from('organization_members').upsert({ organization_id: orgId, user_id: userId, role: grant.member }, { onConflict: 'user_id' });
  if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 });
  const { member: _member, ...profileFields } = grant;
  const { error: profileError } = await db.from('user_profiles').update({ ...profileFields, is_active: true, status: 'active', updated_at: new Date().toISOString() }).eq('id', userId);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  await db.auth.admin.updateUserById(userId, { user_metadata: { role: grant.app_role } });
  return NextResponse.json({ ok: true, status: 'approved', role: grant.app_role });
}
