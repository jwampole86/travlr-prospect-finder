export type DateRangeKey = 'custom' | '7d' | '30d' | '90d' | 'mtd' | 'ytd';

export interface ReportFilters {
  dateRange: DateRangeKey;
  startDate: string;
  endDate: string;
  sources: string[];
  stages: string[];
  agents: string[];
  scoreMin: number;
  scoreMax: number;
}

export interface ReportOptions {
  sources: string[];
  stages: string[];
  agents: string[];
}

export interface BreakdownRow {
  label: string;
  value: number;
  percentage: number;
}

export interface TrendRow {
  label: string;
  leads: number;
  avgScore: number;
  contacted: number;
}

export interface LeadPreviewRow {
  id: string;
  createdAt: string;
  address: string;
  city: string;
  state: string;
  source: string;
  stage: string;
  enrichmentStatus: string | null;
  outreachStatus: string | null;
  primaryAgentName: string | null;
  prospectScore: number;
  touchpoints: number;
  lastTouchAt: string | null;
  smsStatus: string | null;
  engagementScore: number | null;
  replyIntent: string | null;
  contactName: string | null;
  contactPhone: string | null;
  estimatedNetMonthly: number;
  dealRevenue: number;
}

export interface AdvancedReportPayload {
  filters: ReportFilters;
  options?: ReportOptions;
  summary: {
    totalLeads: number;
    averageScore: number;
    contactedLeads: number;
    smsDelivered: number;
    replyRate: number;
    touchpoints: number;
    closedRevenue: number;
    lastLeadAt: string | null;
    lastOutreachAt: string | null;
  };
  breakdowns: {
    stages: BreakdownRow[];
    sources: BreakdownRow[];
    agents: BreakdownRow[];
    outreachStatuses: BreakdownRow[];
    smsStatuses: BreakdownRow[];
  };
  trend: TrendRow[];
  previewRows: LeadPreviewRow[];
  exportCount: number;
  dataSources: string[];
}

type LeadRow = {
  id: string;
  created_at: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  source: string | null;
  stage: string | null;
  enrichment_status: string | null;
  outreach_status: string | null;
  primary_agent_name: string | null;
  prospect_score: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  estimated_net_monthly: number | null;
  deal_revenue: number | null;
};

type OutreachRow = {
  lead_id: string | null;
  channel: string | null;
  status: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  replied_at: string | null;
  reply_detected: boolean | null;
};

type EngagementRow = {
  lead_id: string | null;
  twilio_status: string | null;
  engagement_score: number | null;
  reply_intent: string | null;
  reply_at: string | null;
  opted_out: boolean | null;
  delivered_at: string | null;
  updated_at: string | null;
};

const LEAD_SELECT = [
  'id',
  'created_at',
  'address',
  'city',
  'state',
  'zip',
  'source',
  'stage',
  'enrichment_status',
  'outreach_status',
  'primary_agent_name',
  'prospect_score',
  'contact_name',
  'contact_phone',
  'estimated_net_monthly',
  'deal_revenue',
].join(',');

const OPTIONS_SELECT = 'source,stage,primary_agent_name';
const OUTREACH_SELECT = 'lead_id,channel,status,sent_at,delivered_at,replied_at,reply_detected';
const ENGAGEMENT_SELECT = 'lead_id,twilio_status,engagement_score,reply_intent,reply_at,opted_out,delivered_at,updated_at';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function createDefaultReportFilters(): ReportFilters {
  const end = todayIso();
  const start = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  return {
    dateRange: '30d',
    startDate: start,
    endDate: end,
    sources: [],
    stages: [],
    agents: [],
    scoreMin: 0,
    scoreMax: 100,
  };
}

