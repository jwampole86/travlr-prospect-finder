import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeAddress } from '@/lib/services/ownerEnrichmentService';
import {
  runPropertyReachEnrichment,
  scorePropertyReachMatch,
  getProviderHealth,
  PropertyReachOwnerCandidate,
  PropertyReachPhoneCandidate,
} from '@/lib/services/propertyReachProvider';

/**
 * POST /api/enrichment/propertyreach
 *
 * Starts a PropertyReach enrichment job for an existing canonical TRAVLR property.
 * The property ID is the anchor — enrichment never attaches based on name alone.
 *
 * Body: { leadId, address, city, state, zip, apn?, forceRefresh? }
 *
 * SECURITY: PROPERTYREACH_API_KEY is read server-side only.
 * This route is the ONLY path from browser to PropertyReach.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const {
      leadId,
      address,
      city,
      state,
      zip,
      apn,
      forceRefresh = false,
    } = body;

    if (!leadId || !address || !city || !state || !zip) {
      return NextResponse.json(
        { error: 'leadId, address, city, state, zip are required' },
        { status: 400 }
      );
    }

    // Load canonical lead — property is always the anchor
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, address, city, state, zip, apn, contact_name, contact_phone, verified_owner, verified_number, property_reach_id, property_reach_match_status')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    // Check for existing pending/running job (prevent duplicates)
    if (!forceRefresh) {
      const { data: existingJob } = await supabase
        .from('propertyreach_enrichment_jobs')
        .select('id, job_status, created_at')
        .eq('lead_id', leadId)
        .in('job_status', ['PENDING', 'RUNNING'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (existingJob) {
        return NextResponse.json({
          jobId: existingJob.id,
          status: existingJob.job_status,
          message: 'Enrichment job already in progress',
        });
      }
    }

    // Normalize address before any lookup
    const normalized = normalizeAddress(address, city, state, zip);

    if (!normalized.isComplete) {
      return NextResponse.json(
        { error: 'Address is incomplete — cannot run enrichment', normalized },
        { status: 422 }
      );
    }

    // Create job record
    const { data: job, error: jobError } = await supabase
      .from('propertyreach_enrichment_jobs')
      .insert({
        lead_id: leadId,
        raw_address: normalized.rawAddress,
        normalized_address: normalized.normalizedAddress,
        standardized_address: normalized.standardizedAddress,
        city: normalized.city,
        state: normalized.state,
        zip: normalized.zip,
        input_apn: apn || lead.apn || null,
        job_status: 'PENDING',
      })
      .select()
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Failed to create enrichment job' }, { status: 500 });
    }

    // Audit: enrichment started
    await supabase.from('propertyreach_audit_events').insert({
      lead_id: leadId,
      job_id: job.id,
      event_type: 'ENRICHMENT_STARTED',
      event_data: {
        address: normalized.normalizedAddress,
        forceRefresh,
        existingPropertyReachId: lead.property_reach_id || null,
      },
    });

    // Run enrichment asynchronously — do NOT block the response
    runPropertyReachJob(
      job.id,
      leadId,
      normalized,
      apn || lead.apn,
      lead.contact_name,
      lead.contact_phone,
      lead.verified_owner,
      lead.verified_number,
      supabase
    ).catch(err => console.error('[PropertyReach] Job runner error:', err));

    return NextResponse.json({
      jobId: job.id,
      status: 'PENDING',
      message: 'PropertyReach enrichment job queued — results will appear shortly',
    });
  } catch (err) {
    console.error('[PropertyReach] POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/enrichment/propertyreach?leadId=xxx
 * Returns current PropertyReach enrichment status and results.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get('leadId');
    const checkHealth = searchParams.get('health') === 'true';

    if (checkHealth) {
      const health = await getProviderHealth();
      return NextResponse.json({ health });
    }

    if (!leadId) {
      return NextResponse.json({ error: 'leadId required' }, { status: 400 });
    }

    const [jobsRes, matchesRes, auditRes, leadRes] = await Promise.all([
      supabase
        .from('propertyreach_enrichment_jobs')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('propertyreach_property_matches')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('propertyreach_audit_events')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('leads')
        .select('property_reach_id, property_reach_apn, property_reach_match_status, property_reach_last_enriched_at, verified_owner, verified_number, verified_address')
        .eq('id', leadId)
        .single(),
    ]);

    return NextResponse.json({
      jobs: jobsRes.data || [],
      matches: matchesRes.data || [],
      auditEvents: auditRes.data || [],
      leadEnrichmentState: leadRes.data || null,
    });
  } catch (err) {
    console.error('[PropertyReach] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── Async job runner ─────────────────────────────────────────────────────────

async function runPropertyReachJob(
  jobId: string,
  leadId: string,
  normalized: ReturnType<typeof normalizeAddress>,
  apn: string | undefined,
  existingManualOwner: string | undefined,
  existingManualPhone: string | undefined,
  existingVerifiedOwner: boolean | undefined,
  existingVerifiedNumber: boolean | undefined,
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  try {
    // Mark running
    await supabase
      .from('propertyreach_enrichment_jobs')
      .update({ job_status: 'RUNNING', started_at: new Date().toISOString() })
      .eq('id', jobId);

    // Run full PropertyReach pipeline
    const result = await runPropertyReachEnrichment({
      leadId,
      address: normalized.normalizedAddress,
      city: normalized.city,
      state: normalized.state,
      zip: normalized.zip,
      apn,
      existingManualOwner,
      existingManualPhone,
    });

    // Update job with property match result
    await supabase
      .from('propertyreach_enrichment_jobs')
      .update({
        property_match_status: result.propertyMatchStatus,
        property_reach_id: result.property?.propertyReachId || null,
        resolved_apn: result.property?.apn || null,
        resolved_fips: result.property?.fips || null,
        resolved_parcel_id: result.property?.parcelId || null,
        property_address_verified: result.propertyMatchStatus === 'PROPERTY_MATCHED',
        raw_property_response: result.rawPropertyResponse || null,
        raw_owner_response: result.rawOwnerResponse || null,
        raw_contact_response: result.rawContactResponse || null,
      })
      .eq('id', jobId);

    // Only proceed to owner/contact if property matched
    if (result.propertyMatchStatus !== 'PROPERTY_MATCHED' || !result.property) {
      const finalStatus =
        result.propertyMatchStatus === 'PROPERTY_NOT_FOUND' ?'NO_MATCH'
          : result.propertyMatchStatus === 'PROVIDER_ERROR' ?'FAILED' :'NO_MATCH';

      await supabase
        .from('propertyreach_enrichment_jobs')
        .update({ job_status: finalStatus, completed_at: new Date().toISOString() })
        .eq('id', jobId);

      await supabase.from('propertyreach_audit_events').insert({
        lead_id: leadId,
        job_id: jobId,
        event_type: 'PROPERTY_NOT_FOUND',
        event_data: { status: result.propertyMatchStatus },
      });

      return;
    }

    // Store PropertyReach property ID on the lead
    await supabase
      .from('leads')
      .update({
        property_reach_id: result.property.propertyReachId,
        property_reach_apn: result.property.apn || null,
        property_reach_fips: result.property.fips || null,
        property_reach_parcel_id: result.property.parcelId || null,
        property_reach_matched_at: new Date().toISOString(),
        property_reach_match_status: 'PROPERTY_MATCHED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    await supabase.from('propertyreach_audit_events').insert({
      lead_id: leadId,
      job_id: jobId,
      event_type: 'PROPERTY_MATCHED',
      event_data: {
        propertyReachId: result.property.propertyReachId,
        apn: result.property.apn,
        ownerOfRecord: result.property.ownerOfRecord,
      },
    });

    // Score each owner candidate
    let bestOwner: PropertyReachOwnerCandidate | undefined;
    let bestScore = 0;
    let bestMatchResult: ReturnType<typeof scorePropertyReachMatch> | undefined;

    for (const owner of result.ownerCandidates) {
      const matchResult = scorePropertyReachMatch(
        result.property,
        owner,
        normalized.normalizedAddress,
        normalized.city,
        normalized.state,
        existingManualOwner
      );

      if (matchResult.totalScore > bestScore) {
        bestScore = matchResult.totalScore;
        bestOwner = owner;
        bestMatchResult = matchResult;
      }
    }

    // Determine thresholds from config
    const { data: thresholds } = await supabase
      .from('enrichment_threshold_config')
      .select('config_key, config_value');

    const thresholdMap: Record<string, number> = {};
    (thresholds || []).forEach((t: { config_key: string; config_value: number }) => {
      thresholdMap[t.config_key] = t.config_value;
    });

    const autoAcceptThreshold = thresholdMap['AUTO_ACCEPT_THRESHOLD'] ?? 85;
    const reviewThreshold = thresholdMap['REVIEW_REQUIRED_THRESHOLD'] ?? 65;

    // Build match record
    let matchDecision = 'PENDING';
    let autoAccepted = false;
    let requiresReview = false;

    if (bestMatchResult) {
      if (bestMatchResult.confidence === 'CONFLICT') {
        matchDecision = 'CONFLICT';
        requiresReview = true;
      } else if (bestScore >= autoAcceptThreshold && bestMatchResult.autoAccept) {
        // Auto-accept requires property + owner + phone multi-signal
        // Do NOT auto-accept if manual research exists with different owner
        const hasManualConflict = existingVerifiedOwner && existingManualOwner &&
          bestOwner?.fullName.toLowerCase().trim() !== existingManualOwner.toLowerCase().trim();

        if (hasManualConflict) {
          matchDecision = 'CONFLICT';
          requiresReview = true;
        } else {
          matchDecision = 'AUTO_ACCEPTED';
          autoAccepted = true;
        }
      } else if (bestScore >= reviewThreshold) {
        matchDecision = 'REVIEW_REQUIRED';
        requiresReview = true;
      } else {
        matchDecision = 'PENDING';
      }
    }

    // Store match record
    const { data: matchRecord } = await supabase
      .from('propertyreach_property_matches')
      .insert({
        lead_id: leadId,
        job_id: jobId,
        property_reach_id: result.property.propertyReachId,
        apn: result.property.apn || null,
        fips: result.property.fips || null,
        parcel_id: result.property.parcelId || null,
        provider_property_id: result.property.providerPropertyId || null,
        canonical_address: normalized.normalizedAddress,
        provider_address: result.property.address,
        address_match_score: bestMatchResult ? 90 : 0,
        address_match_exact: result.propertyMatchStatus === 'PROPERTY_MATCHED',
        owner_candidates: result.ownerCandidates,
        best_owner_name: bestOwner?.fullName || null,
        best_owner_type: bestOwner?.ownerType || null,
        legal_owner_name: bestOwner?.legalOwnerName || null,
        associated_contact_name: bestOwner?.associatedContactName || null,
        owner_mailing_address: bestOwner?.mailingAddress || null,
        phone_candidates: result.phoneCandidates,
        primary_phone_e164: result.phoneCandidates[0]?.phoneE164 || null,
        primary_phone_type: result.phoneCandidates[0]?.phoneType || null,
        email_candidates: result.emailCandidates,
        primary_email: result.emailCandidates[0]?.email || null,
        match_confidence_score: bestScore,
        match_confidence_label: bestMatchResult?.confidence || 'NO_MATCH',
        match_signals: bestMatchResult?.signals || [],
        match_reasons: bestMatchResult?.matchReasons || [],
        match_decision: matchDecision,
        auto_accepted: autoAccepted,
        evidence_tier: bestScore >= autoAcceptThreshold ? 'HIGH_CONFIDENCE_PROVIDER' : 'MEDIUM_CONFIDENCE_PROVIDER',
        provider_name: 'PROPERTYREACH',
        provider_retrieved_at: new Date().toISOString(),
        raw_evidence: {
          property: result.rawPropertyResponse,
          owner: result.rawOwnerResponse,
          contact: result.rawContactResponse,
        },
      })
      .select()
      .single();

    // Update job counts
    await supabase
      .from('propertyreach_enrichment_jobs')
      .update({
        owner_resolution_done: result.ownerCandidates.length > 0,
        owner_candidates_count: result.ownerCandidates.length,
        contact_enrichment_done: result.phoneCandidates.length > 0 || result.emailCandidates.length > 0,
        phones_found: result.phoneCandidates.length,
        emails_found: result.emailCandidates.length,
        match_confidence_score: bestScore,
        match_confidence_label: bestMatchResult?.confidence || 'NO_MATCH',
        auto_accepted: autoAccepted,
        requires_review: requiresReview,
      })
      .eq('id', jobId);

    // If auto-accepted: update canonical record
    if (autoAccepted && bestOwner && matchRecord) {
      await applyAcceptedEnrichment(
        leadId,
        jobId,
        matchRecord.id,
        bestOwner,
        result.phoneCandidates,
        result.emailCandidates,
        existingVerifiedOwner,
        existingVerifiedNumber,
        supabase
      );
    }

    // If review required: add to review queue
    if (requiresReview && matchRecord) {
      await supabase.from('enrichment_review_queue').insert({
        lead_id: leadId,
        job_id: jobId,
        suggested_owner_name: bestOwner?.fullName || null,
        confidence: bestMatchResult?.confidence || 'NO_MATCH',
        match_score: bestScore,
        evidence: { signals: bestMatchResult?.signals || [], matchRecord: matchRecord.id },
        provider: 'PROPERTYREACH',
        reason: matchDecision === 'CONFLICT' ?'Owner conflict with existing manual research' :'Medium confidence — requires human review',
        review_status: 'PENDING',
      });

      await supabase.from('propertyreach_audit_events').insert({
        lead_id: leadId,
        job_id: jobId,
        match_id: matchRecord.id,
        event_type: 'REVIEW_QUEUED',
        event_data: { reason: matchDecision, score: bestScore },
      });
    }

    // Finalize job
    const finalJobStatus = autoAccepted
      ? 'CONTACT_ENRICHED'
      : requiresReview
      ? 'REVIEW_REQUIRED'
      : result.ownerCandidates.length > 0
      ? 'OWNER_RESOLVED' :'NO_MATCH';

    await supabase
      .from('propertyreach_enrichment_jobs')
      .update({
        job_status: finalJobStatus,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    // Update lead's last enriched timestamp
    await supabase
      .from('leads')
      .update({
        property_reach_last_enriched_at: new Date().toISOString(),
        property_reach_enrichment_version: supabase.rpc ? undefined : undefined, // incremented via DB
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

  } catch (err) {
    console.error('[PropertyReach] Job runner error:', err);
    await supabase
      .from('propertyreach_enrichment_jobs')
      .update({
        job_status: 'FAILED',
        error_message: err instanceof Error ? err.message : 'Unknown error',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    await supabase.from('propertyreach_audit_events').insert({
      lead_id: leadId,
      job_id: jobId,
      event_type: 'PROVIDER_ERROR',
      event_data: { error: err instanceof Error ? err.message : 'Unknown error' },
    });
  }
}

// ─── Apply accepted enrichment to canonical records ───────────────────────────

async function applyAcceptedEnrichment(
  leadId: string,
  jobId: string,
  matchId: string,
  owner: PropertyReachOwnerCandidate,
  phones: PropertyReachPhoneCandidate[],
  emails: { email: string; emailStatus: string; emailConfidence: number }[],
  existingVerifiedOwner: boolean | undefined,
  existingVerifiedNumber: boolean | undefined,
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const now = new Date().toISOString();

  // EVIDENCE PRECEDENCE: Never overwrite ADMIN_CONFIRMED or MANUAL_VERIFIED
  // with a lower-confidence automated result
  const { data: lead } = await supabase
    .from('leads')
    .select('contact_name, contact_phone, verified_owner, verified_number, admin_override_fields')
    .eq('id', leadId)
    .single();

  const isManuallyVerifiedOwner =
    lead?.verified_owner &&
    (lead?.admin_override_fields as Record<string, boolean>)?.contact_name === true;

  const isManuallyVerifiedPhone =
    lead?.verified_number &&
    (lead?.admin_override_fields as Record<string, boolean>)?.contact_phone === true;

  const updates: Record<string, unknown> = { updated_at: now };

  // Update owner only if not manually verified
  if (!isManuallyVerifiedOwner && owner.fullName) {
    updates.contact_name = owner.fullName;
    updates.verified_owner = true;
    updates.owner_verification_source = 'PROPERTYREACH';
    updates.owner_verification_method = 'AUTOMATED_MULTI_SIGNAL';
    updates.owner_verified_at = now;
  }

  // Update phone — pick highest-confidence phone, never overwrite manual
  const bestPhone = phones.find(p => p.confidence >= 70);
  if (bestPhone && !isManuallyVerifiedPhone) {
    updates.contact_phone = bestPhone.phoneE164;
    updates.verified_number = bestPhone.confidence >= 80;
    updates.phone_verification_source = 'PROPERTYREACH';
    updates.phone_verified_at = now;
    updates.has_phone = true;
  }

  if (Object.keys(updates).length > 1) {
    await supabase.from('leads').update(updates).eq('id', leadId);
  }

  // Store phones in enrichment_phone_evidence (idempotent)
  for (const phone of phones) {
    if (!phone.phoneE164) continue;

    // Check for manual phone conflict
    const { data: existingPhone } = await supabase
      .from('enrichment_phone_evidence')
      .select('id, is_manual_research')
      .eq('lead_id', leadId)
      .eq('phone_e164', phone.phoneE164)
      .single();

    if (existingPhone?.is_manual_research) {
      await supabase.from('propertyreach_audit_events').insert({
        lead_id: leadId,
        job_id: jobId,
        match_id: matchId,
        event_type: 'MANUAL_DATA_PROTECTED',
        event_data: { type: 'PHONE_CONFLICT', phone: phone.phoneE164 },
      });
      continue;
    }

    await supabase.from('enrichment_phone_evidence').upsert({
      lead_id: leadId,
      phone_e164: phone.phoneE164,
      phone_raw: phone.phoneRaw,
      phone_type: phone.phoneType,
      phone_status: phone.confidence >= 80 ? 'CURRENT_HIGH_CONFIDENCE' : 'CURRENT_MEDIUM_CONFIDENCE',
      provider: 'PROPERTYREACH',
      provider_record_id: phone.providerRecordId || null,
      confidence: phone.confidence,
      association_type: phone.associationType || null,
      rank_order: phone.rankOrder,
      is_selected: phone.rankOrder === 1,
      last_verified_at: now,
      verified_number: phone.confidence >= 80,
      freshness_status: 'CURRENT',
    }, { onConflict: 'lead_id,phone_e164' });
  }

  // Audit: canonical updated
  await supabase.from('propertyreach_audit_events').insert({
    lead_id: leadId,
    job_id: jobId,
    match_id: matchId,
    event_type: 'CANONICAL_UPDATED',
    event_data: {
      ownerUpdated: !isManuallyVerifiedOwner && !!owner.fullName,
      phoneUpdated: !isManuallyVerifiedPhone && !!bestPhone,
      phonesFound: phones.length,
      emailsFound: emails.length,
    },
  });

  // Update match record as accepted
  await supabase
    .from('propertyreach_property_matches')
    .update({ match_decision: 'AUTO_ACCEPTED', accepted_at: now })
    .eq('id', matchId);
}
