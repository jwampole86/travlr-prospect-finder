import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { calculateProspectScore } from '@/lib/scoring/prospectScoring';

const DOMAINS = ['zillow.com', 'realtor.com', 'trulia.com', 'redfin.com'];

type Assessment = {
  status: 'ACTIVE_RENTAL' | 'OFF_MARKET' | 'NOT_FOUND' | 'AMBIGUOUS';
  askingRent: number | null;
  confidence: number;
  sourceUrl: string | null;
  evidenceSummary: string;
};

function parseAssessment(text: string): Assessment {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No structured listing assessment returned');
  const parsed = JSON.parse(match[0]);
  const statuses = ['ACTIVE_RENTAL', 'OFF_MARKET', 'NOT_FOUND', 'AMBIGUOUS'];
  return {
    status: statuses.includes(parsed.status) ? parsed.status : 'AMBIGUOUS',
    askingRent: Number(parsed.askingRent) > 0 ? Math.round(Number(parsed.askingRent)) : null,
    confidence: Math.max(0, Math.min(100, Math.round(Number(parsed.confidence) || 0))),
    sourceUrl: typeof parsed.sourceUrl === 'string' ? parsed.sourceUrl : null,
    evidenceSummary: String(parsed.evidenceSummary || 'No explicit listing evidence found.').slice(0, 1000),
  };
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || /your-|placeholder|changeme|example/i.test(apiKey)) {
    return NextResponse.json({ error: 'Anthropic is not configured' }, { status: 503 });
  }

  const db = getSupabaseAdmin();
  const { data: jobs, error } = await db.from('listing_verification_jobs')
    .select('id,user_id,lead_id,attempts').in('status', ['queued', 'retry'])
    .lte('next_attempt_at', new Date().toISOString()).order('priority', { ascending: false }).order('created_at').limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const job = jobs?.[0];
  if (!job) return NextResponse.json({ ok: true, processed: 0 });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const { data: settings } = await db.from('listing_verification_settings').select('*').eq('user_id', job.user_id).maybeSingle();
  const dailyLimit = Number(settings?.daily_search_limit || 100);
  const { count } = await db.from('listing_verification_evidence').select('id', { count: 'exact', head: true }).eq('user_id', job.user_id).gte('searched_at', today.toISOString());
  if ((count || 0) >= dailyLimit) return NextResponse.json({ ok: true, processed: 0, budgetReached: true });

  const now = new Date().toISOString();
  await db.from('listing_verification_jobs').update({ status: 'processing', claimed_at: now, updated_at: now }).eq('id', job.id);
  try {
    const { data: lead } = await db.from('leads').select('id,address,city,state,zip,prospect_score,beds,baths,price,estimated_net_monthly,estimated_gross_monthly,estimated_adr,regulation_status,verified_owner,verified_number,verified_address,contact_phone,luxury,days_on_market,stage').eq('id', job.lead_id).single();
    if (!lead) throw new Error('Lead not found');
    const client = new Anthropic({ apiKey });
    const fullAddress = [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(', ');
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 700, temperature: 0,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3, allowed_domains: DOMAINS }],
      messages: [{ role: 'user', content: `Search public indexed pages for the exact address ${fullAddress}. Determine whether explicit current evidence shows this exact property actively offered for rent and its monthly asking rent. Do not use Zestimates, estimates, sale prices, historical listings, nearby properties, or search pages as active-rental evidence. Never invent a URL or price. Return JSON only: {"status":"ACTIVE_RENTAL|OFF_MARKET|NOT_FOUND|AMBIGUOUS","askingRent":number|null,"confidence":0-100,"sourceUrl":string|null,"evidenceSummary":"brief evidence"}` }],
    } as any);
    const text = response.content.filter((block: any) => block.type === 'text').map((block: any) => block.text).join('\n');
    const results = response.content.filter((block: any) => block.type === 'web_search_tool_result' && Array.isArray(block.content)).flatMap((block: any) => block.content).filter((item: any) => item.type === 'web_search_result');
    const assessment = parseAssessment(text);
    const citation = results.find((item: any) => item.url === assessment.sourceUrl);
    if (assessment.status === 'ACTIVE_RENTAL' && !citation) {
      assessment.status = 'AMBIGUOUS'; assessment.askingRent = null; assessment.confidence = Math.min(60, assessment.confidence);
      assessment.evidenceSummary = 'Active-rental claim lacked a matching allowed-domain citation.';
    }
    const sourceUrl = citation?.url || assessment.sourceUrl;
    const domain = sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, '') : null;
    const evidence = { user_id: job.user_id, lead_id: job.lead_id, job_id: job.id, status: assessment.status, asking_rent: assessment.askingRent, confidence: assessment.confidence, source_url: sourceUrl, source_domain: domain, source_title: citation?.title || null, evidence_summary: assessment.evidenceSummary };
    await db.from('listing_verification_evidence').insert(evidence);

    const update: Record<string, unknown> = { listing_verification_confidence: assessment.confidence, listing_verified_at: now, listing_evidence: evidence };
    if (assessment.status === 'ACTIVE_RENTAL' && assessment.confidence >= Number(settings?.minimum_evidence_confidence || 80) && assessment.askingRent && sourceUrl) {
      const rentPoints = assessment.askingRent >= 5000 ? 10 : assessment.askingRent >= 3000 ? 7 : 4;
      Object.assign(update, { listing_status: 'Active', rent_listing_status: 'ACTIVE', current_asking_rent: assessment.askingRent, current_monthly_rent: assessment.askingRent, rent_source: domain, rent_price_source: domain, rent_retrieved_at: now, listing_source_url: sourceUrl, listing_url: sourceUrl, listing_status_source: domain, listing_status_retrieved_at: now, prospect_score: Math.min(100, Math.max(Number(lead.prospect_score || 0), 70) + rentPoints) });
    }
    const score = calculateProspectScore({
      estimatedNetMonthly: lead.estimated_net_monthly,
      estimatedGrossMonthly: lead.estimated_gross_monthly,
      estimatedADR: lead.estimated_adr,
      price: assessment.askingRent || lead.price,
      beds: lead.beds,
      baths: lead.baths,
      regulationStatus: lead.regulation_status,
      verifiedOwner: lead.verified_owner,
      verifiedNumber: lead.verified_number,
      verifiedAddress: lead.verified_address,
      contactPhone: lead.contact_phone,
      daysOnMarket: lead.days_on_market,
      stage: lead.stage,
      luxury: lead.luxury,
    });
    update.prospect_score = score.score;
    update.score_refreshed_at = now;
    await db.from('leads').update(update).eq('id', job.lead_id);
    await db.from('listing_verification_jobs').update({ status: 'completed', completed_at: now, updated_at: now, last_error: null }).eq('id', job.id);
    return NextResponse.json({ ok: true, processed: 1, status: assessment.status, confidence: assessment.confidence });
  } catch (cause) {
    const attempts = Number(job.attempts || 0) + 1;
    await db.from('listing_verification_jobs').update({ status: attempts >= 3 ? 'failed' : 'retry', attempts, next_attempt_at: new Date(Date.now() + Math.min(24, 2 ** attempts) * 3600000).toISOString(), last_error: cause instanceof Error ? cause.message.slice(0, 1000) : 'Listing verification failed', updated_at: new Date().toISOString() }).eq('id', job.id);
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Verification failed' }, { status: 500 });
  }
}
