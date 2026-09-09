import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@supabase/supabase-js';

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
}

// ─── GET /api/leads/paginated ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const requestStart = Date.now();
  const requestId = Math.random().toString(36).slice(2, 10);

  try {
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
    };

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

    // ── Portfolio / state filter ───────────────────────────────────────────
    // IMPORTANT: Only filter by state when a real state code is provided.
    // 'all' or empty string means "All Portfolios" — no state restriction.
    if (params.stateCode && params.stateCode !== 'all' && params.stateCode !== 'ALL') {
      query = query.eq('state', params.stateCode);
    }

    // ── Text search ────────────────────────────────────────────────────────
    if (params.search) {
      const term = `%${params.search}%`;
      query = query.or(
        `address.ilike.${term},city.ilike.${term},notes.ilike.${term},contact_name.ilike.${term},contact_phone.ilike.${term}`
      );
    }

    // ── Multi-select filters ───────────────────────────────────────────────
    if (params.cities.length > 0) {
      query = query.in('city', params.cities);
    }
    if (params.sources.length > 0) {
      query = query.in('source', params.sources);
    }
    if (params.regulationStatuses.length > 0) {
      query = query.in('regulation_status', params.regulationStatuses);
    }
    if (params.stages.length > 0) {
      query = query.in('stage', params.stages);
    }

    // ── Ingestion source filter ────────────────────────────────────────────
    // Source category normalization:
    //   MANUAL_CSV / MANUAL_RESEARCH_CSV / MANUAL_VERIFIED_IMPORT / CSV_IMPORT → "Manual CSV" UI category
    //   LINK_SYNC → "Link Sync" UI category
    //   MULTI_SOURCE → "Multi-Source" UI category
    if (params.ingestionSource && params.ingestionSource !== 'ALL') {
      if (params.ingestionSource === 'MANUAL_CSV') {
        // Match all known manual/CSV import source variants
        query = query.or(
          'ingestion_source.eq.MANUAL_CSV,ingestion_source.eq.MANUAL_RESEARCH_CSV,ingestion_source.eq.CSV_IMPORT,source_type.eq.MANUAL_VERIFIED_IMPORT,source_type.eq.MANUAL_RESEARCH_CSV'
        );
      } else if (params.ingestionSource === 'LINK_SYNC') {
        query = query.eq('ingestion_source', 'LINK_SYNC')
          .is('import_batch_id', null);
      } else if (params.ingestionSource === 'MULTI_SOURCE') {
        query = query.eq('is_multi_source', true);
      }
    }

    // ── Luxury filter (server-side, real DB column) ────────────────────────
    if (params.luxury === true) {
      query = query.eq('luxury', true);
    }

    // ── Fully Verified filter ──────────────────────────────────────────────
    if (params.fullyVerified === true) {
      query = query.eq('fully_verified', true);
    }

    // ── Verified Owner filter ──────────────────────────────────────────────
    if (params.verifiedOwnerOnly === true) {
      query = query.eq('verified_owner', true);
    }

    // ── Verified Number / Phone filter ─────────────────────────────────────
    if (params.verifiedNumberOnly === true) {
      query = query.eq('verified_number', true);
    }

    // ── Phone Available filter ─────────────────────────────────────────────
    if (params.phoneAvailableOnly === true) {
      query = query.eq('has_phone', true);
    }

    // ── Assignment status filter ───────────────────────────────────────────
    if (params.assignmentStatus === 'assigned') {
      query = query.not('primary_agent_id', 'is', null).neq('primary_agent_id', '');
    } else if (params.assignmentStatus === 'unassigned') {
      query = query.or('primary_agent_id.is.null,primary_agent_id.eq.');
    }

    // ── Priority tier filter ───────────────────────────────────────────────
    if (params.priorityTier && params.priorityTier !== '') {
      query = query.eq('priority_tier', parseInt(params.priorityTier, 10));
    }

    // ── Numeric filters ────────────────────────────────────────────────────
    if (params.beds) {
      query = query.eq('beds', parseInt(params.beds, 10));
    }
    if (params.priceMin) {
      query = query.gte('price', parseInt(params.priceMin, 10));
    }
    if (params.priceMax) {
      query = query.lte('price', parseInt(params.priceMax, 10));
    }
    if (params.scoreMin) {
      query = query.gte('prospect_score', parseInt(params.scoreMin, 10));
    }

    // ── Date range filter ──────────────────────────────────────────────────
    if (params.dateFrom) {
      query = query.gte('created_at', params.dateFrom);
    }
    if (params.dateTo) {
      query = query.lte('created_at', params.dateTo + 'T23:59:59Z');
    }

    // ── Synthetic data filter ──────────────────────────────────────────────
    // CRITICAL FIX: PostgreSQL's != operator excludes NULL rows.
    // Using neq('is_synthetic', true) would silently drop all leads where
    // is_synthetic IS NULL (e.g. newly imported leads that never had this set).
    // Instead, we explicitly include rows where is_synthetic is NULL or false.
    if (params.isSynthetic === true) {
      query = query.eq('is_synthetic', true);
    } else if (params.isSynthetic === false) {
      // Explicitly requested non-synthetic only — include NULL and false
      query = query.or('is_synthetic.is.null,is_synthetic.eq.false');
    }
    // isSynthetic === null → no filter, show all leads (canonical default)

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

    const { data, error, count } = await query;

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

    const response = NextResponse.json({
      leads: data || [],
      total: count ?? 0,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.ceil((count ?? 0) / params.pageSize),
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
