'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { Lead, LeadStage } from '@/data/mockLeads';
import type { RegulationRule } from '@/data/regulations';
import { useRouter, useSearchParams } from 'next/navigation';

import LeadTableHeader from './LeadTableHeader';
import LeadFiltersBar from './LeadFiltersBar';
import LeadTable from './LeadTable';
import type { EnrichmentStatus } from './LeadTable';
import BulkActionBar from './BulkActionBar';
import FilterPresets from './FilterPresets';
import SavedQueriesBar from './SavedQueriesBar';
import RevenueEstimatorPanel from './RevenueEstimatorPanel';
import CSVUploadModal from './CSVUploadModal';
import TPSCSVImportModal from './TPSCSVImportModal';
import RegulationDetailModal from './RegulationDetailModal';
import LeadDetailPanel from './LeadDetailPanel';
import BulkReassignModal from './BulkReassignModal';
import ImportDebugPanel from './ImportDebugPanel';
import CSVAssignModal from './CSVAssignModal';
import RetagPortfolioModal from './RetagPortfolioModal';
import BulkSMSDispatchModal from './BulkSMSDispatchModal';
import BulkAssignAgentZoneModal from './BulkAssignAgentZoneModal';
import SMSSendModal from '@/app/lead-profile/components/SMSSendModal';
import { EmptyLeadsState, EmptyFilteredState, NetworkErrorBanner } from '@/components/ui/LoadingSkeleton';
import { getConfidenceBand } from '@/components/ui/ConfidenceBandBadge';

import { toast } from 'sonner';
import { showErrorWithRetry } from '@/lib/hooks/useRetryToast';
import { leadsService } from '@/lib/services/leadsService';
import { enrichmentService } from '@/lib/services/enrichmentService';
import { trackLeadStageChanged, trackLeadConverted, trackLeadsExported, trackCSVUploaded,  } from '@/lib/mixpanel';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { Upload } from 'lucide-react';
import { recordCSVImported, recordScoreUpdated,  } from '@/lib/services/activityService';


interface LeadManagementClientProps {
  initialLeads: Lead[];
  totalLeads?: number;
  regulations: RegulationRule[];
}

export interface FilterState {
  search: string;
  // Legacy single-value (kept for backward compat)
  city?: string;
  source?: string;
  regulationStatus?: string;
  stage?: string;
  // New multi-select
  cities: string[];
  sources: string[];
  regulationStatuses: string[];
  stages: string[];
  // Numeric
  beds: string;
  priceMin: string;
  priceMax: string;
  scoreMin: string;
  // Date range
  dateFrom: string;
  dateTo: string;
  // Owner / assignment
  ownerAgentId: string;
  assignmentStatus: string;
  // Address verification
  verifiedOnly: boolean;
  // New verified lead filters
  verifiedOwnerOnly?: boolean;
  verifiedNumberOnly?: boolean;
  phoneAvailableOnly?: boolean;
  manualImportOnly?: boolean;
  outreachStatus?: string;
  enrichmentStatus?: string;
  priorityTier?: string;
  // Source type filter: 'ALL' | 'MANUAL_CSV' | 'LINK_SYNC' | 'MULTI_SOURCE'
  ingestionSource?: string;
  // Luxury filters
  luxury?: boolean;
  fullyVerified?: boolean;
}

export const defaultFilters: FilterState = {
  search: '',
  cities: [],
  beds: '',
  priceMin: '',
  priceMax: '',
  sources: [],
  regulationStatuses: [],
  scoreMin: '',
  stages: [],
  dateFrom: '',
  dateTo: '',
  ownerAgentId: '',
  assignmentStatus: '',
  verifiedOnly: false,
  verifiedOwnerOnly: false,
  verifiedNumberOnly: false,
  phoneAvailableOnly: false,
  manualImportOnly: false,
  outreachStatus: '',
  enrichmentStatus: '',
  priorityTier: '',
  ingestionSource: 'ALL',
  luxury: false,
  fullyVerified: false,
};

interface AgentOption {
  id: string;
  full_name: string;
}

// ─── Assignment status badge ──────────────────────────────────────────────────
function AssignmentBadge({ agentName }: { agentName?: string }) {
  if (!agentName) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
        Unassigned
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-500">
      {agentName}
    </span>
  );
}

