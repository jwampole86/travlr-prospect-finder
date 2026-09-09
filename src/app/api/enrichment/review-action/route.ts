import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/enrichment/review-action
 * Accept, reject, or merge an owner match from the review queue.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { reviewId, matchId, leadId, action, reason } = body;

    if (!action || !leadId) {
      return NextResponse.json({ error: 'action and leadId are required' }, { status: 400 });
    }

    const now = new Date().toISOString();

    if (action === 'ACCEPT' && matchId) {
      // Update match to accepted
      await supabase.from('property_owner_matches').update({
        match_status: 'ACCEPTED',
        reviewed_at: now,
        reviewed_by: user.id,
        verified_owner: true,
        owner_verified_at: now,
        owner_verification_method: 'HUMAN_REVIEW',
      }).eq('id', matchId);

      // Update review queue
      if (reviewId) {
        await supabase.from('enrichment_review_queue').update({
          review_status: 'ACCEPTED',
          reviewed_by: user.id,
          reviewed_at: now,
          review_action: 'ACCEPT',
          review_notes: reason || null,
        }).eq('id', reviewId);
      }

      // Update lead's verified_owner flag
      await supabase.from('leads').update({ verified_owner: true, updated_at: now }).eq('id', leadId);

      // Recalculate fully_verified
      await recalculateFullyVerified(leadId, supabase);

      await supabase.from('enrichment_audit_events').insert({
        lead_id: leadId,
        event_type: 'OWNER_MATCH_ACCEPTED',
        event_data: { matchId, reviewedBy: user.id, reason },
        performed_by: user.id,
      });

      return NextResponse.json({ success: true, action: 'ACCEPTED' });
    }

    if (action === 'REJECT' && matchId) {
      await supabase.from('property_owner_matches').update({
        match_status: 'REJECTED',
        reviewed_at: now,
        reviewed_by: user.id,
        reject_reason: reason || 'Rejected by reviewer',
      }).eq('id', matchId);

      if (reviewId) {
        await supabase.from('enrichment_review_queue').update({
          review_status: 'REJECTED',
          reviewed_by: user.id,
          reviewed_at: now,
          review_action: 'REJECT',
          review_notes: reason || null,
        }).eq('id', reviewId);
      }

      await supabase.from('enrichment_audit_events').insert({
        lead_id: leadId,
        event_type: 'OWNER_MATCH_REJECTED',
        event_data: { matchId, reviewedBy: user.id, reason },
        performed_by: user.id,
      });

      return NextResponse.json({ success: true, action: 'REJECTED' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('Review action error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function recalculateFullyVerified(leadId: string, supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: lead } = await supabase
    .from('leads')
    .select('verified_owner, verified_address, verified_number')
    .eq('id', leadId)
    .single();

  if (lead) {
    const fullyVerified = !!(lead.verified_owner && lead.verified_address && lead.verified_number);
    await supabase.from('leads').update({ fully_verified: fullyVerified }).eq('id', leadId);
  }
}
