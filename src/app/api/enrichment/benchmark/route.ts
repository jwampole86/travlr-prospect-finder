import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/enrichment/benchmark
 * Run PropertyReach benchmark against existing manually verified leads.
 * CRITICAL: Does NOT modify canonical data. Read-only comparison mode.
 *
 * Uses existing manually verified owner/phone records as ground truth.
 * Hides known answer from matching decision, then compares.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { sampleSize = 100, runName, portfolioId } = body;

    // Fetch manually verified leads as benchmark sample
    // These have verified_owner=true AND verified_number=true AND contact_name AND contact_phone
    let query = supabase
      .from('leads')
      .select('id, address, city, state, zip, apn, contact_name, contact_phone, verified_owner, verified_number, verified_address, prospect_score, state')
      .eq('verified_owner', true)
      .eq('verified_number', true)
      .not('contact_name', 'is', null)
      .not('contact_phone', 'is', null)
      .eq('is_synthetic', false)
      .limit(Math.min(sampleSize, 200));

    if (portfolioId) query = query.eq('portfolio_id', portfolioId);

    const { data: sampleLeads, error: sampleError } = await query;
    if (sampleError) return NextResponse.json({ error: sampleError.message }, { status: 500 });
    if (!sampleLeads?.length) {
      return NextResponse.json({
        error: 'No manually verified leads found for benchmark sample. Verify some leads manually first.',
        sampleSize: 0,
      }, { status: 422 });
    }

    // Create benchmark run record
    const { data: benchmarkRun, error: runError } = await supabase
      .from('enrichment_benchmark_runs')
      .insert({
        run_name: runName || `Benchmark ${new Date().toLocaleDateString()} — ${sampleLeads.length} leads`,
        provider: 'PROPERTYREACH',
        status: 'RUNNING',
        sample_size: sampleLeads.length,
        created_by: user.id,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (runError || !benchmarkRun) {
      return NextResponse.json({ error: 'Failed to create benchmark run' }, { status: 500 });
    }

    // Run benchmark asynchronously — do NOT block response
    runBenchmarkAsync(benchmarkRun.id, sampleLeads, supabase).catch(err =>
      console.error('[Benchmark] Async runner error:', err)
    );

    return NextResponse.json({
      benchmarkRunId: benchmarkRun.id,
      sampleSize: sampleLeads.length,
      status: 'RUNNING',
      message: `Benchmark started with ${sampleLeads.length} manually verified leads. Results will appear in the Benchmark tab.`,
    });
  } catch (err) {
    console.error('[Benchmark] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/enrichment/benchmark
 * Returns benchmark run history and details.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const runId = searchParams.get('runId');

    if (runId) {
      const [runRes, detailsRes] = await Promise.all([
        supabase.from('enrichment_benchmark_runs').select('*').eq('id', runId).single(),
        supabase.from('enrichment_benchmark_details').select('*').eq('run_id', runId).order('created_at', { ascending: false }).limit(200),
      ]);

      return NextResponse.json({
        run: runRes.data,
        details: detailsRes.data || [],
      });
    }

    const { data: runs } = await supabase
      .from('enrichment_benchmark_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({ runs: runs || [] });
  } catch (err) {
    console.error('[Benchmark] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── Async benchmark runner ───────────────────────────────────────────────────

async function runBenchmarkAsync(
  runId: string,
  sampleLeads: Array<{
    id: string; address: string; city: string; state: string; zip: string;
    apn?: string; contact_name?: string; contact_phone?: string;
    prospect_score?: number;
  }>,
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const apiKey = process.env.PROPERTYREACH_API_KEY;
  const isConfigured = apiKey && apiKey !== 'your-propertyreach-api-key-here' && apiKey.trim() !== '';

  const details: Array<{
    run_id: string;
    lead_id: string;
    manual_owner_name: string;
    manual_phone_e164: string;
    manual_address: string;
    pr_owner_name: string | null;
    pr_phone_e164: string | null;
    pr_property_id: string | null;
    pr_confidence_score: number | null;
    pr_match_decision: string;
    owner_match: string;
    phone_match: string;
    confusion_class: string;
    property_state: string;
    cost_cents: number;
    response_ms: number;
  }> = [];

  let ownerExactMatch = 0;
  let ownerAcceptable = 0;
  let wrongOwner = 0;
  let noOwnerResult = 0;
  let phoneExactMatch = 0;
  let wrongPhone = 0;
  let noPhoneResult = 0;
  let reviewRequired = 0;
  let trueMatch = 0;
  let falseMatch = 0;
  let noMatchCount = 0;
  let totalCostCents = 0;
  let totalResponseMs = 0;
  let propertiesMatched = 0;

  for (const lead of sampleLeads) {
    const startMs = Date.now();
    let prOwnerName: string | null = null;
    let prPhoneE164: string | null = null;
    let prPropertyId: string | null = null;
    let prConfidence: number | null = null;
    let prDecision = 'NO_RESULT';
    let costCents = 0;

    if (isConfigured) {
      try {
        // Call PropertyReach in benchmark mode — hide known answer
        const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/enrichment/propertyreach`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leadId: lead.id,
            address: lead.address,
            city: lead.city,
            state: lead.state,
            zip: lead.zip,
            apn: lead.apn,
            benchmarkMode: true, // Flag: do NOT write canonical data
          }),
        });

        if (res.ok) {
          const data = await res.json();
          prOwnerName = data.ownerName || null;
          prPhoneE164 = data.phoneE164 || null;
          prPropertyId = data.propertyReachId || null;
          prConfidence = data.confidenceScore || null;
          prDecision = data.decision || 'NO_RESULT';
          costCents = data.costCents || 0;
          if (data.propertyMatched) propertiesMatched++;
        }
      } catch {
        prDecision = 'PROVIDER_ERROR';
      }
    } else {
      // Simulate benchmark with NO_RESULT when API not configured
      prDecision = 'NOT_CONFIGURED';
    }

    const responseMs = Date.now() - startMs;
    totalResponseMs += responseMs;
    totalCostCents += costCents;

    // Compare results to known manual data
    const manualOwner = lead.contact_name || '';
    const manualPhone = normalizePhone(lead.contact_phone || '');

    let ownerMatch = 'NO_RESULT';
    let phoneMatch = 'NO_RESULT';
    let confusionClass = 'NO_MATCH';

    if (prOwnerName) {
      const ownerSimilarity = compareNames(manualOwner, prOwnerName);
      if (ownerSimilarity >= 0.95) {
        ownerMatch = 'EXACT_MATCH';
        ownerExactMatch++;
        ownerAcceptable++;
      } else if (ownerSimilarity >= 0.7) {
        ownerMatch = 'ACCEPTABLE_MATCH';
        ownerAcceptable++;
      } else {
        ownerMatch = 'WRONG_OWNER';
        wrongOwner++;
      }
    } else {
      noOwnerResult++;
    }

    if (prPhoneE164) {
      const normalizedPr = normalizePhone(prPhoneE164);
      if (normalizedPr === manualPhone) {
        phoneMatch = 'EXACT_MATCH';
        phoneExactMatch++;
      } else {
        phoneMatch = 'WRONG_PHONE';
        wrongPhone++;
      }
    } else {
      noPhoneResult++;
    }

    // Confusion matrix classification
    if (ownerMatch === 'EXACT_MATCH' && phoneMatch === 'EXACT_MATCH') {
      confusionClass = 'TRUE_MATCH';
      trueMatch++;
    } else if (ownerMatch === 'WRONG_OWNER' || phoneMatch === 'WRONG_PHONE') {
      confusionClass = 'FALSE_MATCH';
      falseMatch++;
    } else if (ownerMatch === 'NO_RESULT' && phoneMatch === 'NO_RESULT') {
      confusionClass = 'NO_MATCH';
      noMatchCount++;
    } else if (ownerMatch === 'ACCEPTABLE_MATCH') {
      confusionClass = 'TRUE_MATCH';
      trueMatch++;
    } else {
      confusionClass = 'AMBIGUOUS';
    }

    if (prDecision === 'REVIEW_REQUIRED') reviewRequired++;

    details.push({
      run_id: runId,
      lead_id: lead.id,
      manual_owner_name: manualOwner,
      manual_phone_e164: manualPhone,
      manual_address: `${lead.address}, ${lead.city}, ${lead.state} ${lead.zip}`,
      pr_owner_name: prOwnerName,
      pr_phone_e164: prPhoneE164,
      pr_property_id: prPropertyId,
      pr_confidence_score: prConfidence,
      pr_match_decision: prDecision,
      owner_match: ownerMatch,
      phone_match: phoneMatch,
      confusion_class: confusionClass,
      property_state: lead.state,
      cost_cents: costCents,
      response_ms: responseMs,
    });
  }

  const total = sampleLeads.length;
  const pct = (n: number) => total > 0 ? parseFloat(((n / total) * 100).toFixed(2)) : 0;

  // Insert detail records
  if (details.length > 0) {
    await supabase.from('enrichment_benchmark_details').insert(details);
  }

  // Update benchmark run with final metrics
  await supabase.from('enrichment_benchmark_runs').update({
    status: 'COMPLETED',
    properties_tested: total,
    property_match_count: propertiesMatched,
    property_match_pct: pct(propertiesMatched),
    owner_exact_match_count: ownerExactMatch,
    owner_exact_match_pct: pct(ownerExactMatch),
    owner_acceptable_count: ownerAcceptable,
    owner_acceptable_pct: pct(ownerAcceptable),
    wrong_owner_count: wrongOwner,
    wrong_owner_pct: pct(wrongOwner),
    no_owner_result_count: noOwnerResult,
    no_owner_result_pct: pct(noOwnerResult),
    phone_exact_match_count: phoneExactMatch,
    phone_exact_match_pct: pct(phoneExactMatch),
    wrong_phone_count: wrongPhone,
    wrong_phone_pct: pct(wrongPhone),
    no_phone_result_count: noPhoneResult,
    no_phone_result_pct: pct(noPhoneResult),
    review_required_count: reviewRequired,
    review_required_pct: pct(reviewRequired),
    true_match_count: trueMatch,
    false_match_count: falseMatch,
    no_match_count: noMatchCount,
    total_cost_cents: totalCostCents,
    avg_cost_per_property_cents: total > 0 ? Math.round(totalCostCents / total) : 0,
    avg_response_ms: total > 0 ? Math.round(totalResponseMs / total) : 0,
    completed_at: new Date().toISOString(),
  }).eq('id', runId);
}

function normalizePhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits;
}

function compareNames(a: string, b: string): number {
  if (!a || !b) return 0;
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, '').trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  // Simple token overlap
  const tokensA = new Set(na.split(/\s+/));
  const tokensB = new Set(nb.split(/\s+/));
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}