export function parseReportFilters(searchParams: URLSearchParams): ReportFilters {
  const defaults = createDefaultReportFilters();
  const scoreMin = Number(searchParams.get('scoreMin') ?? defaults.scoreMin);
  const scoreMax = Number(searchParams.get('scoreMax') ?? defaults.scoreMax);
  const dateRange = (searchParams.get('dateRange') as DateRangeKey | null) || defaults.dateRange;
  const startDate = searchParams.get('startDate') || defaults.startDate;
  const endDate = searchParams.get('endDate') || defaults.endDate;

  return {
    dateRange,
    startDate,
    endDate,
    sources: searchParams.getAll('sources').filter(Boolean),
    stages: searchParams.getAll('stages').filter(Boolean),
    agents: searchParams.getAll('agents').filter(Boolean),
    scoreMin: Number.isFinite(scoreMin) ? Math.max(0, scoreMin) : defaults.scoreMin,
    scoreMax: Number.isFinite(scoreMax) ? Math.min(100, scoreMax) : defaults.scoreMax,
  };
}

function clampFilters(filters: ReportFilters): ReportFilters {
  return {
    ...filters,
    scoreMin: Math.max(0, Math.min(100, filters.scoreMin)),
    scoreMax: Math.max(0, Math.min(100, filters.scoreMax)),
  };
}

function getRangeBounds(filters: ReportFilters) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  switch (filters.dateRange) {
    case '7d':
      return { start: new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10), end: today };
    case '30d':
      return { start: new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10), end: today };
    case '90d':
      return { start: new Date(Date.now() - 89 * 86400000).toISOString().slice(0, 10), end: today };
    case 'mtd':
      return { start: `${today.slice(0, 8)}01`, end: today };
    case 'ytd':
      return { start: `${today.slice(0, 4)}-01-01`, end: today };
    default:
      return { start: filters.startDate || today, end: filters.endDate || today };
  }
}

function applyLeadFilters(query: any, rawFilters: ReportFilters) {
  const filters = clampFilters(rawFilters);
  const bounds = getRangeBounds(filters);
  let next = query
    .gte('created_at', `${bounds.start}T00:00:00Z`)
    .lte('created_at', `${bounds.end}T23:59:59Z`);

  if (filters.sources.length > 0) next = next.in('source', filters.sources);
  if (filters.stages.length > 0) next = next.in('stage', filters.stages);
  if (filters.agents.length > 0) next = next.in('primary_agent_name', filters.agents);
  if (filters.scoreMin > 0) next = next.gte('prospect_score', filters.scoreMin);
  if (filters.scoreMax < 100) next = next.lte('prospect_score', filters.scoreMax);
  return next;
}

async function fetchAllPages<T>(queryFactory: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryFactory(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function fetchFilteredLeads(client: any, filters: ReportFilters) {
  return fetchAllPages<LeadRow>((from, to) =>
    applyLeadFilters(
      client.from('leads').select(LEAD_SELECT).order('created_at', { ascending: false }).range(from, to),
      filters
    )
  );
}

async function fetchLeadOptions(client: any) {
  const rows = await fetchAllPages<Pick<LeadRow, 'source' | 'stage' | 'primary_agent_name'>>((from, to) =>
    client.from('leads').select(OPTIONS_SELECT).order('created_at', { ascending: false }).range(from, to)
  );

  const unique = (values: Array<string | null>) =>
    [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));

  return {
    sources: unique(rows.map((row) => row.source)),
    stages: unique(rows.map((row) => row.stage)),
    agents: unique(rows.map((row) => row.primary_agent_name)),
  } satisfies ReportOptions;
}

async function fetchOutreachRows(client: any) {
  return fetchAllPages<OutreachRow>((from, to) =>
    client.from('outreach_history').select(OUTREACH_SELECT).order('sent_at', { ascending: false }).range(from, to)
  );
}

async function fetchEngagementRows(client: any) {
  return fetchAllPages<EngagementRow>((from, to) =>
    client.from('sms_lead_engagement').select(ENGAGEMENT_SELECT).order('updated_at', { ascending: false }).range(from, to)
  );
}

function countMap(values: string[]) {
  const map = new Map<string, number>();
  for (const value of values) map.set(value, (map.get(value) || 0) + 1);
  return map;
}

function toBreakdown(values: string[], limit = 8): BreakdownRow[] {
  const counts = countMap(values.filter(Boolean));
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, value]) => ({
      label,
      value,
      percentage: total ? Math.round((value / total) * 1000) / 10 : 0,
    }));
}

