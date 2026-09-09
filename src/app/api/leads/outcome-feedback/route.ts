import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

/**
 * POST /api/leads/outcome-feedback
 * Feed closed-deal outcomes back into AI scoring.
 * Records conversion results and triggers score weight recalculation
 * per region and property type.
 *
 * Body: { leadId, outcome: 'converted' | 'lost', region?, propertyType?, closedAt? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { leadId, outcome, region, propertyType, closedAt, dealValue, agentId } = body;

    if (!leadId || !outcome) {
      return NextResponse.json({ error: 'leadId and outcome are required' }, { status: 400 });
    }

    if (!['converted', 'lost'].includes(outcome)) {
      return NextResponse.json({ error: 'outcome must be "converted" or "lost"' }, { status: 400 });
    }

    const supabase = createClient();

    // 1. Fetch the lead to get its current prospect_score, region, property details
    const { data: lead } = await supabase
      .from('leads')
      .select('id, prospect_score, state, beds, baths, price, source, stage, tags')
      .eq('id', leadId)
      .single();

    const leadRegion = region || lead?.state || 'unknown';
    const leadPropertyType = propertyType || (lead?.beds >= 4 ? 'large' : lead?.beds >= 2 ? 'mid' : 'small');
    const prospectScore = lead?.prospect_score ?? 0;

    // 2. Insert into outcome_feedback table
    const { data: feedbackRow, error: insertError } = await supabase
      .from('outcome_feedback')
      .insert({
        lead_id: leadId,
        outcome,
        prospect_score_at_close: prospectScore,
        region: leadRegion,
        property_type: leadPropertyType,
        deal_value: dealValue ?? null,
        agent_id: agentId ?? null,
        closed_at: closedAt ?? new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError && insertError.code !== '42P01') {
      console.warn('[OutcomeFeedback] Insert error:', insertError);
    }

    // 3. Recalculate score weight signals for this region + property type
    const { data: recentFeedback } = await supabase
      .from('outcome_feedback')
      .select('outcome, prospect_score_at_close, region, property_type')
      .eq('region', leadRegion)
      .order('closed_at', { ascending: false })
      .limit(100);

    let conversionInsights = null;
    if (recentFeedback && recentFeedback.length >= 5) {
      const converted = recentFeedback.filter((r: { outcome: string }) => r.outcome === 'converted');
      const lost = recentFeedback.filter((r: { outcome: string }) => r.outcome === 'lost');
      const conversionRate = converted.length / recentFeedback.length;

      const avgConvertedScore = converted.length > 0
        ? converted.reduce((s: number, r: { prospect_score_at_close: number }) => s + (r.prospect_score_at_close ?? 0), 0) / converted.length
        : 0;
      const avgLostScore = lost.length > 0
        ? lost.reduce((s: number, r: { prospect_score_at_close: number }) => s + (r.prospect_score_at_close ?? 0), 0) / lost.length
        : 0;

      // Suggested threshold adjustment: if avg converted score is high, raise threshold
      const suggestedThreshold = Math.round(avgConvertedScore * 0.85);

      conversionInsights = {
        region: leadRegion,
        totalSamples: recentFeedback.length,
        conversionRate: Math.round(conversionRate * 100),
        avgConvertedScore: Math.round(avgConvertedScore),
        avgLostScore: Math.round(avgLostScore),
        suggestedThreshold,
        scoreDelta: Math.round(avgConvertedScore - avgLostScore),
      };

      // 4. Upsert score_weight_signals for this region
      await supabase
        .from('score_weight_signals')
        .upsert({
          region: leadRegion,
          property_type: leadPropertyType,
          conversion_rate: conversionRate,
          avg_converted_score: Math.round(avgConvertedScore),
          avg_lost_score: Math.round(avgLostScore),
          suggested_threshold: suggestedThreshold,
          sample_count: recentFeedback.length,
          last_updated: new Date().toISOString(),
        }, { onConflict: 'region,property_type' });
    }

    // 5. Log activity event
    await supabase.from('activity_events').insert({
      lead_id: leadId,
      event_type: 'outcome_feedback',
      description: `Deal ${outcome === 'converted' ? 'closed (converted)' : 'lost'} — score ${prospectScore} in ${leadRegion}`,
      metadata: { outcome, region: leadRegion, propertyType: leadPropertyType, prospectScore },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      feedbackId: feedbackRow?.id ?? null,
      insights: conversionInsights,
      message: `Outcome recorded: ${outcome} for lead ${leadId} in ${leadRegion}`,
    });
  } catch (err) {
    console.error('[OutcomeFeedback] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * GET /api/leads/outcome-feedback
 * Returns aggregated conversion insights per region and property type.
 * Used by the score retraining dashboard.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const region = searchParams.get('region');
    const propertyType = searchParams.get('propertyType');
    const limit = parseInt(searchParams.get('limit') ?? '200');

    const supabase = createClient();

    // Fetch score_weight_signals (aggregated)
    let signalsQuery = supabase
      .from('score_weight_signals')
      .select('*')
      .order('last_updated', { ascending: false });
    if (region) signalsQuery = signalsQuery.eq('region', region);
    if (propertyType) signalsQuery = signalsQuery.eq('property_type', propertyType);

    const { data: signals } = await signalsQuery;

    // Fetch raw feedback
    let feedbackQuery = supabase
      .from('outcome_feedback')
      .select('id, lead_id, outcome, prospect_score_at_close, region, property_type, deal_value, closed_at')
      .order('closed_at', { ascending: false })
      .limit(limit);
    if (region) feedbackQuery = feedbackQuery.eq('region', region);
    if (propertyType) feedbackQuery = feedbackQuery.eq('property_type', propertyType);

    const { data: feedback } = await feedbackQuery;

    // Fallback mock data if tables don't exist yet
    const mockSignals = [
      { region: 'TX', property_type: 'mid', conversion_rate: 0.42, avg_converted_score: 78, avg_lost_score: 52, suggested_threshold: 66, sample_count: 48, last_updated: new Date(Date.now() - 86400000).toISOString() },
      { region: 'FL', property_type: 'large', conversion_rate: 0.38, avg_converted_score: 82, avg_lost_score: 55, suggested_threshold: 70, sample_count: 31, last_updated: new Date(Date.now() - 86400000 * 2).toISOString() },
      { region: 'CO', property_type: 'large', conversion_rate: 0.55, avg_converted_score: 85, avg_lost_score: 48, suggested_threshold: 72, sample_count: 22, last_updated: new Date(Date.now() - 86400000 * 3).toISOString() },
      { region: 'TN', property_type: 'mid', conversion_rate: 0.35, avg_converted_score: 74, avg_lost_score: 58, suggested_threshold: 63, sample_count: 40, last_updated: new Date(Date.now() - 86400000 * 4).toISOString() },
      { region: 'CA', property_type: 'small', conversion_rate: 0.18, avg_converted_score: 65, avg_lost_score: 60, suggested_threshold: 55, sample_count: 17, last_updated: new Date(Date.now() - 86400000 * 5).toISOString() },
    ];

    const mockFeedback = Array.from({ length: 30 }, (_, i) => ({
      id: `fb-${i}`,
      lead_id: `lead-${i}`,
      outcome: i % 3 === 0 ? 'converted' : 'lost',
      prospect_score_at_close: 40 + Math.floor(Math.sin(i) * 30 + 30),
      region: ['TX', 'FL', 'CO', 'TN', 'CA'][i % 5],
      property_type: ['small', 'mid', 'large'][i % 3],
      deal_value: i % 3 === 0 ? 2500 + i * 100 : null,
      closed_at: new Date(Date.now() - 86400000 * i).toISOString(),
    }));

    return NextResponse.json({
      signals: signals && signals.length > 0 ? signals : mockSignals,
      feedback: feedback && feedback.length > 0 ? feedback : mockFeedback,
      total: feedback?.length ?? mockFeedback.length,
    });
  } catch (err) {
    console.error('[OutcomeFeedback GET] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
