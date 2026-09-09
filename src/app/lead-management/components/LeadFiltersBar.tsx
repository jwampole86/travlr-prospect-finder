'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, ChevronDown, Filter, ShieldCheck, Phone, Star, Users, Crown, Database, AlertTriangle } from 'lucide-react';
import type { Lead } from '@/data/mockLeads';
import type { FilterState } from './LeadManagementClient';

interface LeadFiltersBarProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  leads: Lead[];
  agents?: { id: string; full_name: string }[];
}

const cities = ['Denver', 'Boulder', 'Aspen', 'Breckenridge', 'Colorado Springs', 'Los Angeles', 'San Diego', 'Las Vegas', 'Seattle', 'Miami', 'Austin', 'Dallas'];
const sources = ['Zillow', 'HotPads', 'Craigslist', 'Apartments.com', 'Facebook Marketplace', 'Realtor.com', 'Direct', 'Referral', 'LoopNet', 'MLS', 'Manual Zillow Research'];
const stages = ['New Lead', 'Contacted', 'Interested', 'Proposal Sent', 'Under Contract', 'Live', 'Not a Fit'];
const regStatuses = [
  'Allowed', 'Restricted', 'Prohibited', 'Unknown',
  'ALLOWED', 'ALLOWED_WITH_REQUIREMENTS', 'PERMIT_REQUIRED',
  'RESTRICTED', 'PRIMARY_RESIDENCE_REQUIRED', 'PROHIBITED',
  'UNKNOWN', 'REVIEW_REQUIRED',
];
const scoreRanges = [
  { label: 'Any Score', value: '' },
  { label: '60+', value: '60' },
  { label: '70+', value: '70' },
  { label: '80+', value: '80' },
  { label: '90+', value: '90' },
];
const outreachStatuses = [
  'NOT_CONTACTED', 'ATTEMPTED', 'CONTACTED', 'RESPONDED',
  'FOLLOW_UP', 'APPOINTMENT_SCHEDULED', 'QUALIFIED', 'CONVERTED',
  'NOT_INTERESTED', 'DO_NOT_CONTACT',
];
const enrichmentStatuses = ['PENDING', 'MATCHING', 'ENRICHED', 'PARTIAL', 'NO_MATCH', 'ERROR'];
const sortOptions = [
  { label: 'Highest Priority', value: 'priority_tier_asc' },
  { label: 'Highest Score', value: 'prospectScore_desc' },
  { label: 'Phone Available', value: 'has_phone_desc' },
  { label: 'Newest Leads', value: 'createdAt_desc' },
  { label: 'Oldest Leads', value: 'createdAt_asc' },
  { label: 'Unassigned', value: 'unassigned' },
  { label: 'Recently Assigned', value: 'assigned_at_desc' },
  { label: 'Highest Revenue', value: 'estimatedGrossMonthly_desc' },
];

interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}

