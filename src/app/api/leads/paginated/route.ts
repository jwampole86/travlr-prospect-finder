import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@supabase/supabase-js';
import { requireApiActor } from '@/lib/auth/apiAuthorization';
import { calculateProspectScore } from '@/lib/scoring/prospectScoring';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeadQueryParams {
  page: number;
  pageSize: number;
  search: string;
  cities: string[];
  sources: string[];
  regulationStatuses: string[];
  stages: string[];
  beds: string;
  priceMin: string;
  priceMax: string;
  scoreMin: string;
  dateFrom: string;
  dateTo: string;
  sortKey: string;
  sortDir: 'asc' | 'desc';
  stateCode: string;
  isSynthetic?: boolean | null;
  ingestionSource?: string;
  // Luxury + verification filters
  luxury?: boolean | null;
  fullyVerified?: boolean | null;
  verifiedOwnerOnly?: boolean | null;
  verifiedNumberOnly?: boolean | null;
  phoneAvailableOnly?: boolean | null;
  assignmentStatus?: string;
  priorityTier?: string;
  excludeTerminal?: boolean | null;
  ownerAgentId?: string;
  manualImportOnly?: boolean | null;
  outreachStatus?: string;
  enrichmentStatus?: string;
  propertyReachEnriched?: boolean | null;
  needsEnrichment?: boolean | null;
  enrichmentReviewRequired?: boolean | null;
}

function applyLeadFilters(query: any, params: LeadQueryParams) {
  let filtered = query;

  if (params.stateCode && params.stateCode !== 'all' && params.stateCode !== 'ALL') filtered = filtered.eq('state', params.stateCode);
  if (params.search) {
    const term = `%${params.search}%`;
    filtered = filtered.or(`address.ilike.${term},city.ilike.${term},notes.ilike.${term},contact_name.ilike.${term},contact_phone.ilike.${term}`);
  }
  if (params.cities.length > 0) filtered = filtered.in('city', params.cities);
  if (params.sources.length > 0) filtered = filtered.in('source', params.sources);
  if (params.regulationStatuses.length > 0) filtered = filtered.in('regulation_status', params.regulationStatuses);
  if (params.stages.length > 0) filtered = filtered.in('stage', params.stages);
  if (params.excludeTerminal === true) filtered = filtered.not('stage', 'in', '("Not a Fit","Live")');

  if (params.ingestionSource && params.ingestionSource !== 'ALL') {
    if (params.ingestionSource === 'MANUAL_CSV') {
      filtered = filtered.or('ingestion_source.eq.MANUAL_CSV,ingestion_source.eq.MANUAL_RESEARCH_CSV,ingestion_source.eq.CSV_IMPORT,source_type.eq.MANUAL_VERIFIED_IMPORT,source_type.eq.MANUAL_RESEARCH_CSV');
    } else if (params.ingestionSource === 'LINK_SYNC') {
      filtered = filtered.eq('ingestion_source', 'LINK_SYNC').is('import_batch_id', null);
    } else if (params.ingestionSource === 'MULTI_SOURCE') {
      filtered = filtered.eq('is_multi_source', true);
    }
  }

  if (params.luxury === true) filtered = filtered.eq('luxury', true);
  if (params.fullyVerified === true) {
    filtered = filtered
      .eq('verified_owner', true)
      .eq('verified_number', true)
      .not('verified_address', 'is', null)
      .neq('verified_address', '')
      .neq('verified_address', 'false');
  }
  if (params.verifiedOwnerOnly === true) filtered = filtered.eq('verified_owner', true);
  if (params.verifiedNumberOnly === true) filtered = filtered.eq('verified_number', true);
  if (params.phoneAvailableOnly === true) filtered = filtered.not('contact_phone', 'is', null).neq('contact_phone', '');

  if (params.ownerAgentId) {
    if (params.ownerAgentId === 'unassigned') filtered = filtered.or('primary_agent_id.is.null,primary_agent_id.eq.');
    else filtered = filtered.eq('primary_agent_id', params.ownerAgentId);
  }
  if (params.manualImportOnly === true) {
    filtered = filtered.or('source_type.eq.MANUAL_VERIFIED_IMPORT,is_verified_lead.eq.true,ingestion_source.eq.MANUAL_RESEARCH_CSV');
  }
  if (params.outreachStatus) filtered = filtered.eq('outreach_status', params.outreachStatus);
  if (params.enrichmentStatus) filtered = filtered.eq('enrichment_status', params.enrichmentStatus);
  if (params.propertyReachEnriched === true) filtered = filtered.not('property_reach_id', 'is', null);
  if (params.needsEnrichment === true) filtered = filtered.or('verified_owner.eq.false,verified_number.eq.false,property_reach_id.is.null');
  if (params.enrichmentReviewRequired === true) filtered = filtered.eq('enrichment_status', 'REVIEW_REQUIRED');

  if (params.assignmentStatus === 'assigned') {
    filtered = filtered.not('primary_agent_id', 'is', null).neq('primary_agent_id', '');
  } else if (params.assignmentStatus === 'unassigned') {
    filtered = filtered.is('primary_agent_id', null);
  }
  if (params.priorityTier) filtered = filtered.eq('priority_tier', parseInt(params.priorityTier, 10));
  if (params.beds) filtered = filtered.eq('beds', parseInt(params.beds, 10));
  if (params.priceMin) filtered = filtered.gte('price', parseInt(params.priceMin, 10));
  if (params.priceMax) filtered = filtered.lte('price', parseInt(params.priceMax, 10));
  if (params.scoreMin) filtered = filtered.gte('prospect_score', parseInt(params.scoreMin, 10));
  if (params.dateFrom) filtered = filtered.gte('created_at', params.dateFrom);
  if (params.dateTo) filtered = filtered.lte('created_at', `${params.dateTo}T23:59:59Z`);
  if (params.isSynthetic === true) filtered = filtered.eq('is_synthetic', true);
  else if (params.isSynthetic === false) filtered = filtered.or('is_synthetic.is.null,is_synthetic.eq.false');

  return filtered;
}