function bucketLabel(dateValue: string, bucketSize: number, rangeStart: number) {
  const created = Date.parse(dateValue);
  const bucketStart = new Date(rangeStart + Math.floor((created - rangeStart) / (bucketSize * 86400000)) * bucketSize * 86400000);
  return bucketStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function buildPreviewRows(leads: LeadRow[], outreachRows: OutreachRow[], engagementRows: EngagementRow[]) {
  const outreachByLead = new Map<string, OutreachRow[]>();
  for (const row of outreachRows) {
    if (!row.lead_id) continue;
    const list = outreachByLead.get(row.lead_id) || [];
    list.push(row);
    outreachByLead.set(row.lead_id, list);
  }

  const engagementByLead = new Map<string, EngagementRow[]>();
  for (const row of engagementRows) {
    if (!row.lead_id) continue;
    const list = engagementByLead.get(row.lead_id) || [];
    list.push(row);
    engagementByLead.set(row.lead_id, list);
  }

  return leads.map<LeadPreviewRow>((lead) => {
    const outreach = (outreachByLead.get(lead.id) || []).sort((a, b) => Date.parse(b.sent_at || '') - Date.parse(a.sent_at || ''));
    const engagement = (engagementByLead.get(lead.id) || []).sort((a, b) => Date.parse(b.updated_at || '') - Date.parse(a.updated_at || ''));
    const latestTouch = outreach[0];
    const latestEngagement = engagement[0];
    return {
      id: lead.id,
      createdAt: lead.created_at,
      address: lead.address || '—',
      city: lead.city || '—',
      state: lead.state || '—',
      source: lead.source || 'Unknown',
      stage: lead.stage || 'Unknown',
      enrichmentStatus: lead.enrichment_status,
      outreachStatus: lead.outreach_status,
      primaryAgentName: lead.primary_agent_name,
      prospectScore: Number(lead.prospect_score || 0),
      touchpoints: outreach.length,
      lastTouchAt: latestEngagement?.updated_at || latestTouch?.sent_at || null,
      smsStatus: latestEngagement?.twilio_status || latestTouch?.status || null,
      engagementScore: latestEngagement?.engagement_score != null ? Number(latestEngagement.engagement_score) : null,
      replyIntent: latestEngagement?.reply_intent || null,
      contactName: lead.contact_name,
      contactPhone: lead.contact_phone,
      estimatedNetMonthly: Number(lead.estimated_net_monthly || 0),
      dealRevenue: Number(lead.deal_revenue || 0),
    };
  });
}

function buildTrend(leads: LeadRow[], filters: ReportFilters) {
  if (leads.length === 0) return [];
  const { start, end } = getRangeBounds(filters);
  const totalDays = Math.max(1, Math.ceil((Date.parse(`${end}T23:59:59Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000));
  const bucketSize = totalDays <= 31 ? 1 : totalDays <= 120 ? 7 : 30;
  const rangeStart = Date.parse(`${start}T00:00:00Z`);
  const buckets = new Map<string, { leads: number; scoreTotal: number; contacted: number }>();

  for (const lead of leads) {
    const label = bucketLabel(lead.created_at, bucketSize, rangeStart);
    const bucket = buckets.get(label) || { leads: 0, scoreTotal: 0, contacted: 0 };
    bucket.leads += 1;
    bucket.scoreTotal += Number(lead.prospect_score || 0);
    if (lead.outreach_status && lead.outreach_status !== 'NOT_CONTACTED') bucket.contacted += 1;
    buckets.set(label, bucket);
  }

  return [...buckets.entries()].map(([label, bucket]) => ({
    label,
    leads: bucket.leads,
    avgScore: bucket.leads ? Math.round(bucket.scoreTotal / bucket.leads) : 0,
    contacted: bucket.contacted,
  }));
}

export async function loadAdvancedReportData(client: any, rawFilters: ReportFilters, includeOptions = false) {
  const filters = clampFilters(rawFilters);
  const countQuery = applyLeadFilters(client.from('leads').select('id', { count: 'exact', head: true }), filters);
  const { count, error: countError } = await countQuery;
  if (countError) throw new Error(countError.message);

  const optionsPromise = includeOptions ? fetchLeadOptions(client) : Promise.resolve<ReportOptions | undefined>(undefined);
  if (!count) {
    return {
      report: {
        filters,
        ...(includeOptions ? { options: await optionsPromise } : {}),
        summary: {
          totalLeads: 0,
          averageScore: 0,
          contactedLeads: 0,
          smsDelivered: 0,
          replyRate: 0,
          touchpoints: 0,
          closedRevenue: 0,
          lastLeadAt: null,
          lastOutreachAt: null,
        },
        breakdowns: {
          stages: [],
          sources: [],
          agents: [],
          outreachStatuses: [],
          smsStatuses: [],
        },
        trend: [],
        previewRows: [],
        exportCount: 0,
        dataSources: ['leads', 'outreach_history', 'sms_lead_engagement'],
      } satisfies AdvancedReportPayload,
      exportRows: [] as LeadPreviewRow[],
    };
  }

  const [leads, allOutreach, allEngagement, options] = await Promise.all([
    fetchFilteredLeads(client, filters),
    fetchOutreachRows(client),
    fetchEngagementRows(client),
    optionsPromise,
  ]);

  const leadIds = new Set(leads.map((lead) => lead.id));
  const outreachRows = allOutreach.filter((row) => row.lead_id && leadIds.has(row.lead_id));
  const engagementRows = allEngagement.filter((row) => row.lead_id && leadIds.has(row.lead_id));
  const exportRows = buildPreviewRows(leads, outreachRows, engagementRows);

  const totalScore = leads.reduce((sum, lead) => sum + Number(lead.prospect_score || 0), 0);
  const contactedLeadIds = new Set<string>();
  const replyLeadIds = new Set<string>();
  let deliveredCount = 0;
  let lastOutreachAt: string | null = null;

  for (const lead of leads) {
    if (lead.outreach_status && lead.outreach_status !== 'NOT_CONTACTED') contactedLeadIds.add(lead.id);
  }
  for (const row of outreachRows) {
    if (row.lead_id) contactedLeadIds.add(row.lead_id);
    if (row.lead_id && (row.reply_detected || row.replied_at)) replyLeadIds.add(row.lead_id);
    const candidate = row.delivered_at || row.sent_at || null;
    if (candidate && (!lastOutreachAt || Date.parse(candidate) > Date.parse(lastOutreachAt))) lastOutreachAt = candidate;
  }
  for (const row of engagementRows) {
    if (row.lead_id) contactedLeadIds.add(row.lead_id);
    if (row.lead_id && (row.reply_at || row.reply_intent)) replyLeadIds.add(row.lead_id);
    if (['delivered', 'read'].includes(String(row.twilio_status || ''))) deliveredCount += 1;
    const candidate = row.updated_at || row.delivered_at || null;
    if (candidate && (!lastOutreachAt || Date.parse(candidate) > Date.parse(lastOutreachAt))) lastOutreachAt = candidate;
  }

  const report: AdvancedReportPayload = {
    filters,
    ...(options ? { options } : {}),
    summary: {
      totalLeads: leads.length,
      averageScore: leads.length ? Math.round(totalScore / leads.length) : 0,
      contactedLeads: contactedLeadIds.size,
      smsDelivered: deliveredCount,
      replyRate: deliveredCount ? Math.round((replyLeadIds.size / deliveredCount) * 1000) / 10 : 0,
      touchpoints: outreachRows.length,
      closedRevenue: Math.round(leads.reduce((sum, lead) => sum + Number(lead.deal_revenue || 0), 0)),
      lastLeadAt: leads[0]?.created_at || null,
      lastOutreachAt,
    },
    breakdowns: {
      stages: toBreakdown(leads.map((lead) => lead.stage || 'Unknown')),
      sources: toBreakdown(leads.map((lead) => lead.source || 'Unknown')),
      agents: toBreakdown(leads.map((lead) => lead.primary_agent_name || 'Unassigned')),
      outreachStatuses: toBreakdown(leads.map((lead) => lead.outreach_status || 'Unknown')),
      smsStatuses: toBreakdown(engagementRows.map((row) => row.twilio_status || 'Unknown')),
    },
    trend: buildTrend(leads, filters),
    previewRows: exportRows.slice(0, 25),
    exportCount: exportRows.length,
    dataSources: ['leads', 'outreach_history', 'sms_lead_engagement'],
  };

  return { report, exportRows };
}