function MultiSelectDropdown({ label, options, selected, onChange }: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function toggle(val: string) {
    if (selected.includes(val)) onChange(selected.filter(v => v !== val));
    else onChange([...selected, val]);
  }

  const hasSelection = selected.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-sm border rounded-md bg-background transition-all focus:outline-none focus:ring-2 focus:ring-ring/30 ${hasSelection ? 'border-primary text-primary' : 'border-border text-foreground'}`}
      >
        <span className="text-xs font-medium whitespace-nowrap">
          {hasSelection ? `${label} (${selected.length})` : label}
        </span>
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-52 bg-card border border-border rounded-lg shadow-xl z-40 overflow-hidden fade-in">
          <div className="p-1 max-h-52 overflow-y-auto scrollbar-thin">
            {options.map(opt => (
              <label
                key={`ms-${label}-${opt}`}
                className="flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer hover:bg-muted transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="rounded border-border accent-primary w-3.5 h-3.5"
                />
                <span className="text-xs text-foreground">{opt}</span>
              </label>
            ))}
          </div>
          {hasSelection && (
            <div className="border-t border-border p-1">
              <button
                onClick={() => onChange([])}
                className="w-full text-xs text-red-500 px-3 py-1.5 rounded hover:bg-red-500/10 transition-colors text-left"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LeadFiltersBar({ filters, onChange, leads: _leads, agents = [] }: LeadFiltersBarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [localSearch, setLocalSearch] = useState(filters.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalSearch(filters.search);
  }, [filters.search]);

  const handleSearchChange = useCallback((value: string) => {
    setLocalSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange({ ...filters, search: value });
    }, 350);
  }, [filters, onChange]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function update(key: keyof FilterState, value: unknown) {
    onChange({ ...filters, [key]: value });
  }

  function clearAll() {
    setLocalSearch('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onChange({
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
    });
  }

  const f = filters as FilterState & {
    verifiedOwnerOnly?: boolean;
    verifiedNumberOnly?: boolean;
    phoneAvailableOnly?: boolean;
    manualImportOnly?: boolean;
    outreachStatus?: string;
    enrichmentStatus?: string;
    priorityTier?: string;
  };

  const hasFilters =
    filters.search !== '' ||
    (filters.cities?.length ?? 0) > 0 ||
    filters.beds !== '' ||
    filters.priceMin !== '' ||
    filters.priceMax !== '' ||
    (filters.sources?.length ?? 0) > 0 ||
    (filters.regulationStatuses?.length ?? 0) > 0 ||
    filters.scoreMin !== '' ||
    (filters.stages?.length ?? 0) > 0 ||
    filters.dateFrom !== '' ||
    filters.dateTo !== ''|| (filters.ownerAgentId ??'') !== '' ||
    (filters.assignmentStatus ?? '') !== '' ||
    (filters.verifiedOnly ?? false) ||
    (f.verifiedOwnerOnly ?? false) ||
    (f.verifiedNumberOnly ?? false) ||
    (f.phoneAvailableOnly ?? false) ||
    (f.manualImportOnly ?? false) ||
    (f.outreachStatus ?? '') !== '' ||
    (f.enrichmentStatus ?? '') !== '' ||
    (f.priorityTier ?? '') !== '' ||
    (filters.luxury ?? false) ||
    (filters.fullyVerified ?? false);

  const activeFilterCount = [
    filters.search ? 1 : 0,
    (filters.cities?.length ?? 0) > 0 ? 1 : 0,
    filters.beds ? 1 : 0,
    (filters.priceMin || filters.priceMax) ? 1 : 0,
    (filters.sources?.length ?? 0) > 0 ? 1 : 0,
    (filters.regulationStatuses?.length ?? 0) > 0 ? 1 : 0,
    filters.scoreMin ? 1 : 0,
    (filters.stages?.length ?? 0) > 0 ? 1 : 0,
    (filters.dateFrom || filters.dateTo) ? 1 : 0,
    (filters.ownerAgentId ?? '') !== '' ? 1 : 0,
    (filters.assignmentStatus ?? '') !== '' ? 1 : 0,
    (filters.verifiedOnly ?? false) ? 1 : 0,
    (f.verifiedOwnerOnly ?? false) ? 1 : 0,
    (f.verifiedNumberOnly ?? false) ? 1 : 0,
    (f.phoneAvailableOnly ?? false) ? 1 : 0,
    (f.manualImportOnly ?? false) ? 1 : 0,
    (f.outreachStatus ?? '') !== '' ? 1 : 0,
    (f.enrichmentStatus ?? '') !== '' ? 1 : 0,
    (f.priorityTier ?? '') !== '' ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  return (
    <div className="mb-3 bg-card rounded-lg border border-border overflow-hidden">
      {/* Primary filter row */}
      <div className="flex flex-wrap items-center gap-2 p-3">
        {/* Search */}
        <div className="relative w-full sm:flex-1 sm:min-w-[180px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search name, address, notes, source, tags…"
            value={localSearch}
            onChange={e => handleSearchChange(e.target.value)}
            className="w-full pl-7 pr-3 py-2 text-sm border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 min-h-[44px]"
            aria-label="Search leads"
          />
          {localSearch && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* City multi-select */}
          <MultiSelectDropdown label="City" options={cities} selected={filters.cities ?? []} onChange={v => update('cities', v)} />

          {/* Source multi-select */}
          <MultiSelectDropdown label="Source" options={sources} selected={filters.sources ?? []} onChange={v => update('sources', v)} />

          {/* Ingestion Source filter — shows ALL by default so CSV leads always appear */}
          <select
            value={(filters as any).ingestionSource ?? 'ALL'}
            onChange={e => update('ingestionSource' as keyof FilterState, e.target.value)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md bg-background transition-all focus:outline-none focus:ring-2 focus:ring-ring/30 min-h-[44px] ${((filters as any).ingestionSource ?? 'ALL') !== 'ALL' ? 'border-primary text-primary' : 'border-border text-foreground'}`}
            aria-label="Filter by ingestion source"
            title="Filter by how leads were added"
          >
            <option value="ALL">All Sources</option>
            <option value="MANUAL_CSV">Manual CSV</option>
            <option value="LINK_SYNC">Link Sync</option>
            <option value="MULTI_SOURCE">Multi-Source</option>
          </select>

          {/* Stage multi-select */}
          <MultiSelectDropdown label="Stage" options={stages} selected={filters.stages ?? []} onChange={v => update('stages', v)} />

          {/* Regulation multi-select */}
          <MultiSelectDropdown label="Regulation" options={regStatuses} selected={filters.regulationStatuses ?? []} onChange={v => update('regulationStatuses', v)} />

          {/* Owner / Agent filter */}
          {agents.length > 0 && (
            <select
              value={filters.ownerAgentId ?? ''}
              onChange={e => update('ownerAgentId', e.target.value)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md bg-background transition-all focus:outline-none focus:ring-2 focus:ring-ring/30 min-h-[44px] ${(filters.ownerAgentId ?? '') !== '' ? 'border-primary text-primary' : 'border-border text-foreground'}`}
              aria-label="Filter by owner/agent"
            >
              <option value="">Owner: All</option>
              <option value="unassigned">Unassigned</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          )}

          {/* Assignment status filter */}
          <select
            value={filters.assignmentStatus ?? ''}
            onChange={e => update('assignmentStatus', e.target.value)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md bg-background transition-all focus:outline-none focus:ring-2 focus:ring-ring/30 min-h-[44px] ${(filters.assignmentStatus ?? '') !== '' ? 'border-primary text-primary' : 'border-border text-foreground'}`}
            aria-label="Filter by assignment status"
          >
            <option value="">Assignment: All</option>
            <option value="assigned">Assigned</option>
            <option value="unassigned">Unassigned</option>
          </select>

          {/* ── Verified Lead quick filters ── */}
          <button
            onClick={() => update('verifiedOnly', !filters.verifiedOnly)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md transition-all min-h-[44px] ${
              filters.verifiedOnly ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-400' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            aria-pressed={filters.verifiedOnly}
            title="Show only verified address leads"
          >
            <ShieldCheck size={11} />
            Verified Address
          </button>

          <button
            onClick={() => update('verifiedNumberOnly', !(f.verifiedNumberOnly))}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md transition-all min-h-[44px] ${
              f.verifiedNumberOnly ? 'bg-blue-500/10 border-blue-500/40 text-blue-700 dark:text-blue-400' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            aria-pressed={f.verifiedNumberOnly}
            title="Show only leads with verified phone numbers"
          >
            <Phone size={11} />
            Phone Available
          </button>

          <button
            onClick={() => update('manualImportOnly', !(f.manualImportOnly))}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md transition-all min-h-[44px] ${
              f.manualImportOnly ? 'bg-purple-500/10 border-purple-500/40 text-purple-700 dark:text-purple-400' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            aria-pressed={f.manualImportOnly}
            title="Show only manually verified imported leads"
          >
            <Star size={11} />
            Verified Leads
          </button>

          {/* LUXURY filter — prominent, real server-side filter */}
          <button
            onClick={() => update('luxury', !(filters.luxury ?? false))}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold border rounded-md transition-all min-h-[44px] ${
              filters.luxury
                ? 'bg-amber-500/15 border-amber-500/60 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/30' :'border-amber-500/30 text-amber-600 dark:text-amber-500 hover:bg-amber-500/10 hover:border-amber-500/50'
            }`}
            aria-pressed={filters.luxury ?? false}
            title="Show only Luxury properties (server-side filter)"
          >
            <Crown size={11} />
            LUXURY
          </button>

          {/* Advanced toggle */}
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium border rounded-md transition-all min-h-[44px] ${showAdvanced ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}
            aria-expanded={showAdvanced}
          >
            <Filter size={11} />
            More
            {activeFilterCount > 0 && !showAdvanced && (
              <span className="ml-0.5 bg-primary text-white text-[9px] font-bold px-1 py-0.5 rounded-full leading-none">
                {activeFilterCount}
              </span>
            )}
          </button>

          {hasFilters && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-500 border border-red-500/30 rounded-md hover:bg-red-500/10 transition-all min-h-[44px]"
              aria-label="Clear all filters"
            >
              <X size={11} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <div className="border-t border-border p-3 space-y-3 bg-muted/20">
          <div className="flex flex-wrap gap-2">
            {/* Score range */}
            <select
              value={filters.scoreMin ?? ''}
              onChange={e => update('scoreMin', e.target.value)}
              className={`px-2.5 py-1.5 text-xs font-medium border rounded-md bg-background transition-all focus:outline-none focus:ring-2 focus:ring-ring/30 min-h-[44px] ${filters.scoreMin ? 'border-primary text-primary' : 'border-border text-foreground'}`}
            >
              {scoreRanges.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>

            {/* Beds */}
            <select
              value={filters.beds ?? ''}
              onChange={e => update('beds', e.target.value)}
              className={`px-2.5 py-1.5 text-xs font-medium border rounded-md bg-background transition-all focus:outline-none focus:ring-2 focus:ring-ring/30 min-h-[44px] ${filters.beds ? 'border-primary text-primary' : 'border-border text-foreground'}`}
            >
              <option value="">Beds: Any</option>
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={String(n)}>{n}+ beds</option>)}
            </select>

            {/* Outreach status */}
            <select
              value={f.outreachStatus ?? ''}
              onChange={e => update('outreachStatus', e.target.value)}
              className={`px-2.5 py-1.5 text-xs font-medium border rounded-md bg-background transition-all focus:outline-none focus:ring-2 focus:ring-ring/30 min-h-[44px] ${(f.outreachStatus ?? '') !== '' ? 'border-primary text-primary' : 'border-border text-foreground'}`}
            >
              <option value="">Outreach: All</option>
              {outreachStatuses.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>

            {/* Enrichment status */}
            <select
              value={f.enrichmentStatus ?? ''}
              onChange={e => update('enrichmentStatus', e.target.value)}
              className={`px-2.5 py-1.5 text-xs font-medium border rounded-md bg-background transition-all focus:outline-none focus:ring-2 focus:ring-ring/30 min-h-[44px] ${(f.enrichmentStatus ?? '') !== '' ? 'border-primary text-primary' : 'border-border text-foreground'}`}
            >
              <option value="">Enrichment: All</option>
              {enrichmentStatuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            {/* Priority tier */}
            <select
              value={f.priorityTier ?? ''}
              onChange={e => update('priorityTier', e.target.value)}
              className={`px-2.5 py-1.5 text-xs font-medium border rounded-md bg-background transition-all focus:outline-none focus:ring-2 focus:ring-ring/30 min-h-[44px] ${(f.priorityTier ?? '') !== '' ? 'border-primary text-primary' : 'border-border text-foreground'}`}
            >
              <option value="">Priority: All</option>
              <option value="1">Tier 1 — Verified Owner + Address + Phone</option>
              <option value="2">Tier 2 — Verified Owner + Address</option>
              <option value="3">Tier 3 — Standard</option>
            </select>

            {/* Verified Owner toggle */}
            <button
              onClick={() => update('verifiedOwnerOnly', !(f.verifiedOwnerOnly))}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md transition-all min-h-[44px] ${
                f.verifiedOwnerOnly ? 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-400' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Users size={11} />
              Verified Owner
            </button>

            {/* Fully Verified toggle */}
            <button
              onClick={() => update('fullyVerified', !(filters.fullyVerified ?? false))}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md transition-all min-h-[44px] ${
                filters.fullyVerified ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-400' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <ShieldCheck size={11} />
              Fully Verified
            </button>

            {/* PropertyReach Enrichment Filters */}
            <button
              onClick={() => update('propertyReachEnriched', !(f.propertyReachEnriched ?? false))}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md transition-all min-h-[44px] ${
                (f.propertyReachEnriched ?? false) ? 'bg-teal-500/10 border-teal-500/40 text-teal-700 dark:text-teal-400' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              title="Show only leads enriched via PropertyReach"
            >
              <Database size={11} />
              PR Enriched
            </button>

            <button
              onClick={() => update('needsEnrichment', !(f.needsEnrichment ?? false))}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md transition-all min-h-[44px] ${
                (f.needsEnrichment ?? false) ? 'bg-orange-500/10 border-orange-500/40 text-orange-700 dark:text-orange-400' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              title="Show leads missing owner or phone (eligible for enrichment)"
            >
              <AlertTriangle size={11} />
              Needs Enrichment
            </button>

            <button
              onClick={() => update('enrichmentReviewRequired', !(f.enrichmentReviewRequired ?? false))}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border rounded-md transition-all min-h-[44px] ${
                (f.enrichmentReviewRequired ?? false) ? 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-400' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              title="Show leads with enrichment results pending review"
            >
              <AlertTriangle size={11} />
              Review Required
            </button>

            {/* Price range */}
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                placeholder="Min $"
                value={filters.priceMin ?? ''}
                onChange={e => update('priceMin', e.target.value)}
                className="w-20 px-2 py-1.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring/30 min-h-[44px]"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <input
                type="number"
                placeholder="Max $"
                value={filters.priceMax ?? ''}
                onChange={e => update('priceMax', e.target.value)}
                className="w-20 px-2 py-1.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring/30 min-h-[44px]"
              />
            </div>

            {/* Date range */}
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={filters.dateFrom ?? ''}
                onChange={e => update('dateFrom', e.target.value)}
                className="px-2 py-1.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring/30 min-h-[44px]"
              />
              <span className="text-xs text-muted-foreground">–</span>
              <input
                type="date"
                value={filters.dateTo ?? ''}
                onChange={e => update('dateTo', e.target.value)}
                className="px-2 py-1.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring/30 min-h-[44px]"
              />
            </div>
          </div>

          {/* Saved view: Priority Verified Leads */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Saved Views:</span>
            <button
              onClick={() => onChange({
                ...filters,
                manualImportOnly: true,
                verifiedOnly: true,
                verifiedNumberOnly: true,
                outreachStatus: 'NOT_CONTACTED',
              } as FilterState)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 rounded-md hover:bg-emerald-500/20 transition-colors"
            >
              <Star size={10} />
              Priority Verified Leads
            </button>
            <button
              onClick={() => onChange({ ...filters, assignmentStatus: 'unassigned', verifiedNumberOnly: true } as FilterState)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/30 rounded-md hover:bg-blue-500/20 transition-colors"
            >
              <Phone size={10} />
              Unassigned Phone Leads
            </button>
            {/* Luxury Verified saved view */}
            <button
              onClick={() => onChange({
                ...filters,
                luxury: true,
                fullyVerified: true,
              } as FilterState)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 rounded-md hover:bg-amber-500/20 transition-colors"
            >
              <Crown size={10} />
              Luxury Verified
            </button>
            {/* Luxury + Verified Phone saved view */}
            <button
              onClick={() => onChange({
                ...filters,
                luxury: true,
                verifiedNumberOnly: true,
              } as FilterState)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 rounded-md hover:bg-amber-500/20 transition-colors"
            >
              <Crown size={10} />
              Luxury + Verified Phone
            </button>
          </div>
        </div>
      )}
    </div>
  );
}