function hasLeadFacts(row: Record<string, unknown>) {
  return Boolean(
    Number(row.beds || 0) > 0 ||
    Number(row.baths || 0) > 0 ||
    Number(row.price || 0) > 0 ||
    Number(row.estimated_net_monthly || 0) > 0 ||
    Number(row.estimated_gross_monthly || 0) > 0 ||
    row.contact_phone ||
    row.contact_name ||
    row.verified_owner ||
    row.verified_number ||
    row.verified_address
  );
}

function withAdjustedProspectScore(row: Record<string, unknown>) {
  const calculated = calculateProspectScore({
    estimatedNetMonthly: Number(row.estimated_net_monthly || 0),
    estimatedGrossMonthly: Number(row.estimated_gross_monthly || 0),
    estimatedADR: Number(row.estimated_adr || 0),
    price: Number(row.price || 0),
    beds: Number(row.beds || 0),
    baths: Number(row.baths || 0),
    propertyType: String(row.property_type || ''),
    regulationStatus: String(row.regulation_status || 'Unknown'),
    verifiedOwner: Boolean(row.verified_owner),
    verifiedNumber: Boolean(row.verified_number),
    verifiedAddress: row.verified_address as string | boolean | null,
    contactPhone: row.contact_phone ? String(row.contact_phone) : null,
    stage: row.stage ? String(row.stage) : null,
    daysOnMarket: typeof row.days_on_market === 'number' ? row.days_on_market : null,
    luxury: Boolean(row.luxury),
  }).score;
  const stored = Number(row.prospect_score || 0);
  const adjusted = hasLeadFacts(row) ? Math.min(stored || calculated, calculated) : calculated;
  return { ...row, prospect_score: adjusted, raw_prospect_score: stored, score_needs_refresh: stored !== adjusted };
}

