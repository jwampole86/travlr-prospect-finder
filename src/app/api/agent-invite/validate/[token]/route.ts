import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token) {
      return NextResponse.json({ error: 'Token required.' }, { status: 400 });
    }

    // Auto-expire stale invites first
    await supabaseAdmin.rpc('expire_agent_invites').catch(() => {});

    const { data: invite, error } = await supabaseAdmin
      .from('agent_invites')
      .select('id, invite_token, email, first_name, last_name, assigned_portfolios, role, status, expires_at, completed_at')
      .eq('invite_token', token)
      .single();

    if (error || !invite) {
      return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
    }

    if (invite.status === 'completed') {
      return NextResponse.json({ error: 'This invite has already been used. Please contact your admin for a new one.' }, { status: 410 });
    }

    if (invite.status === 'expired' || new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This invite has expired. Please contact your admin for a new one.' }, { status: 410 });
    }

    return NextResponse.json({ invite });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
