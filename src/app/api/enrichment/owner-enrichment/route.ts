import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeAddress, batchDataProvider, scoreOwnerMatch } from '@/lib/services/ownerEnrichmentService';

/**
 * POST /api/enrichment/owner-enrichment
 * Starts or queues an owner enrichment job for a lead/property.
 *
 * Body: { leadId, address, city, state, zip, apn?, scope? }
 * Scope: MISSING_PHONE | MISSING_OWNER | MISSING_OWNER_AND_PHONE | FULL
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const { leadId, address, city, state, zip, apn, scope = 'MISSING_OWNER_AND_PHONE', priority = 5 } = body;

    if (!leadId || !address || !city || !state || !zip) {
      return NextResponse.json({ error: 'leadId, address, city, state, zip are required' }, { status: 400 });
    }

    // Normalize address before any lookup
    const normalized = normalizeAddress(address, city, state, zip);

    // Check for existing pending/running job
    const { data: existingJob } = await supabase
      .from('enrichment_jobs')
      .select('id, job_status')
      .eq('lead_id', leadId)
      .in('job_status', ['PENDING', 'RUNNING'])
      .single();

    if (existingJob) {
      return NextResponse.json({ jobId: existingJob.id, status: existingJob.job_status, message: 'Job already queued' });
    }

    // Create enrichment job
    const { data: job, error: jobError } = await supabase
      .from('enrichment_jobs')
      .insert({
        lead_id: leadId,
        canonical_address: normalized.normalizedAddress,
        raw_address: normalized.rawAddress,
        normalized_address: normalized.normalizedAddress,
        standardized_address: normalized.standardizedAddress,
        city,
        state,
        zip,
        apn: apn || null,
        job_status: 'PENDING',
        scope,
        priority,
      })
      .select()
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Failed to create enrichment job' }, { status: 500 });
    }

    // Log audit event
    await supabase.from('enrichment_audit_events').insert({
      lead_id: leadId,
      job_id: job.id,
      event_type: 'OWNER_ENRICHMENT_STARTED',
      event_data: { scope, address: normalized.normalizedAddress },
    });

    // Run enrichment asynchronously (fire and forget pattern)
    runEnrichmentJob(job.id, leadId, normalized, city, state, zip, apn, scope, supabase).catch(console.error);

    return NextResponse.json({ jobId: job.id, status: 'PENDING', message: 'Enrichment job queued' });
  } catch (err) {
    console.error('Owner enrichment error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/enrichment/owner-enrichment?leadId=xxx
 * Returns current enrichment status and results for a lead.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get('leadId');

    if (!leadId) {
      return NextResponse.json({ error: 'leadId required' }, { status: 400 });
    }

    const [jobsRes, matchesRes, phonesRes, reviewRes] = await Promise.all([
      supabase.from('enrichment_jobs').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(5),
      supabase.from('property_owner_matches').select('*').eq('lead_id', leadId).order('match_score', { ascending: false }),
      supabase.from('enrichment_phone_evidence').select('*').eq('lead_id', leadId).order('rank_order'),
      supabase.from('enrichment_review_queue').select('*').eq('lead_id', leadId).eq('review_status', 'PENDING').limit(1),
    ]);

    return NextResponse.json({
      jobs: jobsRes.data || [],
      ownerMatches: matchesRes.data || [],
      phones: phonesRes.data || [],
      pendingReview: reviewRes.data?.[0] || null,
    });
  } catch (err) {
    console.error('Get enrichment error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── Async Enrichment Runner ─────────────────────────────────────────────────

async function runEnrichmentJob(
  jobId: string,
  leadId: string,
  normalized: ReturnType<typeof normalizeAddress>,
  city: string,
  state: string,
  zip: string,
  apn: string | undefined,
  scope: string,
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  try {
    // Mark as RUNNING
    await supabase.from('enrichment_jobs').update({ job_status: 'RUNNING', started_at: new Date().toISOString() }).eq('id', jobId);

    // Step 1: Verify property via BatchData
    let propertyVerified = false;
    let ownerOfRecord: string | undefined;
    let resolvedApn = apn;

    const propResult = await batchDataProvider.verifyProperty?.({
      address: normalized.normalizedAddress,
      city,
      state,
      zip,
      apn,
    });

    if (propResult?.verified) {
      propertyVerified = true;
      ownerOfRecord = propResult.ownerOfRecord;
      resolvedApn = propResult.apn || apn;

      await supabase.from('enrichment_jobs').update({
        property_verified: true,
        property_verified_at: new Date().toISOString(),
        property_provider: propResult.provider,
        apn: resolvedApn || null,
      }).eq('id', jobId);

      // Store property evidence
      await supabase.from('enrichment_evidence_records').insert({
        lead_id: leadId,
        job_id: jobId,
        evidence_type: 'PROPERTY_VERIFICATION',
        evidence_data: propResult as unknown as Record<string, unknown>,
        source_provider: propResult.provider,
        confidence: 90,
      });
    }

    // Step 2: Resolve owner
    let ownerCandidates: Awaited<ReturnType<typeof batchDataProvider.searchOwner>> = [];

    if (scope !== 'MISSING_PHONE') {
      ownerCandidates = await batchDataProvider.searchOwner({
        fullName: ownerOfRecord,
        propertyAddress: normalized.normalizedAddress,
        city,
        state,
        zip,
        apn: resolvedApn,
      });

      // Store owner candidates
      for (const candidate of ownerCandidates) {
        await supabase.from('enrichment_owner_candidates').insert({
          job_id: jobId,
          lead_id: leadId,
          full_name: candidate.fullName,
          first_name: candidate.firstName,
          last_name: candidate.lastName,
          owner_type: candidate.ownerType,
          ownership_confidence: candidate.ownershipConfidence,
          source_provider: candidate.source,
          source_record_id: candidate.sourceRecordId,
          mailing_address: candidate.mailingAddress,
          mailing_city: candidate.mailingCity,
          mailing_state: candidate.mailingState,
          mailing_zip: candidate.mailingZip,
          is_entity: candidate.isEntity || false,
          source_retrieved_at: new Date().toISOString(),
        });
      }

      await supabase.from('enrichment_jobs').update({ owner_resolution_done: true }).eq('id', jobId);
    }

    // Step 3: Score best candidate and create match
    let bestMatch: (typeof ownerCandidates)[0] | undefined;
    let matchResult: ReturnType<typeof scoreOwnerMatch> | undefined;

    if (ownerCandidates.length > 0) {
      // Score each candidate
      const scored = ownerCandidates.map(c => {
        const result = scoreOwnerMatch({
          candidateName: c.fullName,
          candidateLastName: c.lastName,
          propertyAddressMatch: propertyVerified,
          apnLinkedOwner: !!(resolvedApn && c.sourceRecordId),
          ownerMailingAddressMatch: !!(c.mailingAddress),
          fullNameExactMatch: !!(ownerOfRecord && c.fullName?.toLowerCase() === ownerOfRecord.toLowerCase()),
          lastNamePropertyAssociation: !!(c.lastName && ownerOfRecord?.toLowerCase().includes(c.lastName.toLowerCase())),
          cityStateRelationship: c.mailingState?.toUpperCase() === state.toUpperCase(),
          phoneAddressAssociation: false,
          firstNameOnlyMatch: false,
          sameCityOnly: c.mailingCity?.toLowerCase() === city.toLowerCase(),
          conflictingAddress: false,
          conflictingOwnerRecord: false,
        });
        return { candidate: c, result };
      });

      const best = scored.sort((a, b) => b.result.totalScore - a.result.totalScore)[0];
      bestMatch = best.candidate;
      matchResult = best.result;

      // Check for existing manual research — never overwrite with lower confidence
      const { data: existingMatch } = await supabase
        .from('property_owner_matches')
        .select('id, is_manual_research, match_score')
        .eq('lead_id', leadId)
        .eq('match_status', 'ACCEPTED')
        .single();

      const shouldCreate = !existingMatch || !existingMatch.is_manual_research;

      if (shouldCreate && matchResult.confidence !== 'NO_MATCH') {
        const { data: newMatch } = await supabase.from('property_owner_matches').insert({
          lead_id: leadId,
          owner_name: bestMatch.fullName,
          owner_type: bestMatch.ownerType,
          confidence: matchResult.confidence,
          match_score: matchResult.totalScore,
          match_status: matchResult.autoAccept ? 'AUTO_ACCEPTED' : 'PENDING_REVIEW',
          source_provider: bestMatch.source,
          source_record_id: bestMatch.sourceRecordId,
          source_retrieved_at: new Date().toISOString(),
          match_reasons: matchResult.matchReasons,
          evidence: { signals: matchResult.signals, candidate: bestMatch },
          verified_owner: matchResult.confidence === 'VERIFIED',
          owner_verified_at: matchResult.confidence === 'VERIFIED' ? new Date().toISOString() : null,
          owner_verification_source: bestMatch.source,
          owner_verification_method: 'AUTOMATED_MULTI_SIGNAL',
        }).select().single();

        if (newMatch) {
          await supabase.from('enrichment_audit_events').insert({
            lead_id: leadId,
            job_id: jobId,
            event_type: 'OWNER_MATCH_FOUND',
            event_data: { matchId: newMatch.id, confidence: matchResult.confidence, score: matchResult.totalScore },
            provider: bestMatch.source,
          });

          // Add to review queue if needed
          if (matchResult.requiresReview || matchResult.confidence === 'CONFLICT') {
            await supabase.from('enrichment_review_queue').insert({
              lead_id: leadId,
              job_id: jobId,
              match_id: newMatch.id,
              suggested_owner_name: bestMatch.fullName,
              confidence: matchResult.confidence,
              match_score: matchResult.totalScore,
              evidence: { signals: matchResult.signals },
              provider: bestMatch.source,
              reason: matchResult.confidence === 'CONFLICT' ? 'Owner conflict detected' : 'Medium confidence — requires review',
              review_status: 'PENDING',
            });
          }
        }
      }
    }

    // Step 4: Phone enrichment
    if (scope !== 'MISSING_OWNER' && bestMatch) {
      const phones = await batchDataProvider.searchPhone({
        fullName: bestMatch.fullName,
        propertyAddress: normalized.normalizedAddress,
        city,
        state,
        zip,
        mailingAddress: bestMatch.mailingAddress,
        apn: resolvedApn,
      });

      for (const phone of phones) {
        if (!phone.phoneE164) continue;

        // Check for existing manual phone — never overwrite
        const { data: existingPhone } = await supabase
          .from('enrichment_phone_evidence')
          .select('id, is_manual_research')
          .eq('lead_id', leadId)
          .eq('phone_e164', phone.phoneE164)
          .single();

        if (existingPhone?.is_manual_research) {
          // Flag conflict instead of overwriting
          await supabase.from('enrichment_audit_events').insert({
            lead_id: leadId,
            job_id: jobId,
            event_type: 'CONTACT_CONFLICT_FOUND',
            event_data: { type: 'PHONE_CONFLICT', phone: phone.phoneE164, reason: 'Automated result conflicts with manual research' },
            provider: phone.source,
          });
          continue;
        }

        const phoneStatus = phone.confidence >= 80 ? 'CURRENT_HIGH_CONFIDENCE' : 'CURRENT_MEDIUM_CONFIDENCE';

        await supabase.from('enrichment_phone_evidence').upsert({
          lead_id: leadId,
          phone_e164: phone.phoneE164,
          phone_raw: phone.phoneRaw,
          phone_type: phone.phoneType,
          phone_status: phoneStatus,
          provider: phone.source,
          provider_record_id: phone.providerRecordId,
          confidence: phone.confidence,
          association_type: phone.associationType,
          rank_order: phone.rankOrder || 99,
          is_selected: phone.rankOrder === 1,
          last_verified_at: new Date().toISOString(),
          verified_number: phone.confidence >= 80,
          freshness_status: 'CURRENT',
        }, { onConflict: 'lead_id,phone_e164' });

        await supabase.from('enrichment_audit_events').insert({
          lead_id: leadId,
          job_id: jobId,
          event_type: 'PHONE_FOUND',
          event_data: { phone: phone.phoneE164, type: phone.phoneType, confidence: phone.confidence },
          provider: phone.source,
        });
      }

      await supabase.from('enrichment_jobs').update({ phone_enrichment_done: true }).eq('id', jobId);
    }

    // Finalize job
    const finalStatus = (ownerCandidates.length > 0 || scope === 'MISSING_PHONE') ? 'FOUND' : 'NO_MATCH';
    const hasReview = matchResult?.requiresReview || matchResult?.confidence === 'CONFLICT';

    await supabase.from('enrichment_jobs').update({
      job_status: hasReview ? 'REVIEW_REQUIRED' : finalStatus,
      match_score: matchResult?.totalScore || 0,
      match_confidence: matchResult?.confidence || 'NO_MATCH',
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);

  } catch (err) {
    console.error('Enrichment job runner error:', err);
    await supabase.from('enrichment_jobs').update({
      job_status: 'FAILED',
      error_message: err instanceof Error ? err.message : 'Unknown error',
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);
  }
}
