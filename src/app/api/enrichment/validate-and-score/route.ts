import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

// ─── Validate + Score + Rules Engine Check ───────────────────────────────────
// Calls the Anthropic validation endpoint, stores confidence scores in
// lead_enrichments, then runs the ops rules engine to flag violations.
// Results are memoized in enrichment_validation_cache for 7 days by fingerprint.

function buildFingerprint(lead: Record<string, unknown>): string {
  const addr = String(lead.address || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const city = String(lead.city || '')
    .toLowerCase()
    .trim();
  const state = String(lead.state || '')
    .toLowerCase()
    .trim();
  return `${addr}|${city}|${state}`;
}

function hasServiceRole() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return !!key && !/your-|placeholder|changeme|example/i.test(key);
}

async function getValidationDb() {
  if (hasServiceRole()) {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }

  return createServerClient();
}

function throwIfError(error: { message: string } | null, label: string) {
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
}

async function fetchValidation(baseUrl: string, payload: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/api/ai/validate-enrichment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (data as { error?: string; details?: string }).details ||
        (data as { error?: string }).error ||
        'Validation request failed'
    );
  }

  if (!(data as { result?: unknown }).result) {
    throw new Error('Validation response did not include a result payload');
  }

  return data as { result: any };
}

export async function POST(req: NextRequest) {
  try {
    const { leadId, skipCache } = await req.json();
    if (!leadId) {
      return NextResponse.json({ error: 'leadId required' }, { status: 400 });
    }

    const supabase = await getValidationDb();
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;

    // ── 1. Fetch lead + enrichment data ──────────────────────────────────────
    const [leadResult, enrichmentResult] = await Promise.all([
      supabase
        .from('leads')
        .select(
          'id, address, city, state, source, prospect_score, listing_price, estimated_value, last_sale_price, last_sale_date, days_on_market'
        )
        .eq('id', leadId)
        .single(),
      supabase.from('lead_enrichments').select('*').eq('lead_id', leadId).single(),
    ]);

    const lead = leadResult.data;
    const enrichment = enrichmentResult.data;

    throwIfError(leadResult.error, 'Failed to load lead');
    if (enrichmentResult.error && enrichmentResult.error.code !== 'PGRST116') {
      throwIfError(enrichmentResult.error, 'Failed to load enrichment');
    }

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const fingerprint = buildFingerprint(lead as Record<string, unknown>);

    // ── 2. Check 7-day memoization cache ─────────────────────────────────────
    if (!skipCache) {
      const { data: cached, error: cacheReadError } = await supabase
        .from('enrichment_validation_cache')
        .select('*')
        .eq('lead_fingerprint', fingerprint)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (cacheReadError && cacheReadError.code !== 'PGRST116') {
        throwIfError(cacheReadError, 'Failed to read validation cache');
      }

      if (cached) {
        // Log cache hit event
        const { error: cacheEventError } = await supabase
          .from('enrichment_validation_events')
          .insert({
            lead_id: leadId,
            lead_fingerprint: fingerprint,
            source: lead.source || 'Unknown',
            validation_type: 'combined',
            passed: (cached.overall_confidence ?? 0) >= 60,
            overall_confidence: cached.overall_confidence,
            ownership_confidence: cached.ownership_confidence,
            market_comp_confidence: cached.market_comp_confidence,
            field_confidence_scores: cached.field_confidence_scores,
            anomalies: cached.validation_anomalies,
            recommendation: cached.validation_recommendation,
            cache_hit: true,
            triggered_by: 'api_call',
          });
        throwIfError(cacheEventError, 'Failed to log cached validation event');

        return NextResponse.json({
          success: true,
          leadId,
          ownershipConfidence: cached.ownership_confidence,
          marketCompConfidence: cached.market_comp_confidence,
          overallConfidence: cached.overall_confidence,
          recommendation: cached.validation_recommendation,
          anomalies: cached.validation_anomalies ?? [],
          violationsCount: 0,
          violations: [],
          cacheHit: true,
          cachedAt: cached.validated_at,
          expiresAt: cached.expires_at,
        });
      }
    }

    // ── 3. Run Anthropic validation in parallel ───────────────────────────────
    const [ownershipRes, marketCompRes] = await Promise.allSettled([
      fetchValidation(baseUrl, {
        type: 'ownership',
        data: {
          leadId,
          address: lead.address || '',
          city: lead.city || '',
          state: lead.state || '',
          ownerName: enrichment?.owner_name,
          ownershipType: enrichment?.ownership_type,
          ownerMailingAddress: enrichment?.owner_mailing_address,
          ownerMailingCity: enrichment?.owner_mailing_city,
          ownerMailingState: enrichment?.owner_mailing_state,
        },
      }),
      fetchValidation(baseUrl, {
        type: 'market_comp',
        data: {
          leadId,
          address: lead.address || '',
          city: lead.city || '',
          state: lead.state || '',
          listingPrice: (lead as any).listing_price,
          estimatedValue: (lead as any).estimated_value,
          lastSalePrice: (lead as any).last_sale_price,
          lastSaleDate: (lead as any).last_sale_date,
          daysOnMarket: (lead as any).days_on_market,
          source: lead.source,
          enrichedAt: enrichment?.last_enriched_at,
        },
      }),
    ]);

    const ownershipResult =
      ownershipRes.status === 'fulfilled' && ownershipRes.value?.result
        ? ownershipRes.value.result
        : null;
    const marketCompResult =
      marketCompRes.status === 'fulfilled' && marketCompRes.value?.result
        ? marketCompRes.value.result
        : null;

    if (!ownershipResult && !marketCompResult) {
      const ownershipError = ownershipRes.status === 'rejected' ? ownershipRes.reason : null;
      const marketError = marketCompRes.status === 'rejected' ? marketCompRes.reason : null;
      throw new Error(
        `Ownership validation failed: ${ownershipError instanceof Error ? ownershipError.message : 'no result'}; ` +
          `Market validation failed: ${marketError instanceof Error ? marketError.message : 'no result'}`
      );
    }

    const ownershipConfidence = ownershipResult?.overallConfidence ?? null;
    const marketCompConfidence = marketCompResult?.overallConfidence ?? null;
    const overallConfidence =
      ownershipConfidence !== null && marketCompConfidence !== null
        ? Math.round((ownershipConfidence + marketCompConfidence) / 2)
        : (ownershipConfidence ?? marketCompConfidence ?? null);

    const allAnomalies = [
      ...(ownershipResult?.anomalies ?? []),
      ...(marketCompResult?.anomalies ?? []),
    ];

    const recommendation =
      ownershipResult?.recommendation === 'reject' || marketCompResult?.recommendation === 'reject'
        ? 'reject'
        : ownershipResult?.recommendation === 'review' ||
            marketCompResult?.recommendation === 'review'
          ? 'review'
          : 'accept';

    const fieldScores = [
      ...(ownershipResult?.fieldScores ?? []),
      ...(marketCompResult?.fieldScores ?? []),
    ];

    // ── 4. Persist confidence scores to lead_enrichments ─────────────────────
    if (enrichment) {
      const { error: enrichmentUpdateError } = await supabase
        .from('lead_enrichments')
        .update({
          ownership_confidence: ownershipConfidence,
          market_comp_confidence: marketCompConfidence,
          overall_confidence: overallConfidence,
          field_confidence_scores: fieldScores,
          validation_anomalies: allAnomalies.length > 0 ? allAnomalies : null,
          validation_recommendation: recommendation,
          validated_at: new Date().toISOString(),
        })
        .eq('lead_id', leadId);
      throwIfError(enrichmentUpdateError, 'Failed to update enrichment validation scores');
    }

    // ── 5. Store in 7-day memoization cache ───────────────────────────────────
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error: cacheWriteError } = await supabase.from('enrichment_validation_cache').upsert(
      {
        lead_fingerprint: fingerprint,
        lead_id: leadId,
        ownership_confidence: ownershipConfidence,
        market_comp_confidence: marketCompConfidence,
        overall_confidence: overallConfidence,
        field_confidence_scores: fieldScores,
        validation_anomalies: allAnomalies.length > 0 ? allAnomalies : null,
        validation_recommendation: recommendation,
        ownership_field_scores: ownershipResult?.fieldScores ?? null,
        market_comp_field_scores: marketCompResult?.fieldScores ?? null,
        source: lead.source || null,
        validated_at: now.toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: 'lead_fingerprint' }
    );
    throwIfError(cacheWriteError, 'Failed to persist validation cache');

    // ── 6. Log validation event ───────────────────────────────────────────────
    const { error: eventError } = await supabase.from('enrichment_validation_events').insert({
      lead_id: leadId,
      lead_fingerprint: fingerprint,
      source: lead.source || 'Unknown',
      validation_type: 'combined',
      passed: (overallConfidence ?? 0) >= 60,
      overall_confidence: overallConfidence,
      ownership_confidence: ownershipConfidence,
      market_comp_confidence: marketCompConfidence,
      field_confidence_scores: fieldScores,
      anomalies: allAnomalies.length > 0 ? allAnomalies : null,
      recommendation,
      cache_hit: false,
      triggered_by: 'api_call',
    });
    throwIfError(eventError, 'Failed to log validation event');

    // ── 7. Run rules engine ───────────────────────────────────────────────────
    const { data: rules, error: rulesError } = await supabase
      .from('enrichment_confidence_rules')
      .select('*')
      .eq('enabled', true);
    throwIfError(rulesError, 'Failed to load enabled rules');

    const violations: Array<{
      lead_id: string;
      rule_id: string;
      rule_name: string;
      rule_type: string;
      threshold_value: number;
      actual_value: number | null;
      action_taken: string;
      severity: string;
    }> = [];

    const violationRuleNames: string[] = [];

    for (const rule of rules ?? []) {
      let actualValue: number | null = null;
      let fired = false;

      switch (rule.rule_type) {
        case 'ownership_min_confidence':
          actualValue = ownershipConfidence;
          fired = actualValue !== null && actualValue < rule.threshold_value;
          break;
        case 'market_comp_freshness_days': {
          if (enrichment?.last_enriched_at) {
            const daysSince = Math.floor(
              (Date.now() - new Date(enrichment.last_enriched_at).getTime()) / 86400000
            );
            actualValue = daysSince;
            fired = daysSince > rule.threshold_value;
          }
          break;
        }
        case 'price_anomaly_pct': {
          const listing = (lead as any).listing_price;
          const estimated = (lead as any).estimated_value;
          if (listing && estimated && estimated > 0) {
            const pct = Math.abs((listing - estimated) / estimated) * 100;
            actualValue = Math.round(pct);
            fired = pct > rule.threshold_value;
          }
          break;
        }
        case 'overall_min_confidence':
          actualValue = overallConfidence;
          fired = actualValue !== null && actualValue < rule.threshold_value;
          break;
        case 'field_min_confidence': {
          if (rule.target_field) {
            const fieldScore = fieldScores.find((f: any) => f.field === rule.target_field);
            if (fieldScore) {
              actualValue = fieldScore.confidence;
              fired = (actualValue ?? 0) < rule.threshold_value;
            }
          }
          break;
        }
      }

      if (fired) {
        violations.push({
          lead_id: leadId,
          rule_id: rule.id,
          rule_name: rule.rule_name,
          rule_type: rule.rule_type,
          threshold_value: rule.threshold_value,
          actual_value: actualValue,
          action_taken: rule.action,
          severity: rule.severity,
        });
        violationRuleNames.push(rule.rule_name);
      }
    }

    // Insert violations
    if (violations.length > 0) {
      const { error: violationsError } = await supabase
        .from('rules_engine_violations')
        .insert(violations);
      throwIfError(violationsError, 'Failed to persist rules engine violations');

      // Update enrichment with violation flags
      if (enrichment) {
        const { error: enrichmentViolationError } = await supabase
          .from('lead_enrichments')
          .update({ rules_violations: violationRuleNames })
          .eq('lead_id', leadId);
        throwIfError(enrichmentViolationError, 'Failed to update enrichment rule violations');
      }

      // Insert a sync_regression_event for rules violations
      if (recommendation !== 'accept') {
        const { error: regressionError } = await supabase.from('sync_regression_events').insert({
          lead_id: leadId,
          source: lead.source || 'Unknown',
          regression_type: 'low_quality',
          address: lead.address || '',
          city: lead.city || '',
          state: lead.state || '',
          score: lead.prospect_score || 0,
          status: 'open',
          notes: `Rules engine: ${violationRuleNames.join(', ')}`,
          confidence_score: overallConfidence,
          rules_violations: violationRuleNames,
          validation_recommendation: recommendation,
        });
        throwIfError(regressionError, 'Failed to persist sync regression event');
      }
    }

    return NextResponse.json({
      success: true,
      leadId,
      ownershipConfidence,
      marketCompConfidence,
      overallConfidence,
      recommendation,
      anomalies: allAnomalies,
      violationsCount: violations.length,
      violations: violations.map((v) => ({
        rule: v.rule_name,
        severity: v.severity,
        actual: v.actual_value,
        threshold: v.threshold_value,
      })),
      cacheHit: false,
      expiresAt,
    });
  } catch (err) {
    console.error('[validate-and-score]', err);
    return NextResponse.json(
      { error: 'Validation failed', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
