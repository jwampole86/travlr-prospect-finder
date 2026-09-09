import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { token, password, firstName, lastName } = await req.json();

    if (!token || !password) {
      return NextResponse.json({ error: 'Token and password are required.' }, { status: 400 });
    }

    // Validate token
    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from('agent_invites')
      .select('*')
      .eq('invite_token', token)
      .single();

    if (inviteErr || !invite) {
      return NextResponse.json({ error: 'Invalid invite token.' }, { status: 404 });
    }

    if (invite.status === 'completed') {
      return NextResponse.json({ error: 'This invite has already been used.' }, { status: 410 });
    }

    if (invite.status === 'expired' || new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This invite has expired. Contact your admin for a new one.' }, { status: 410 });
    }

    const fullName = `${firstName || invite.first_name} ${lastName || invite.last_name}`.trim();

    // Create the Supabase auth user
    const { data: authData, error: signUpErr } = await supabaseAdmin.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'agent',
        invite_token: token,
      },
    });

    if (signUpErr || !authData.user) {
      return NextResponse.json({ error: signUpErr?.message || 'Failed to create account.' }, { status: 500 });
    }

    const userId = authData.user.id;

    // Upsert user_profiles with agent role
    await supabaseAdmin.from('user_profiles').upsert({
      id: userId,
      email: invite.email,
      full_name: fullName,
      app_role: 'agent',
      tour_view_count: 0,
    }, { onConflict: 'id' });

    // Mark invite as completed
    await supabaseAdmin
      .from('agent_invites')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        agent_user_id: userId,
      })
      .eq('id', invite.id);

    // Create agent_profile record (mirrors existing agent management)
    const initials = fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
    await supabaseAdmin.from('agent_profiles').insert({
      owner_user_id: invite.invited_by || userId,
      full_name: fullName,
      email: invite.email,
      role: 'agent',
      status: 'active',
      avatar_initials: initials,
      bio: '',
    }).catch(() => {}); // Non-fatal if already exists

    return NextResponse.json({ success: true, userId, email: invite.email });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