// ─── GET /api/leads/paginated ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const requestStart = Date.now();
  const requestId = Math.random().toString(36).slice(2, 10);

  try {
    const authorization = await requireApiActor(req);
    if (!authorization.actor) {
      return NextResponse.json({ error: authorization.error }, { status: authorization.status });
    }
    const { searchParams } = new URL(req.url);

    // ── Boolean helper: only true when param is explicitly "true" ──────────
    // CRITICAL: Boolean("false") === true, so we must use explicit string comparison.
    // Missing param → null (no filter applied). "true" → true. Anything else → false.
    const parseBool = (key: string): boolean | null => {
      if (!searchParams.has(key)) return null;
      return searchParams.get(key) === 'true';
    };

    const params: LeadQueryParams = {
      page: Math.max(1, parseInt(searchParams.get('page') || '1', 10)),
      pageSize: Math.min(200, Math.max(10, parseInt(searchParams.get('pageSize') || '50', 10))),
      search: searchParams.get('search') || '',
      cities: searchParams.getAll('cities'),
      sources: searchParams.getAll('sources'),
      regulationStatuses: searchParams.getAll('regulationStatuses'),
      stages: searchParams.getAll('stages'),
      beds: searchParams.get('beds') || '',
      priceMin: searchParams.get('priceMin') || '',
      priceMax: searchParams.get('priceMax') || '',
      scoreMin: searchParams.get('scoreMin') || '',
      dateFrom: searchParams.get('dateFrom') || '',
      dateTo: searchParams.get('dateTo') || '',
      sortKey: searchParams.get('sortKey') || 'prospect_score',
      sortDir: (searchParams.get('sortDir') as 'asc' | 'desc') || 'desc',
      stateCode: searchParams.get('stateCode') || '',
      // isSynthetic: null = no filter (show all), true = only synthetic, false = only non-synthetic
      // Default is null (no filter) — the caller must explicitly pass isSynthetic=false to exclude synthetic.
      // Previously defaulted to false which caused leads with is_synthetic=NULL to be excluded.
      isSynthetic: parseBool('isSynthetic'),
      ingestionSource: searchParams.get('ingestionSource') || 'ALL',
      // Luxury + verification — use explicit string comparison to avoid Boolean("false")===true bug
      luxury: parseBool('luxury'),
      fullyVerified: parseBool('fullyVerified'),
      verifiedOwnerOnly: parseBool('verifiedOwnerOnly'),
      verifiedNumberOnly: parseBool('verifiedNumberOnly'),
      phoneAvailableOnly: parseBool('phoneAvailableOnly'),
      assignmentStatus: searchParams.get('assignmentStatus') || '',
      priorityTier: searchParams.get('priorityTier') || '',
      excludeTerminal: parseBool('excludeTerminal'),
      ownerAgentId: searchParams.get('ownerAgentId') || '',
      manualImportOnly: parseBool('manualImportOnly'),
      outreachStatus: searchParams.get('outreachStatus') || '',
      enrichmentStatus: searchParams.get('enrichmentStatus') || '',
      propertyReachEnriched: parseBool('propertyReachEnriched'),
      needsEnrichment: parseBool('needsEnrichment'),
      enrichmentReviewRequired: parseBool('enrichmentReviewRequired'),
    };

    if (!authorization.actor.isAdmin) {
      if (authorization.actor.role !== 'agent') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      params.ownerAgentId = authorization.actor.user.id;
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // ── Build query ────────────────────────────────────────────────────────
    const selectCols = [
      'id', 'address', 'city', 'state', 'zip', 'lat', 'lng',
      'beds', 'baths', 'price', 'price_type', 'source', 'stage',
      'regulation_status', 'prospect_score', 'days_on_market',
      'last_checked', 'listing_url', 'notes',
      'contact_name', 'contact_phone',
      'tags', 'estimated_adr', 'estimated_occupancy',
      'estimated_gross_monthly', 'estimated_net_monthly',
      'photos', 'created_at', 'updated_at',
      'is_synthetic', 'contact_info_requested', 'contact_info_requested_at',
      'addr_validated', 'addr_mismatch',
      // Verification fields
      'verification_status', 'verification_score', 'verification_method',
      'verification_timestamp', 'verified_address', 'normalized_address',
      'apn', 'property_provider', 'provider_property_id', 'county',
      'verification_notes',
      // Source provenance fields
      'source_type', 'ingestion_source', 'is_verified_lead',
      'verified_owner', 'verified_number', 'has_phone',
      'import_batch_id', 'is_multi_source',
      'outreach_status', 'enrichment_status', 'priority_tier',
      // Luxury fields
      'luxury', 'fully_verified', 'luxury_source_ids',
      'verified_number_source', 'verified_number_method',
      'verified_owner_source', 'verified_owner_method',
      'owner_source', 'phone_source',
      'property_reach_id',
      // Assignment
      'primary_agent_id',
    ].join(',');

    // Map camelCase sort keys to snake_case DB columns
    const SORT_KEY_MAP: Record<string, string> = {
      prospectScore: 'prospect_score',
      daysOnMarket: 'days_on_market',
      lastChecked: 'last_checked',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      regulationStatus: 'regulation_status',
      priceType: 'price_type',
      estimatedNetMonthly: 'estimated_net_monthly',
      priorityTier: 'priority_tier',
      luxury: 'luxury',
    };
    const dbSortKey = SORT_KEY_MAP[params.sortKey] || params.sortKey;

    let query = supabase
      .from('leads')
      .select(selectCols, { count: 'exact' });
    query = applyLeadFilters(query, params);

    // ── Sort + Pagination ──────────────────────────────────────────────────
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;

    // For luxury views: default sort is priority_tier ASC, then prospect_score DESC
    if (params.luxury === true && params.sortKey === 'prospect_score') {
      query = query
        .order('priority_tier', { ascending: true })
        .order('prospect_score', { ascending: false })
        .range(from, to);
    } else {
      query = query
        .order(dbSortKey, { ascending: params.sortDir === 'asc' })
        .range(from, to);
    }

    const countByBand = (minimum: number, maximum?: number) => {
      let bandQuery = applyLeadFilters(
        supabase.from('leads').select('id', { count: 'exact', head: true }),
        params
      ).gte('prospect_score', minimum);
      if (maximum !== undefined) bandQuery = bandQuery.lte('prospect_score', maximum);
      return bandQuery;
    };

    const [pageResult, hotResult, warmResult, coldResult] = await Promise.all([
      query,
      countByBand(80),
      countByBand(60, 79),
      countByBand(0, 59),
    ]);
    const { data, error, count } = pageResult;
    const bandCountError = hotResult.error || warmResult.error || coldResult.error;

    const queryDurationMs = Date.now() - requestStart;

    // ── Slow query logging ─────────────────────────────────────────────────
    if (queryDurationMs >= 500) {
      const level = queryDurationMs >= 2000 ? 'CRITICAL' : 'WARN';
      console.warn(
        `[leads/paginated][${level}] requestId=${requestId} duration=${queryDurationMs}ms ` +
        `page=${params.page} pageSize=${params.pageSize} search="${params.search}" ` +
        `state=${params.stateCode} stages=${params.stages.join(',')} ` +
        `count=${count ?? 0}`
      );
    }

    if (error) {
      console.error('[leads/paginated] Query error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (bandCountError) {
      console.error('[leads/paginated] Band count error:', bandCountError.message);
      return NextResponse.json({ error: bandCountError.message }, { status: 500 });
    }

    const adjustedLeads = ((data || []) as unknown[]).map((row) => withAdjustedProspectScore(row as Record<string, unknown>));
    if (dbSortKey === 'prospect_score') {
      adjustedLeads.sort((a, b) => params.sortDir === 'asc'
        ? Number(a.prospect_score || 0) - Number(b.prospect_score || 0)
        : Number(b.prospect_score || 0) - Number(a.prospect_score || 0));
    }

    const response = NextResponse.json({
      leads: adjustedLeads,
      total: count ?? 0,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.ceil((count ?? 0) / params.pageSize),
      bandCounts: {
        hot: hotResult.count ?? 0,
        warm: warmResult.count ?? 0,
        cold: coldResult.count ?? 0,
      },
      _meta: {
        requestId,
        durationMs: queryDurationMs,
      },
    });

    // Cache for 30 seconds on CDN/browser
    response.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
    response.headers.set('X-Request-Id', requestId);
    response.headers.set('X-Duration-Ms', String(queryDurationMs));

    return response;
  } catch (err) {
    const totalMs = Date.now() - requestStart;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    console.error(`[leads/paginated] Error requestId=${requestId} duration=${totalMs}ms:`, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