function exportLeads(leads: Lead[], format: 'csv' | 'json' | 'crm') {
  if (format === 'json') {
    const blob = new Blob([JSON.stringify(leads, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const crmFields = format === 'crm';
  const headers = crmFields
    ? ['First Name', 'Last Name', 'Email', 'Phone', 'Company', 'Address', 'City', 'State', 'Zip', 'Lead Source', 'Lead Stage', 'Notes']
    : ['ID', 'Address', 'City', 'State', 'Zip', 'Beds', 'Baths', 'Price', 'Source', 'Stage', 'Regulation Status', 'Prospect Score', 'Days on Market', 'Last Checked', 'Contact Name', 'Contact Phone', 'Notes', 'Tags', 'Est. Net Monthly', 'Created At'];

  const rows = leads.map((l) => {
    if (crmFields) {
      const nameParts = (l.contactName ?? '').split(' ');
      return [
        nameParts[0] ?? '',
        nameParts.slice(1).join(' ') ?? '',
        '',
        l.contactPhone ?? '',
        '',
        l.address,
        l.city,
        l.state,
        l.zip,
        l.source,
        l.stage,
        l.notes,
      ];
    }
    return [
      l.id, l.address, l.city, l.state, l.zip, l.beds, l.baths, l.price,
      l.source, l.stage, l.regulationStatus, l.prospectScore, l.daysOnMarket,
      l.lastChecked, l.contactName ?? '', l.contactPhone ?? '', l.notes,
      l.tags.join('; '), l.estimatedNetMonthly, l.createdAt,
    ];
  });

  const csvContent = [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leads-${format}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Mobile scroll indicator wrapper ─────────────────────────────────────────
// This component wraps the table on mobile to show a scroll hint
function MobileScrollHint({ children }: { children: React.ReactNode }) {
  const [showHint, setShowHint] = React.useState(true);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollLeft > 20) setShowHint(false);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="relative">
      <div ref={ref} className="overflow-x-auto -webkit-overflow-scrolling-touch scrollbar-thin">
        {children}
      </div>
      {showHint && (
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-background/80 to-transparent md:hidden flex items-center justify-end pr-2">
          <span className="text-[10px] text-muted-foreground rotate-90 font-medium">scroll</span>
        </div>
      )}
    </div>
  );
}

export default function LeadManagementClient({
  initialLeads,
  totalLeads = 0,
  regulations,
}: LeadManagementClientProps) {
  const [allLeads, setAllLeads] = useState<Lead[]>(initialLeads);
  const [loading, setLoading] = useState(initialLeads.length === 0);
  const [networkError, setNetworkError] = useState(false);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [sortKey, setSortKey] = useState<keyof Lead>('prospectScore');
  const [sortDir, setSortDir] = useState<'asc\' | \'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [estimatorLead, setEstimatorLead] = useState<Lead | null>(null);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [tpsCsvModalOpen, setTpsCsvModalOpen] = useState(false);
  const [csvAssignModalOpen, setCsvAssignModalOpen] = useState(false);
  const [regulationCity, setRegulationCity] = useState<string | null>(null);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const [assignSequenceModalOpen, setAssignSequenceModalOpen] = useState(false);
  const [retagPortfolioModalOpen, setRetagPortfolioModalOpen] = useState(false);
  const [bulkSMSModalOpen, setBulkSMSModalOpen] = useState(false);
  const [assignAgentZoneModalOpen, setAssignAgentZoneModalOpen] = useState(false);
  const [smsLead, setSmsLead] = useState<Lead | null>(null);
  const [activeQueryId, setActiveQueryId] = useState<string | null>(null);
  // Hot leads first toggle
  const [hotLeadsFirst, setHotLeadsFirst] = useState(true);
  // Server-side pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [serverTotal, setServerTotal] = useState(totalLeads);
  const [serverTotalPages, setServerTotalPages] = useState(Math.ceil(totalLeads / 50));
  const [serverLoading, setServerLoading] = useState(false);
  const PAGE_SIZE = 50;
  // Debounce ref for filter changes — prevents server fetch on every filter keystroke
  const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bulk enrichment state
  const [bulkEnriching, setBulkEnriching] = useState(false);
  const [bulkReScoring, setBulkReScoring] = useState(false);
  const [bulkReValidating, setBulkReValidating] = useState(false);
  // Source counts for the source filter summary
  const [sourceCounts, setSourceCounts] = useState<{
    all: number; csv: number; linkSync: number; multiSource: number;
  }>({ all: 0, csv: 0, linkSync: 0, multiSource: 0 });
  const [syncFailures, setSyncFailures] = useState<string[]>([]);
  // Agents for owner filter
  const [agents, setAgents] = useState<AgentOption[]>([]);
  // Assignment map: leadId → agentName
  const [assignmentMap, setAssignmentMap] = useState<Record<string, string>>({});
  // Enrichment status map: leadId → EnrichmentStatus
  const [enrichmentMap, setEnrichmentMap] = useState<Record<string, EnrichmentStatus>>({});

  const { filterLeadsByPortfolio, selectedPortfolio } = usePortfolio();
  const { user, role } = useAuth();
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
    };
  }, []);

  // Role guard: agents only see leads assigned to them
  const isAdminOrTeamLead = role === 'admin' || (user?.user_metadata?.role === 'team_lead');
  const currentUserId = user?.id;

  // ── URL-based lead detail navigation ──────────────────────────────────────
  // When a lead is opened, navigate to the Property Profile page.
  const openDetailLead = useCallback((lead: Lead | null) => {
    if (lead) {
      router.push(`/lead-profile?id=${lead.id}`);
    } else {
      setDetailLead(null);
    }
  }, [router]);

  // ── Server-side paginated fetch ────────────────────────────────────────────
  const fetchServerPage = useCallback(async (
    page: number,
    currentFilters: FilterState,
    currentSortKey: keyof Lead,
    currentSortDir: 'asc\' | \'desc',
    stateCode: string
  ) => {
    setServerLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));
      params.set('sortKey', String(currentSortKey));
      params.set('sortDir', currentSortDir);
      if (stateCode && stateCode !== 'all') params.set('stateCode', stateCode);
      if (currentFilters.search) params.set('search', currentFilters.search);
      if (currentFilters.beds) params.set('beds', currentFilters.beds);
      if (currentFilters.priceMin) params.set('priceMin', currentFilters.priceMin);
      if (currentFilters.priceMax) params.set('priceMax', currentFilters.priceMax);
      if (currentFilters.scoreMin) params.set('scoreMin', currentFilters.scoreMin);
      if (currentFilters.dateFrom) params.set('dateFrom', currentFilters.dateFrom);
      if (currentFilters.dateTo) params.set('dateTo', currentFilters.dateTo);
      currentFilters.cities?.forEach(c => params.append('cities', c));
      currentFilters.sources?.forEach(s => params.append('sources', s));
      currentFilters.regulationStatuses?.forEach(r => params.append('regulationStatuses', r));
      currentFilters.stages?.forEach(s => params.append('stages', s));
      // Source type filter — pass to server (default ALL shows both CSV and link leads)
      if ((currentFilters as any).ingestionSource && (currentFilters as any).ingestionSource !== 'ALL') {
        params.set('ingestionSource', (currentFilters as any).ingestionSource);
      }
      // Luxury + verification server-side filters
      if (currentFilters.luxury) params.set('luxury', 'true');
      if (currentFilters.fullyVerified) params.set('fullyVerified', 'true');
      if (currentFilters.verifiedOwnerOnly) params.set('verifiedOwnerOnly', 'true');
      if (currentFilters.verifiedNumberOnly) params.set('verifiedNumberOnly', 'true');
      if (currentFilters.phoneAvailableOnly) params.set('phoneAvailableOnly', 'true');
      if (currentFilters.assignmentStatus) params.set('assignmentStatus', currentFilters.assignmentStatus);
      if (currentFilters.priorityTier) params.set('priorityTier', currentFilters.priorityTier);
      // NOTE: Do NOT send isSynthetic param by default.
      // The API defaults isSynthetic=null which means "show all leads" (no synthetic filter).
      // This ensures leads with is_synthetic=NULL (e.g. newly imported) are always visible.

      const res = await fetch(`/api/leads/paginated?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      const mapped: Lead[] = (json.leads || []).map((d: Record<string, unknown>) => ({
        id: String(d.id),
        address: String(d.address || ''),
        city: String(d.city || ''),
        state: String(d.state || ''),
        zip: String(d.zip || ''),
        lat: Number(d.lat || 0),
        lng: Number(d.lng || 0),
        beds: Number(d.beds || 0),
        baths: Number(d.baths || 0),
        price: Number(d.price || 0),
        priceType: (d.price_type as 'sale' | 'rent') || 'rent',
        source: String(d.source || ''),
        stage: String(d.stage || 'New Lead') as Lead['stage'],
        regulationStatus: String(d.regulation_status || 'Unknown') as Lead['regulationStatus'],
        prospectScore: Number(d.prospect_score || 0),
        daysOnMarket: Number(d.days_on_market || 0),
        lastChecked: String(d.last_checked || ''),
        listingUrl: d.listing_url ? String(d.listing_url) : '',
        contactName: d.contact_name ? String(d.contact_name) : undefined,
        contactPhone: d.contact_phone ? String(d.contact_phone) : undefined,
        contactEmail: undefined,
        notes: String(d.notes || ''),
        tags: Array.isArray(d.tags) ? d.tags : [],
        estimatedADR: Number(d.estimated_adr || 0),
        estimatedOccupancy: Number(d.estimated_occupancy || 0),
        estimatedGrossMonthly: Number(d.estimated_gross_monthly || 0),
        estimatedNetMonthly: Number(d.estimated_net_monthly || 0),
        photos: Array.isArray(d.photos) ? d.photos : [],
        createdAt: String(d.created_at || ''),
        updatedAt: String(d.updated_at || ''),
        isSynthetic: Boolean(d.is_synthetic),
        contactInfoRequested: Boolean(d.contact_info_requested),
        addrValidated: d.addr_validated !== undefined && d.addr_validated !== null ? Boolean(d.addr_validated) : undefined,
        addrMismatch: Boolean(d.addr_mismatch),
        // Verification fields
        verificationStatus: d.verification_status || 'CANDIDATE',
        verificationScore: d.verification_score !== undefined && d.verification_score !== null ? Number(d.verification_score) : 0,
        verificationMethod: d.verification_method || undefined,
        verificationTimestamp: d.verification_timestamp || undefined,
        verifiedAddress: d.verified_address || undefined,
        normalizedAddress: d.normalized_address || undefined,
        apn: d.apn || undefined,
        propertyProvider: d.property_provider || undefined,
        providerPropertyId: d.provider_property_id || undefined,
        county: d.county || undefined,
        verificationNotes: d.verification_notes || undefined,
        // Source provenance fields — needed for client-side source filters
        source_type: d.source_type || undefined,
        ingestion_source: d.ingestion_source || undefined,
        is_verified_lead: Boolean(d.is_verified_lead),
        verified_owner: Boolean(d.verified_owner),
        verified_number: Boolean(d.verified_number),
        has_phone: Boolean(d.has_phone),
        import_batch_id: d.import_batch_id || undefined,
        is_multi_source: Boolean(d.is_multi_source),
        outreach_status: d.outreach_status || undefined,
        enrichment_status: d.enrichment_status || undefined,
        priority_tier: d.priority_tier !== undefined && d.priority_tier !== null ? Number(d.priority_tier) : undefined,
        // Luxury fields
        luxury: Boolean(d.luxury),
        fully_verified: Boolean(d.fully_verified),
        verified_number_source: d.verified_number_source || undefined,
        verified_owner_source: d.verified_owner_source || undefined,
      }));

      setAllLeads(mapped);
      setServerTotal(json.total ?? 0);
      setServerTotalPages(json.totalPages ?? 1);
    } catch (err) {
      const isNetworkErr = err instanceof TypeError;
      if (isNetworkErr) setNetworkError(true);
    } finally {
      setServerLoading(false);
      setLoading(false);
    }
  }, [PAGE_SIZE]);

  // On mount: if ?lead= param is present, open that lead
  useEffect(() => {
    const leadId = searchParams.get('lead');
    if (leadId && allLeads.length > 0) {
      const found = allLeads.find(l => l.id === leadId);
      if (found) setDetailLead(found);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, allLeads.length]);

  // On mount: apply URL params to filters (view, priority, assignmentStatus, verifiedOnly, phoneAvailableOnly)
  useEffect(() => {
    const view = searchParams.get('view');
    const priority = searchParams.get('priority');
    const assignmentStatusParam = searchParams.get('assignmentStatus');
    const verifiedOnlyParam = searchParams.get('verifiedOnly');
    const phoneAvailableOnlyParam = searchParams.get('phoneAvailableOnly');
    // Multi-value ?regulation= param (e.g. ?regulation=Allowed&regulation=Restricted)
    const regulationParams = searchParams.getAll('regulation');
    const regulationParam = searchParams.get('regulation'); // legacy single-value fallback
    const stageParam = searchParams.get('stage');
    // Multi-value stages param (e.g. ?stages=Contacted&stages=Interested)
    const stagesParam = searchParams.getAll('stages');
    const scoreMinParam = searchParams.get('scoreMin');
    const luxuryParam = searchParams.get('luxury');
    const fullyVerifiedParam = searchParams.get('fullyVerified');
    const priorityParam2 = searchParams.get('priorityTier');
    // actionNeeded param: score >= 75 AND stage = 'New Lead'
    const actionNeededParam = searchParams.get('actionNeeded');
    // excludeTerminal=true: exclude terminal stages (Not a Fit, Live) from results
    const excludeTerminalParam = searchParams.get('excludeTerminal');

    const updates: Partial<FilterState> = {};

    // Verified Priority view: use fullyVerified server-side filter (fully_verified DB column)
    // This matches the canonical Dashboard "Fully Verified" count.
    if (view === 'verified-priority') {
      updates.fullyVerified = true;
    }

    // Luxury views
    if (view === 'luxury') {
      updates.luxury = true;
    }
    if (view === 'luxury-verified') {
      updates.luxury = true;
      updates.fullyVerified = true;
    }
    if (view === 'luxury-phone') {
      updates.luxury = true;
      updates.verifiedNumberOnly = true;
    }

    if (luxuryParam === 'true') {
      updates.luxury = true;
    }
    if (fullyVerifiedParam === 'true') {
      updates.fullyVerified = true;
    }

    // Legacy ?priority=high → scoreMin=75
    if (priority === 'high') {
      updates.scoreMin = '75';
    }

    // Direct scoreMin param (e.g. ?scoreMin=75)
    if (scoreMinParam) {
      updates.scoreMin = scoreMinParam;
    }

    if (priorityParam2) {
      updates.priorityTier = priorityParam2;
    }

    if (assignmentStatusParam === 'assigned' || assignmentStatusParam === 'unassigned') {
      updates.assignmentStatus = assignmentStatusParam;
    }

    if (verifiedOnlyParam === 'true') {
      updates.fullyVerified = true;
    }

    if (phoneAvailableOnlyParam === 'true') {
      updates.phoneAvailableOnly = true;
    }

    if (regulationParams.length > 1) {
      // Multi-value: ?regulation=Allowed&regulation=Restricted
      updates.regulationStatuses = regulationParams;
    } else if (regulationParam) {
      // Legacy single-value: ?regulation=Allowed
      updates.regulationStatuses = [regulationParam];
    }

    // Canonical city regulation status click-through from City Regulations dashboard
    const cityRegulationStatusParam = searchParams.get('cityRegulationStatus');
    if (cityRegulationStatusParam) {
      updates.regulationStatuses = [cityRegulationStatusParam];
    }

    // Multi-value ?stages= param (from Active Pipeline and Action Needed links)
    if (stagesParam.length > 0) {
      updates.stages = stagesParam;
    } else if (stageParam && stageParam !== 'active') {
      // Legacy single ?stage= param
      updates.stages = [stageParam];
    }

    // ?actionNeeded=true → score >= 75 AND stage = 'New Lead'
    // This ensures the Action Needed KPI click returns exactly the same
    // population as the dashboard count.
    if (actionNeededParam === 'true') {
      updates.scoreMin = '75';
      updates.stages = ['New Lead'];
    }

    // ?excludeTerminal=true → exclude terminal stages (Not a Fit, Live)
    // Used by High Priority click-through to match the canonical definition.
    if (excludeTerminalParam === 'true') {
      const terminalStages = ['Not a Fit', 'Live'];
      // Apply as a negative filter: if no stages set, exclude terminal stages
      // by setting a flag that the server query will use
      updates.stages = updates.stages?.length
        ? updates.stages.filter(s => !terminalStages.includes(s))
        : []; // empty stages = all non-terminal (handled by server with excludeTerminal flag)
    }

    if (Object.keys(updates).length > 0) {
      setFilters(prev => ({ ...prev, ...updates }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial load — only fires when server-side didn't pre-populate (initialLeads is empty)
  useEffect(() => {
    if (initialLeads.length === 0) {
      fetchServerPage(1, defaultFilters, 'prospectScore', 'desc', selectedPortfolio.stateCode || '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced filter/sort/page/portfolio effect — triggers server fetch with 300ms debounce
  // This prevents rapid re-fetches when the user is typing or changing multiple filters
  useEffect(() => {
    if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
    filterDebounceRef.current = setTimeout(() => {
      fetchServerPage(currentPage, filters, sortKey, sortDir, selectedPortfolio.stateCode || '');
    }, 300);
    return () => {
      if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sortKey, sortDir, currentPage, selectedPortfolio.stateCode]);

  // Load agents and assignment map
  useEffect(() => {
    async function loadAgents() {
      if (!user) return;
      try {
        const { data: agentsData } = await supabase
          .from('agent_profiles').select('id, full_name').eq('owner_user_id', user.id).eq('status', 'active').order('full_name');
        if (agentsData) setAgents(agentsData as AgentOption[]);

        // Load assignment map
        const { data: perms } = await supabase
          .from('agent_lead_permissions').select('surplus_lead_id, agent_id');
        if (perms && agentsData) {
          const agentById: Record<string, string> = {};
          (agentsData as AgentOption[]).forEach(a => { agentById[a.id] = a.full_name; });
          const map: Record<string, string> = {};
          perms.forEach((p: any) => {
            if (p.surplus_lead_id && p.agent_id && agentById[p.agent_id]) {
              map[p.surplus_lead_id] = agentById[p.agent_id];
            }
          });
          setAssignmentMap(map);
        }
      } catch { /* silent */ }
    }
    loadAgents();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Load source counts — shows how many prospects came from each ingestion source
  useEffect(() => {
    async function loadSourceCounts() {
      try {
        const [allRes, csvRes, linkRes, multiRes] = await Promise.all([
          // All canonical prospects: include leads where is_synthetic is NULL or false
          supabase.from('leads').select('*', { count: 'exact', head: true })
            .or('is_synthetic.is.null,is_synthetic.eq.false'),
          // Manual CSV: match all known CSV/manual import source variants
          supabase.from('leads').select('*', { count: 'exact', head: true })
            .or('is_synthetic.is.null,is_synthetic.eq.false')
            .or('ingestion_source.eq.MANUAL_CSV,ingestion_source.eq.MANUAL_RESEARCH_CSV,ingestion_source.eq.CSV_IMPORT,source_type.eq.MANUAL_VERIFIED_IMPORT,source_type.eq.MANUAL_RESEARCH_CSV'),
          // Link Sync: ingestion_source=LINK_SYNC and no import_batch_id
          supabase.from('leads').select('*', { count: 'exact', head: true })
            .or('is_synthetic.is.null,is_synthetic.eq.false')
            .eq('ingestion_source', 'LINK_SYNC').is('import_batch_id', null),
          // Multi-Source: leads with multiple source categories
          supabase.from('leads').select('*', { count: 'exact', head: true })
            .or('is_synthetic.is.null,is_synthetic.eq.false')
            .eq('is_multi_source', true),
        ]);
        setSourceCounts({
          all: allRes.count ?? 0,
          csv: csvRes.count ?? 0,
          linkSync: linkRes.count ?? 0,
          multiSource: multiRes.count ?? 0,
        });
      } catch { /* silent */ }
    }
    loadSourceCounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverTotal]);

  // Load enrichment status map for all leads — deferred so the table renders first
  useEffect(() => {
    if (!user) return;
    // Defer enrichment loading by 800ms so the lead table renders immediately
    const timer = setTimeout(async () => {
      try {
        // Only fetch enrichments for leads currently on this page (not all leads)
        const leadIds = allLeads.map(l => l.id);
        if (leadIds.length === 0) return;

        const { data: enrichments } = await supabase
          .from('lead_enrichments')
          .select('lead_id, stage1_completed_at, stage2_completed_at, stage3_completed_at, last_enriched_at, stage1_provider, stage2_provider, stage3_provider, enrichment_status')
          .in('lead_id', leadIds);
        if (!enrichments) return;

        // Fetch best confidence scores only for current page leads, limited to 200 rows
        const [emailsRes, phonesRes] = await Promise.all([
          supabase.from('enriched_emails').select('lead_id, confidence').in('lead_id', leadIds).order('confidence', { ascending: false }).limit(200),
          supabase.from('enriched_phones').select('lead_id, confidence').in('lead_id', leadIds).order('confidence', { ascending: false }).limit(200),
        ]);

        // Build best confidence per lead
        const emailConfMap: Record<string, number> = {};
        (emailsRes.data || []).forEach((e: any) => {
          if (!emailConfMap[e.lead_id] || e.confidence > emailConfMap[e.lead_id]) {
            emailConfMap[e.lead_id] = e.confidence;
          }
        });
        const phoneConfMap: Record<string, number> = {};
        (phonesRes.data || []).forEach((p: any) => {
          if (!phoneConfMap[p.lead_id] || p.confidence > phoneConfMap[p.lead_id]) {
            phoneConfMap[p.lead_id] = p.confidence;
          }
        });

        const map: Record<string, EnrichmentStatus> = {};
        enrichments.forEach((e: any) => {
          map[e.lead_id] = {
            stage1_completed_at: e.stage1_completed_at,
            stage2_completed_at: e.stage2_completed_at,
            stage3_completed_at: e.stage3_completed_at,
            last_enriched_at: e.last_enriched_at,
            stage1_provider: e.stage1_provider,
            stage2_provider: e.stage2_provider,
            stage3_provider: e.stage3_provider,
            enrichment_status: e.enrichment_status,
            email_confidence: emailConfMap[e.lead_id] ?? null,
            phone_confidence: phoneConfMap[e.lead_id] ?? null,
          };
        });
        setEnrichmentMap(map);
      } catch { /* silent */ }
    }, 800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, allLeads.length]);

  // Portfolio-scoped leads — with server-side pagination, allLeads is already the current page
  // We still apply client-side role scoping for agents
  const portfolioLeads = useMemo(() => allLeads, [allLeads]);

  // Role-scoped leads: agents only see their assigned leads
  const leads = useMemo(() => {
    if (isAdminOrTeamLead) return portfolioLeads;
    return portfolioLeads.filter((l) => {
      const agentId = (l as any).agent_id;
      return !agentId || agentId === currentUserId;
    });
  }, [portfolioLeads, isAdminOrTeamLead, currentUserId]);

  // Helper: can the current user act on a given lead?
  const canActOnLead = useCallback((lead: Lead): boolean => {
    if (isAdminOrTeamLead) return true;
    const agentId = (lead as any).agent_id;
    return !agentId || agentId === currentUserId;
  }, [isAdminOrTeamLead, currentUserId]);

  const loadLeads = useCallback(async (bypassCache = false) => {
    // With server-side pagination, refresh means re-fetching the current page
    await fetchServerPage(currentPage, filters, sortKey, sortDir, selectedPortfolio.stateCode || '');
  }, [currentPage, filters, sortKey, sortDir, selectedPortfolio.stateCode, fetchServerPage]);

  // Filter logic — with server-side pagination, allLeads is already filtered/sorted
  // We keep a minimal client-side pass for owner/assignment filters not in the API
  const filteredLeads = useMemo(() => {
    let result = [...leads];

    // Owner / agent filter (client-side only — not in server API)
    if (filters.ownerAgentId) {
      if (filters.ownerAgentId === 'unassigned') {
        result = result.filter((l) => !assignmentMap[l.id]);
      } else {
        const agentName = agents.find(a => a.id === filters.ownerAgentId)?.full_name;
        result = result.filter((l) => assignmentMap[l.id] === agentName);
      }
    }

    // Assignment status filter (client-side only)
    if (filters.assignmentStatus === 'assigned') {
      result = result.filter((l) => !!assignmentMap[l.id]);
    } else if (filters.assignmentStatus === 'unassigned') {
      result = result.filter((l) => !assignmentMap[l.id]);
    }

    // Verified Only filter — show only leads with confirmed property verification
    // Uses fully_verified DB column (generated column: verified_owner AND verified_number AND verified_address set)
    if (filters.verifiedOnly) {
      result = result.filter((l) =>
        (l as any).fully_verified === true ||
        (l as any).fullyVerified === true
      );
    }

    // Verified Owner filter
    if ((filters as any).verifiedOwnerOnly) {
      result = result.filter((l) => (l as any).verified_owner === true || (l as any).verifiedOwner === true);
    }

    // Verified Number / Phone Available filter
    if ((filters as any).verifiedNumberOnly || (filters as any).phoneAvailableOnly) {
      result = result.filter((l) =>
        (l as any).verified_number === true ||
        (l as any).verifiedNumber === true ||
        (l as any).has_phone === true ||
        !!(l.contactPhone)
      );
    }

    // Manual verified import filter
    if ((filters as any).manualImportOnly) {
      result = result.filter((l) =>
        (l as any).source_type === 'MANUAL_VERIFIED_IMPORT' ||
        (l as any).is_verified_lead === true ||
        (l.tags || []).includes('MANUAL_VERIFIED_IMPORT')
      );
    }

    // Outreach status filter
    if ((filters as any).outreachStatus) {
      result = result.filter((l) => (l as any).outreach_status === (filters as any).outreachStatus);
    }

    // Enrichment status filter
    if ((filters as any).enrichmentStatus) {
      result = result.filter((l) => (l as any).enrichment_status === (filters as any).enrichmentStatus);
    }

    // Priority tier filter
    if ((filters as any).priorityTier) {
      const tier = parseInt((filters as any).priorityTier);
      result = result.filter((l) => (l as any).priority_tier === tier);
    }

    return result;
  }, [leads, filters, assignmentMap, agents]);

  // With server-side pagination, paginatedLeads IS filteredLeads (already paginated by server)
  const paginatedLeads = useMemo(() => {
    if (!hotLeadsFirst) return filteredLeads;
    // Sort hot leads (80+) first, then warm (60-79), then cold (<60)
    const bandOrder: Record<string, number> = { hot: 0, warm: 1, cold: 2 };
    return [...filteredLeads].sort((a, b) => {
      const bandA = bandOrder[getConfidenceBand(a.prospectScore)] ?? 2;
      const bandB = bandOrder[getConfidenceBand(b.prospectScore)] ?? 2;
      if (bandA !== bandB) return bandA - bandB;
      return b.prospectScore - a.prospectScore;
    });
  }, [filteredLeads, hotLeadsFirst]);
  const totalPages = serverTotalPages;

  const handleSort = useCallback(
    (key: keyof Lead) => {
      if (key === sortKey) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('desc');
      }
      // Reset to page 1 when sort changes
      setCurrentPage(1);
    },
    [sortKey]
  );

  const handleStageChange = useCallback(async (id: string, stage: LeadStage) => {
    const lead = allLeads.find((l) => l.id === id);
    const fromStage = lead?.stage ?? 'Unknown';
    const currentVersion = (lead as (Lead & { version?: number }) | undefined)?.version ?? 1;

    // Optimistic update
    setAllLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, stage, updatedAt: new Date().toISOString().split('T')[0] } : l))
    );
    setDetailLead((prev) => prev && prev.id === id ? { ...prev, stage } : prev);

    let result = await leadsService.updateStageWithVersion(id, stage, currentVersion);

    if (result === 'conflict') {
      // Revert optimistic update and warn user
      setAllLeads((prev) => prev.map((l) => (l.id === id ? { ...l, stage: fromStage as LeadStage } : l)));
      setDetailLead((prev) => prev && prev.id === id ? { ...prev, stage: fromStage as LeadStage } : prev);
      toast.error('This lead was updated by someone else. Please refresh and try again.', { duration: 6000 });
      return;
    }

    if (result === 'error') {
      // Revert and show generic error
      setAllLeads((prev) => prev.map((l) => (l.id === id ? { ...l, stage: fromStage as LeadStage } : l)));
      setDetailLead((prev) => prev && prev.id === id ? { ...prev, stage: fromStage as LeadStage } : prev);
      toast.error('Failed to update stage. Please try again.');
      return;
    }

    toast.success(`Stage updated to "${stage}"`);
    trackLeadStageChanged({
      leadId: id,
      fromStage,
      toStage: stage,
      city: lead?.city,
      source: lead?.source,
      prospectScore: lead?.prospectScore,
    });
    if (stage === 'Live') {
      trackLeadConverted({
        leadId: id,
        fromStage,
        toStage: stage,
        city: lead?.city,
        source: lead?.source,
        prospectScore: lead?.prospectScore,
      });
    }
  }, [allLeads]);

  const handleDelete = useCallback(async (id: string) => {
    setAllLeads((prev) => prev.filter((l) => l.id !== id));
    setDetailLead((prev) => {
      if (prev && prev.id === id) {
        // Clear URL param when closing panel via delete
        const params = new URLSearchParams(window.location.search);
        params.delete('lead');
        const qs = params.toString();
        window.history.replaceState(null, '', `/lead-management${qs ? `?${qs}` : ''}`);
        return null;
      }
      return prev;
    });
    await leadsService.deleteLead(id);
    toast.success('Lead deleted');
  }, []);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    setAllLeads((prev) => prev.filter((l) => !selectedIds.has(l.id)));
    toast.success(`${selectedIds.size} leads deleted`);
    setSelectedIds(new Set());
    await leadsService.bulkDelete(ids);
  }, [selectedIds]);

  const handleBulkStageChange = useCallback(
    async (stage: LeadStage) => {
      const ids = Array.from(selectedIds);
      setAllLeads((prev) =>
        prev.map((l) =>
          selectedIds.has(l.id) ? { ...l, stage, updatedAt: new Date().toISOString().split('T')[0] } : l
        )
      );
      toast.success(`${selectedIds.size} leads moved to "${stage}"`);
      trackLeadStageChanged({ leadId: 'bulk', fromStage: 'multiple', toStage: stage, bulkCount: selectedIds.size });
      setSelectedIds(new Set());
      await leadsService.bulkUpdateStage(ids, stage);
    },
    [selectedIds]
  );

  const handleBulkExport = useCallback(
    (format: 'csv' | 'json' | 'crm') => {
      const selectedLeads = filteredLeads.filter((l) => selectedIds.has(l.id));
      if (selectedLeads.length === 0) return;
      exportLeads(selectedLeads, format);
      toast.success(`${selectedLeads.length} leads exported as ${format.toUpperCase()}`);
      trackLeadsExported({ format, count: selectedLeads.length });
    },
    [filteredLeads, selectedIds]
  );

  const handleAddToList = useCallback(async () => {
    const selectedLeads = leads.filter((l) => selectedIds.has(l.id));
    if (selectedLeads.length === 0) return;

    toast.loading(`Adding ${selectedLeads.length} leads to list...`, { id: 'add-to-list' });

    try {
      let result = await leadsService.bulkInsert(selectedLeads);
      if (result.error) {
        toast.error(`Failed to add leads: ${result.error}`, { id: 'add-to-list' });
      } else {
        const dbLeads = await leadsService.getAll(true);
        if (dbLeads.length > 0) {
          setAllLeads(dbLeads);
        }
        toast.success(`${selectedLeads.length} leads added to list`, { id: 'add-to-list' });
        setSelectedIds(new Set());
      }
    } catch {
      toast.error('Failed to add leads to list', { id: 'add-to-list' });
    }
  }, [leads, selectedIds]);

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedIds(new Set(filteredLeads.map((l) => l.id)));
      } else {
        setSelectedIds(new Set());
      }
    },
    [filteredLeads]
  );

  const handleSelectOne = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleCSVImport = useCallback(async (newLeads: Lead[]) => {
    setCsvModalOpen(false);
    toast.success(`CSV import complete — refreshing Prospect Finder...`);
    trackCSVUploaded({ rowCount: newLeads.length, success: true });

    // Immediately refresh from server so CSV-imported leads appear in Prospect Finder
    // This replaces the old approach of adding local placeholder leads to state
    // which caused CSV leads to appear temporarily then disappear on next server fetch
    setTimeout(() => {
      fetchServerPage(1, filters, sortKey, sortDir, selectedPortfolio.stateCode || '');
    }, 800);

    // Record a single CSV import activity event with the actual count
    const primaryState = newLeads[0]?.state ?? undefined;
    recordCSVImported({
      count: newLeads.length,
      state: primaryState,
      batchLabel: `${newLeads.length} lead${newLeads.length !== 1 ? 's' : ''} imported`,
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sortKey, sortDir, selectedPortfolio.stateCode, fetchServerPage]);

  const handleRefreshLead = useCallback((id: string) => {
    toast.success('Lead refreshed', { description: 'Listing data updated.' });
  }, []);

  const handleBulkEnrichOwners = useCallback(async () => {
    const selectedLeads = leads.filter((l) => selectedIds.has(l.id));
    if (selectedLeads.length === 0) return;
    setBulkEnriching(true);
    const failures: string[] = [];
    let successCount = 0;
    for (const lead of selectedLeads) {
      try {
        let result = await enrichmentService.runStage1(lead.id, lead.address, lead.prospectScore);
        if (result.success) successCount++;
        else {
          failures.push(`${lead.address}: ${result.message}`);
          showErrorWithRetry({
            message: `Enrichment failed: ${lead.address}`,
            detail: result.message,
            onRetry: () => enrichmentService.runStage1(lead.id, lead.address, lead.prospectScore),
          });
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'Unknown error';
        failures.push(`${lead.address}: ${detail}`);
        showErrorWithRetry({
          message: `Enrichment error: ${lead.address}`,
          detail,
          onRetry: () => enrichmentService.runStage1(lead.id, lead.address, lead.prospectScore),
        });
      }
    }
    setBulkEnriching(false);
    if (failures.length > 0) setSyncFailures(failures);
    if (successCount > 0) toast.success(`Bulk enrichment complete: ${successCount}/${selectedLeads.length} succeeded`);
    setSelectedIds(new Set());
  }, [leads, selectedIds]);

  // Re-Score Selected: recalculate prospect scores for filtered cohort and update sequence auto-enrollment
  const handleBulkReScore = useCallback(async () => {
    const selectedLeads = leads.filter((l) => selectedIds.has(l.id));
    if (selectedLeads.length === 0) return;
    setBulkReScoring(true);
    let updated = 0;
    let autoEnrolled = 0;
    const supabaseClient = createClient();

    try {
      for (const lead of selectedLeads) {
        // Recalculate score using weighted factors
        const baseScore = lead.prospectScore ?? 50;
        const bedsBonus = Math.min((lead.beds ?? 0) * 3, 15);
        const priceBonus = lead.price > 0 ? Math.min(Math.floor((lead.price / 500000) * 10), 10) : 0;
        const domPenalty = Math.min((lead.daysOnMarket ?? 0) / 10, 15);
        const regulationBonus = lead.regulationStatus === 'Allowed' ? 10 : lead.regulationStatus === 'Restricted' ? -5 : 0;
        const newScore = Math.max(0, Math.min(100, Math.round(baseScore + bedsBonus + priceBonus - domPenalty + regulationBonus)));

        // Update score in DB
        await supabaseClient
          .from('leads')
          .update({ prospect_score: newScore, updated_at: new Date().toISOString() })
          .eq('id', lead.id);

        // Update local state
        setAllLeads((prev) =>
          prev.map((l) => l.id === lead.id ? { ...l, prospectScore: newScore } : l)
        );
        updated++;

        // Record score activity if materially changed
        recordScoreUpdated({
          leadId: lead.id,
          address: lead.address,
          state: lead.state,
          previousScore: lead.prospectScore ?? 0,
          newScore,
          trigger: 'Manual re-score',
        }).catch(() => {});

        // Check sequence auto-enrollment conditions: enroll if score crosses threshold
        if (newScore >= 60 && (lead.prospectScore ?? 0) < 60) {
          // Lead newly qualifies — find active sequences with score-based auto-enroll
          const { data: sequences } = await supabaseClient
            .from('follow_up_sequences')
            .select('id, name, auto_enroll_trigger')
            .eq('is_active', true)
            .not('auto_enroll_trigger', 'is', null);

          if (sequences && sequences.length > 0) {
            for (const seq of sequences) {
              const trigger = seq.auto_enroll_trigger as any;
              const threshold = trigger?.score_threshold ?? 60;
              if (newScore >= threshold) {
                await supabaseClient
                  .from('sequence_enrollments')
                  .upsert({
                    lead_id: lead.id,
                    sequence_id: seq.id,
                    enrolled_at: new Date().toISOString(),
                    status: 'active',
                    current_step: 0,
                    enroll_reason: `re-score: ${lead.prospectScore ?? 0} → ${newScore}`,
                  }, { onConflict: 'lead_id,sequence_id', ignoreDuplicates: true });
                autoEnrolled++;
              }
            }
          }
        }
      }

      toast.success(
        `Re-scored ${updated} leads${autoEnrolled > 0 ? ` · ${autoEnrolled} auto-enrolled into sequences` : ''}`,
        { description: 'Prospect scores recalculated. Sequence enrollment conditions updated.' }
      );
      setSelectedIds(new Set());
    } catch (err) {
      toast.error('Re-score partially failed — check console for details');
      console.error('Re-score error:', err);
    } finally {
      setBulkReScoring(false);
    }
  }, [leads, selectedIds]);

  // Refresh assignment map after reassignment
  const handleReassigned = useCallback(async () => {
    setSelectedIds(new Set());
    // Reload assignment map
    try {
      const { data: perms } = await supabase
        .from('agent_lead_permissions')
        .select('surplus_lead_id, agent_id');
      if (perms) {
        const agentById: Record<string, string> = {};
        agents.forEach(a => { agentById[a.id] = a.full_name; });
        const map: Record<string, string> = {};
        perms.forEach((p: any) => {
          if (p.surplus_lead_id && p.agent_id && agentById[p.agent_id]) {
            map[p.surplus_lead_id] = agentById[p.agent_id];
          }
        });
        setAssignmentMap(map);
      }
    } catch { /* silent */ }
  }, [agents, supabase]);

  const regulationForCity = regulations.find((r) => r.city === regulationCity);

  const handleSendSMS = useCallback((lead: Lead) => {
    setSmsLead(lead);
  }, []);

  const handleBulkArchive = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const supabaseClient = createClient();
      await supabaseClient
        .from('leads')
        .update({ archived_at: new Date().toISOString() })
        .in('id', ids);
      setAllLeads(prev => prev.filter(l => !selectedIds.has(l.id)));
      toast.success(`${ids.length} leads archived`);
      setSelectedIds(new Set());
    } catch {
      toast.error('Failed to archive leads');
    }
  }, [selectedIds]);

  const handleBulkReValidation = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkReValidating(true);
    try {
      let successCount = 0;
      // Fire re-validation for each selected lead (uses 7-day cache so cached leads skip API)
      await Promise.allSettled(
        ids.slice(0, 20).map(async (id) => {
          const lead = allLeads.find(l => l.id === id);
          if (!lead) return;
          const res = await fetch('/api/enrichment/validate-and-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leadId: id, address: lead.address, city: lead.city, state: lead.state }),
          });
          if (res.ok) successCount++;
        })
      );
      toast.success(`Re-validation triggered for ${Math.min(ids.length, 20)} leads`);
      setSelectedIds(new Set());
    } catch {
      toast.error('Re-validation failed');
    } finally {
      setBulkReValidating(false);
    }
  }, [selectedIds, allLeads]);

  const handleExportFilteredBatch = useCallback(() => {
    if (filteredLeads.length === 0) {
      toast.error('No leads in current filter to export');
      return;
    }
    exportLeads(filteredLeads, 'csv');
    toast.success(`Exported ${filteredLeads.length} filtered leads as CSV`);
  }, [filteredLeads]);

  return (
    <div className="flex h-full relative">
      <div className="flex-1 flex flex-col min-w-0 px-3 sm:px-6 py-4 sm:py-5 max-w-screen-2xl mx-auto w-full">
        {/* Role guard banner for agents */}
        {!isAdminOrTeamLead && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-blue-500/8 border border-blue-500/20 rounded-lg text-xs text-blue-700">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            <span>Showing only leads assigned to you. Contact an admin to access other leads.</span>
          </div>
        )}

        <LeadTableHeader
          totalCount={serverTotal}
          filteredCount={serverTotal}
          onOpenCSV={() => setCsvModalOpen(true)}
          onLeadsRefreshed={loadLeads}
          onExportFiltered={() => {
            exportLeads(filteredLeads, 'csv');
            toast.success(`${filteredLeads.length} filtered leads exported`);
          }}
        />

        {/* Synthetic data notice — shown when the dataset contains synthetic leads */}
        {allLeads.some((l) => (l as any).isSynthetic) && (
          <div className="mb-3 flex items-start gap-2 px-3 py-2.5 bg-amber-500/8 border border-amber-500/20 rounded-lg text-xs text-amber-700">
            <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <span>
              <strong>Synthetic data notice:</strong> Some leads in this dataset are deterministically generated for testing purposes and are labeled <code className="bg-amber-500/10 px-1 rounded text-[10px]">synthetic</code> in their tags. They are not real scraped listings. Real homeowner-submitted leads are not synthetic.
            </span>
          </div>
        )}

        {/* Admin controls row */}
        {isAdminOrTeamLead && (
          <div className="mb-3 flex items-center justify-end gap-2">
            <button
              onClick={() => setCsvAssignModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors font-medium"
            >
              <Upload size={12} />
              CSV Bulk Assign
            </button>
            <button
              onClick={() => setTpsCsvModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors font-medium"
            >
              <Upload size={12} />
              Import Phone Leads (TPS)
            </button>
            <button
              onClick={() => setDebugPanelOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-orange-200 text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors font-medium"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
              Admin: Import Debug
            </button>
          </div>
        )}

        {/* Sync failure alerts */}
        {syncFailures.length > 0 && (
          <div className="mb-3 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-red-600">Sync / Enrichment Failures ({syncFailures.length})</p>
              <button onClick={() => setSyncFailures([])} className="text-[10px] text-muted-foreground hover:text-foreground">Dismiss</button>
            </div>
            <ul className="space-y-0.5">
              {syncFailures.slice(0, 5).map((f, i) => (
                <li key={i} className="text-[11px] text-red-700">{f}</li>
              ))}
              {syncFailures.length > 5 && <li className="text-[11px] text-muted-foreground">+{syncFailures.length - 5} more</li>}
            </ul>
          </div>
        )}

        <LeadFiltersBar
          filters={filters}
          onChange={(f) => { setFilters(f); setCurrentPage(1); }}
          leads={leads}
          agents={agents}
        />

        {/* Source counts summary — shows live counts per ingestion source */}
        {(sourceCounts.all > 0 || serverTotal > 0) && (
          <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
            {[
              { label: 'All Prospects', value: serverTotal, key: 'ALL', color: 'text-foreground bg-muted border-border' },
              { label: 'Manual CSV', value: sourceCounts.csv, key: 'MANUAL_CSV', color: 'text-emerald-700 bg-emerald-500/8 border-emerald-500/20' },
              { label: 'Link Sync', value: sourceCounts.linkSync, key: 'LINK_SYNC', color: 'text-blue-700 bg-blue-500/8 border-blue-500/20' },
              { label: 'Multi-Source', value: sourceCounts.multiSource, key: 'MULTI_SOURCE', color: 'text-purple-700 bg-purple-500/8 border-purple-500/20' },
            ].map(({ label, value, key, color }) => (
              <button
                key={key}
                onClick={() => {
                  setFilters(prev => ({ ...prev, ingestionSource: key } as FilterState));
                  setCurrentPage(1);
                }}
                className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium border rounded-md transition-all ${color} ${
                  ((filters as any).ingestionSource ?? 'ALL') === key ? 'ring-2 ring-offset-1 ring-primary/40' : 'opacity-80 hover:opacity-100'
                }`}
              >
                <span>{label}:</span>
                <span className="font-bold">{value.toLocaleString()}</span>
              </button>
            ))}
          </div>
        )}

        {/* Filter Presets + Select All Matching row */}
        <div className="flex items-center justify-between mb-3 -mt-1">
          <button
            onClick={() => {
              if (filteredLeads.length > 0) {
                setSelectedIds(new Set(filteredLeads.map((l) => l.id)));
                toast.success(`Selected all ${filteredLeads.length} leads on this page`);
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-all"
            title="Select all leads matching current filters"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Select Page ({filteredLeads.length.toLocaleString()})
          </button>
          <FilterPresets
            currentFilters={filters}
            onApply={(f) => { setFilters(f); setCurrentPage(1); }}
            defaultFilters={defaultFilters}
          />
        </div>

        {/* Saved Queries Bar — quick-access named queries with one-click apply */}
        <div className="mb-3">
          <SavedQueriesBar
            currentFilters={filters}
            defaultFilters={defaultFilters}
            onApply={(f) => { setFilters(f); setCurrentPage(1); }}
            activeQueryId={activeQueryId}
            onActiveQueryChange={setActiveQueryId}
          />
        </div>

        {/* ── Confidence Band Summary + Hot Leads Toggle ── */}
        <div className="mb-3 flex items-center justify-between gap-3 px-3 py-2.5 bg-card border border-border rounded-xl">
          <div className="flex items-center gap-3 flex-wrap">
            {(['hot', 'warm', 'cold'] as const).map(band => {
              const count = paginatedLeads.filter(l => getConfidenceBand(l.prospectScore) === band).length;
              const colors: Record<string, string> = {
                hot: 'text-orange-600 bg-orange-500/10 border-orange-500/20',
                warm: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
                cold: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
              };
              const icons: Record<string, React.ReactNode> = {
                hot: <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2c0 0-4 4-4 8.5C8 14.5 9.5 16 12 16s4-1.5 4-5.5C16 6 12 2 12 2zm0 12c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>,
                warm: <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>,
                cold: <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M22 11h-4.17l3.24-3.24-1.41-1.42L15 11h-2V9l4.66-4.66-1.42-1.41L13 6.17V2h-2v4.17L7.76 2.93 6.34 4.34 11 9v2H9L4.34 6.34 2.93 7.76 6.17 11H2v2h4.17l-3.24 3.24 1.41 1.42L9 13h2v2l-4.66 4.66 1.42 1.41L11 17.83V22h2v-4.17l3.24 3.24 1.42-1.41L13 15v-2h2l4.66 4.66 1.41-1.42L17.83 13H22v-2z"/></svg>,
              };
              return (
                <div key={band} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium ${colors[band]}`}>
                  {icons[band]}
                  <span className="capitalize">{band}</span>
                  <span className="font-bold">{count}</span>
                </div>
              );
            })}
          </div>
          <button
            onClick={() => setHotLeadsFirst(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
              hotLeadsFirst
                ? 'bg-orange-500/10 text-orange-600 border-orange-500/30' :'bg-background border-border text-muted-foreground hover:bg-muted'
            }`}
            title="Surface hot leads (80+) first in the queue"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2c0 0-4 4-4 8.5C8 14.5 9.5 16 12 16s4-1.5 4-5.5C16 6 12 2 12 2zm0 12c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>
            Hot Leads First
          </button>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <BulkActionBar
              count={selectedIds.size}
              onDelete={handleBulkDelete}
              onStageChange={handleBulkStageChange}
              onDeselect={() => setSelectedIds(new Set())}
              onAddToList={handleAddToList}
              onExport={handleBulkExport}
              onReassign={() => setReassignModalOpen(true)}
              onAssignAgentZone={() => setAssignAgentZoneModalOpen(true)}
              onMassEnrich={handleBulkEnrichOwners}
              massEnriching={bulkEnriching}
              onAssignSequence={() => setAssignSequenceModalOpen(true)}
              onReScore={handleBulkReScore}
              reScoring={bulkReScoring}
              onRetagPortfolio={() => setRetagPortfolioModalOpen(true)}
              onBulkSMS={() => setBulkSMSModalOpen(true)}
              onArchive={handleBulkArchive}
              onTriggerReValidation={handleBulkReValidation}
              reValidating={bulkReValidating}
              onExportFilteredBatch={handleExportFilteredBatch}
              onMassEmail={() => {
                const selectedLeads = leads.filter((l) => selectedIds.has(l.id));
                if (selectedLeads.length === 0) return;
                toast.success(`Opening email composer for ${selectedLeads.length} leads…`, {
                  description: 'Navigate to Email Templates to send a bulk campaign.',
                });
              }}
            />
          </div>
        )}

        {loading ? (
          <div className="flex-1 overflow-hidden">
            <div className="w-full overflow-hidden">
              {/* Header skeleton */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
                <div className="h-4 w-4 bg-muted animate-pulse rounded" />
                {['w-40', 'w-16', 'w-20', 'w-24', 'w-28', 'w-20', 'w-24', 'w-20', 'w-16', 'w-24'].map((w, i) => (
                  <div key={`th-${i}`} className={`h-3 ${w} bg-muted animate-pulse rounded`} />
                ))}
              </div>
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={`lskel-${i}`} className="flex items-center gap-3 px-4 py-3 border-b border-border">
                  <div className="h-4 w-4 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                  <div className="h-6 w-28 bg-muted animate-pulse rounded-full" />
                  <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                </div>
              ))}
            </div>
          </div>
        ) : networkError ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="w-full max-w-md">
              <NetworkErrorBanner
                onRetry={() => {
                  setNetworkError(false);
                  setLoading(true);
                  leadsService.getAll(true).then(dbLeads => {
                    if (dbLeads.length > 0) setAllLeads(dbLeads);
                  }).catch(() => setNetworkError(true)).finally(() => setLoading(false));
                }}
              />
            </div>
          </div>
        ) : paginatedLeads.length === 0 ? (
          <div className="flex-1">
            {serverTotal === 0 ? (
              <EmptyLeadsState />
            ) : (
              <EmptyFilteredState onClear={() => setFilters(defaultFilters)} />
            )}
          </div>
        ) : (
          <div>
            <MobileScrollHint>
              <LeadTable
                leads={paginatedLeads}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                selectedIds={selectedIds}
                onSelectAll={handleSelectAll}
                onSelectOne={handleSelectOne}
                onStageChange={handleStageChange}
                onDelete={handleDelete}
                onOpenEstimator={setEstimatorLead}
                onRefresh={handleRefreshLead}
                onShowRegulation={setRegulationCity}
                onOpenDetail={openDetailLead}
                canActOnLead={canActOnLead}
                assignmentMap={assignmentMap}
                enrichmentMap={enrichmentMap}
                onSendSMS={handleSendSMS}
              />
            </MobileScrollHint>
            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 px-1">
                <p className="text-xs text-muted-foreground">
                  Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, serverTotal)} of {serverTotal.toLocaleString()} leads
                  {serverLoading && <span className="ml-2 text-muted-foreground/60">Loading…</span>}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2 py-1 text-xs rounded border border-border bg-card hover:bg-muted disabled:opacity-40 transition-colors"
                  >«</button>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2 py-1 text-xs rounded border border-border bg-card hover:bg-muted disabled:opacity-40 transition-colors"
                  >‹</button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const page = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`px-2.5 py-1 text-xs rounded border transition-colors ${page === currentPage ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card hover:bg-muted'}`}
                      >{page}</button>
                    );
                  })}
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 text-xs rounded border border-border bg-card hover:bg-muted disabled:opacity-40 transition-colors"
                  >›</button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2 py-1 text-xs rounded border border-border bg-card hover:bg-muted disabled:opacity-40 transition-colors"
                  >»</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {estimatorLead && (
        <RevenueEstimatorPanel
          lead={estimatorLead}
          onClose={() => setEstimatorLead(null)}
        />
      )}

      {detailLead && (
        <LeadDetailPanel
          lead={detailLead}
          onClose={() => openDetailLead(null)}
          onStageChange={handleStageChange}
          onDelete={(id) => { handleDelete(id); openDetailLead(null); }}
        />
      )}

      <CSVUploadModal
        open={csvModalOpen}
        onClose={() => setCsvModalOpen(false)}
        onImport={handleCSVImport}
      />

      <TPSCSVImportModal
        open={tpsCsvModalOpen}
        onClose={() => setTpsCsvModalOpen(false)}
        onImportComplete={(newCount) => {
          setTpsCsvModalOpen(false);
          toast.success(`TPS import complete — ${newCount} leads processed. Refreshing lead list and dashboard…`);
          // Refresh lead list immediately
          loadLeads();
          // Refresh again after 3s to catch any async DB writes
          setTimeout(() => loadLeads(), 3000);
        }}
      />

      {csvAssignModalOpen && (
        <CSVAssignModal
          agents={agents}
          onClose={() => setCsvAssignModalOpen(false)}
          onAssigned={handleReassigned}
        />
      )}

      {regulationForCity && (
        <RegulationDetailModal
          regulation={regulationForCity}
          onClose={() => setRegulationCity(null)}
        />
      )}

      {reassignModalOpen && (
        <BulkReassignModal
          selectedCount={selectedIds.size}
          selectedIds={Array.from(selectedIds)}
          onClose={() => setReassignModalOpen(false)}
          onReassigned={handleReassigned}
        />
      )}

      {debugPanelOpen && (
        <ImportDebugPanel onClose={() => setDebugPanelOpen(false)} />
      )}

      {retagPortfolioModalOpen && (
        <RetagPortfolioModal
          selectedIds={Array.from(selectedIds)}
          onClose={() => setRetagPortfolioModalOpen(false)}
          onComplete={() => {
            setSelectedIds(new Set());
            loadLeads();
          }}
        />
      )}

      {bulkSMSModalOpen && (
        <BulkSMSDispatchModal
          selectedLeads={filteredLeads
            .filter(l => selectedIds.has(l.id))
            .map(l => ({
              id: l.id,
              contactName: l.contactName,
              contactPhone: l.contactPhone,
              address: l.address,
              city: l.city,
              state: l.state,
              zip: (l as { zip?: string }).zip,
              ownerName: (l as { ownerName?: string }).ownerName,
              verifiedOwner: (l as { verifiedOwner?: boolean }).verifiedOwner,
              verifiedNumber: (l as { verifiedNumber?: boolean }).verifiedNumber,
              verifiedAddress: (l as { verifiedAddress?: string }).verifiedAddress,
            }))}
          onClose={() => setBulkSMSModalOpen(false)}
          onSent={(count) => {
            toast.success(`${count} SMS messages dispatched`);
            setBulkSMSModalOpen(false);
          }}
          agentName="Jennifer"
        />
      )}

      {smsLead && (
        <SMSSendModal
          leadId={smsLead.id}
          leadName={smsLead.contactName || smsLead.address}
          recipientPhone={smsLead.contactPhone || ''}
          leadAddress={smsLead.address}
          onClose={() => setSmsLead(null)}
          onSent={() => setSmsLead(null)}
        />
      )}

      {assignAgentZoneModalOpen && (
        <BulkAssignAgentZoneModal
          selectedCount={selectedIds.size}
          selectedIds={Array.from(selectedIds)}
          onClose={() => setAssignAgentZoneModalOpen(false)}
          onAssigned={() => {
            setSelectedIds(new Set());
            loadLeads();
          }}
        />
      )}
    </div>
  );
}