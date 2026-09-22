import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireLeadAccess } from '@/lib/auth/apiAuthorization';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const {
      leadId,
      leadAddress,
      leadState,
      agentName,
      contactName,
      portfolioState,
      baseScriptVariant,
    } = body;

    if (leadId) {
      const authorization = await requireLeadAccess(request, leadId);
      if (!authorization.actor) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
    }

    const { data, error } = await supabase
      .from('call_sessions')
      .insert({
        user_id: session.user.id,
        lead_id: leadId || null,
        lead_address: leadAddress || null,
        lead_state: leadState || null,
        agent_name: agentName || null,
        contact_name: contactName || null,
        portfolio_state: portfolioState || null,
        base_script_variant: baseScriptVariant || 'initial_outreach',
        consent_acknowledged: true,
        consent_acknowledged_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sessionId: data.id });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { sessionId, transcript, suggestionsCount, outcome, notes, durationSeconds } = body;

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const { data: existingSession } = await supabase
      .from('call_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (!existingSession) return NextResponse.json({ error: 'Call session not found' }, { status: 404 });

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (transcript !== undefined) updateData.transcript = transcript;
    if (suggestionsCount !== undefined) updateData.suggestions_count = suggestionsCount;
    if (outcome !== undefined) updateData.outcome = outcome;
    if (notes !== undefined) updateData.notes = notes;
    if (durationSeconds !== undefined) {
      updateData.duration_seconds = durationSeconds;
      updateData.ended_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('call_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .eq('user_id', session.user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
