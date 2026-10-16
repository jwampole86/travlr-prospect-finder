import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

function getWritableDb(fallback: Awaited<ReturnType<typeof createClient>>) {
  try {
    return getSupabaseAdmin();
  } catch {
    return fallback;
  }
}

/**
 * POST /api/enrichment/review-action
 * Accept, reject, or merge an owner match from the review queue.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const db = getWritableDb(supabase);

    const body = await req.json();
    const { reviewId, matchId, leadId, action, reason } = body;

    if (!action || !leadId || (!reviewId && !matchId)) {
      return NextResponse.json(
        { error: 'action, leadId, and a reviewId or matchId are required' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const { data: reviewRecord, error: reviewLookupError } = reviewId
      ? await db
          .from('enrichment_review_queue')
          .select('id, job_id, suggested_owner_name, suggested_phone, provider')
          .eq('id', reviewId)
          .maybeSingle()
      : { data: null, error: null };

    if (reviewLookupError) {
      return NextResponse.json({ error: reviewLookupError.message }, { status: 500 });
    }

    if (action === 'ACCEPT' && matchId) {
      const { data: acceptedMatch, error: matchError } = await db
        .from('property_owner_matches')
        .update({
          match_status: 'ACCEPTED',
          reviewed_at: now,
          reviewed_by: user.id,
          verified_owner: true,
          owner_verified_at: now,
          owner_verification_method: 'HUMAN_REVIEW',
        })
        .eq('id', matchId)
        .select('id, owner_name, source_provider')
        .single();

      if (matchError) {
        return NextResponse.json({ error: matchError.message }, { status: 500 });
      }

      if (reviewId) {
        const { error: reviewError } = await db
          .from('enrichment_review_queue')
          .update({
            review_status: 'ACCEPTED',
            reviewed_by: user.id,
            reviewed_at: now,
            review_action: 'ACCEPT',
            review_notes: reason || null,
          })
          .eq('id', reviewId);

        if (reviewError) {
          return NextResponse.json({ error: reviewError.message }, { status: 500 });
        }
      }

      const leadUpdates: Record<string, unknown> = {
        verified_owner: true,
        ownership_record_verified: true,
        updated_at: now,
        last_verified_at: now,
        owner_verified_at: now,
        owner_verification_method: 'HUMAN_REVIEW',
        verified_owner_method: 'HUMAN_REVIEW',
        verified_owner_source:
          acceptedMatch?.source_provider || reviewRecord?.provider || 'HUMAN_REVIEW',
        owner_verification_source:
          acceptedMatch?.source_provider || reviewRecord?.provider || 'HUMAN_REVIEW',
      };

      const acceptedOwnerName =
        reviewRecord?.suggested_owner_name || acceptedMatch?.owner_name || null;
      if (acceptedOwnerName) {
        leadUpdates.contact_name = acceptedOwnerName;
        leadUpdates.owner_name = acceptedOwnerName;
      }

      if (reviewRecord?.suggested_phone) {
        leadUpdates.contact_phone = reviewRecord.suggested_phone;
        leadUpdates.has_phone = true;
        leadUpdates.verified_number = true;
        leadUpdates.phone_verified_at = now;
        leadUpdates.phone_verification_source = reviewRecord.provider || 'HUMAN_REVIEW';
        leadUpdates.verified_number_source = reviewRecord.provider || 'HUMAN_REVIEW';
        leadUpdates.verified_number_method = 'HUMAN_REVIEW';
      }

      const { error: leadError } = await db.from('leads').update(leadUpdates).eq('id', leadId);
      if (leadError) {
        return NextResponse.json({ error: leadError.message }, { status: 500 });
      }

      if (reviewRecord?.job_id) {
        const { error: jobError } = await db
          .from('enrichment_jobs')
          .update({ job_status: 'FOUND', completed_at: now })
          .eq('id', reviewRecord.job_id);

        if (jobError) {
          return NextResponse.json({ error: jobError.message }, { status: 500 });
        }
      }

      await recalculateFullyVerified(leadId, db);

      const { error: auditError } = await db.from('enrichment_audit_events').insert({
        lead_id: leadId,
        event_type: 'OWNER_MATCH_ACCEPTED',
        event_data: {
          matchId,
          reviewedBy: user.id,
          reason,
          appliedOwnerName: acceptedOwnerName,
          appliedPhone: reviewRecord?.suggested_phone || null,
        },
        performed_by: user.id,
      });

      if (auditError) {
        return NextResponse.json({ error: auditError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: 'ACCEPTED' });
    }

    if (action === 'REJECT' && matchId) {
      const { error: matchError } = await db
        .from('property_owner_matches')
        .update({
          match_status: 'REJECTED',
          reviewed_at: now,
          reviewed_by: user.id,
          reject_reason: reason || 'Rejected by reviewer',
        })
        .eq('id', matchId);

      if (matchError) {
        return NextResponse.json({ error: matchError.message }, { status: 500 });
      }

      if (reviewId) {
        const { error: reviewError } = await db
          .from('enrichment_review_queue')
          .update({
            review_status: 'REJECTED',
            reviewed_by: user.id,
            reviewed_at: now,
            review_action: 'REJECT',
            review_notes: reason || null,
          })
          .eq('id', reviewId);

        if (reviewError) {
          return NextResponse.json({ error: reviewError.message }, { status: 500 });
        }
      }

      if (reviewRecord?.job_id) {
        const { error: jobError } = await db
          .from('enrichment_jobs')
          .update({ job_status: 'NO_MATCH', completed_at: now })
          .eq('id', reviewRecord.job_id);

        if (jobError) {
          return NextResponse.json({ error: jobError.message }, { status: 500 });
        }
      }

      const { error: auditError } = await db.from('enrichment_audit_events').insert({
        lead_id: leadId,
        event_type: 'OWNER_MATCH_REJECTED',
        event_data: { matchId, reviewedBy: user.id, reason },
        performed_by: user.id,
      });

      if (auditError) {
        return NextResponse.json({ error: auditError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: 'REJECTED' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('Review action error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function recalculateFullyVerified(
  leadId: string,
  supabase: ReturnType<typeof getWritableDb>
) {
  const { data: lead, error } = await supabase
    .from('leads')
    .select('verified_owner, verified_address, verified_number')
    .eq('id', leadId)
    .single();

  if (error) {
    throw error;
  }

  if (lead) {
    const fullyVerified = !!(lead.verified_owner && lead.verified_address && lead.verified_number);
    const { error: updateError } = await supabase
      .from('leads')
      .update({ fully_verified: fullyVerified })
      .eq('id', leadId);
    if (updateError) {
      throw updateError;
    }
  }
}
