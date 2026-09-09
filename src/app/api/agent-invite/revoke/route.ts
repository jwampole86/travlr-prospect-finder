import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { inviteId } = await req.json();

    if (!inviteId) {
      return NextResponse.json({ error: 'Invite ID required.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('agent_invites')
      .update({ status: 'expired' })
      .eq('id', inviteId)
      .in('status', ['invited']); // Only revoke pending invites

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
