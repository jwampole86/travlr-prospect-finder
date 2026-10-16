'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Database, FileText, HeartPulse, Mail, Phone, RefreshCw, Search, Shield, TrendingUp } from 'lucide-react';
import {
  buttonPrimary,
  ErrorBanner,
  EmptyState,
  inputClass,
  LoadingState,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatGrid,
  StatusPill,
} from '@/components/ops';
import IntegrationCard from './IntegrationCard';
import type { ApiIntegration, ApiStatus, IntegrationMeta, LiveIntegrationResult } from './types';

const INTEGRATION_META: IntegrationMeta[] = [
  { id: 'batchdata', name: 'BatchData', category: 'Data Enrichment', icon: Database, iconColor: 'text-blue-400', iconBg: 'bg-blue-500/10', fallbackEnabled: true, fallbackMode: 'simulation', endpoint: '/api/enrichment/batchdata', notes: 'Stage 1 owner/property lookup. Live key validation is read-only.' },
  { id: 'pdl', name: 'People Data Labs', category: 'Contact Enrichment', icon: TrendingUp, iconColor: 'text-purple-400', iconBg: 'bg-purple-500/10', fallbackEnabled: true, fallbackMode: 'simulation', endpoint: '/api/enrichment/pdl-auto-enrich', notes: 'Stage 2 contact enrichment. Health checks validate credentials without enriching leads.' },
  { id: 'propertyreach', name: 'PropertyReach', category: 'Property & Owner Data', icon: Database, iconColor: 'text-indigo-400', iconBg: 'bg-indigo-500/10', fallbackEnabled: false, fallbackMode: 'none', endpoint: '/api/enrichment/propertyreach', notes: 'Owner and property records.' },
  { id: 'rentcast', name: 'RentCast', category: 'Rental Market Data', icon: TrendingUp, iconColor: 'text-teal-400', iconBg: 'bg-teal-500/10', fallbackEnabled: false, fallbackMode: 'none', endpoint: '/api/listings/rentcast', notes: 'Rental market comps and long-term rent checks.' },
  { id: 'trulia', name: 'Trulia (RapidAPI)', category: 'Lead Sourcing', icon: Database, iconColor: 'text-green-400', iconBg: 'bg-green-500/10', fallbackEnabled: false, fallbackMode: 'none', endpoint: '/api/leads/rapidapi-import', notes: 'Rental listing search. Health checks use lightweight provider probes only.' },
  { id: 'zillowDetail', name: 'Zillow Detail Scraper (RapidAPI)', category: 'Lead Sourcing', icon: Database, iconColor: 'text-sky-400', iconBg: 'bg-sky-500/10', fallbackEnabled: false, fallbackMode: 'none', endpoint: '/api/listings/zillow-detail', notes: 'Single-property detail lookup.' },
  { id: 'zillowSearch', name: 'Zillow Scraper API (RapidAPI)', category: 'Lead Sourcing', icon: Database, iconColor: 'text-sky-400', iconBg: 'bg-sky-500/10', fallbackEnabled: false, fallbackMode: 'none', endpoint: '/api/leads/rapidapi-import', notes: 'Regional Zillow search feeding the import pipeline.' },
  { id: 'skipTracing', name: 'Skip Tracing Working API (RapidAPI)', category: 'Contact Enrichment', icon: TrendingUp, iconColor: 'text-purple-400', iconBg: 'bg-purple-500/10', fallbackEnabled: false, fallbackMode: 'none', endpoint: '/api/enrichment/batchdata', notes: 'Skip-trace provider for missing contact details.' },
  { id: 'zillowRealEstate', name: 'Zillow Real Estate API (RapidAPI)', category: 'Lead Sourcing', icon: Database, iconColor: 'text-sky-400', iconBg: 'bg-sky-500/10', fallbackEnabled: false, fallbackMode: 'none', endpoint: '/api/leads/rapidapi-import', notes: 'Expanded Zillow search and analytics.' },
  { id: 'rentCom', name: 'Rent.com API (RapidAPI)', category: 'Lead Sourcing', icon: Database, iconColor: 'text-green-400', iconBg: 'bg-green-500/10', fallbackEnabled: false, fallbackMode: 'none', endpoint: '/api/leads/rapidapi-import', notes: 'Rent.com rental listing search.' },
  { id: 'usPropertyData', name: 'US Property Data (RapidAPI)', category: 'Lead Sourcing', icon: Database, iconColor: 'text-sky-400', iconBg: 'bg-sky-500/10', fallbackEnabled: false, fallbackMode: 'none', endpoint: '/api/leads/rapidapi-import', notes: 'US Property Data listing search and pre-foreclosure flags.' },
  { id: 'padMapper', name: 'PadMapper Rental Scraper (RapidAPI)', category: 'Lead Sourcing', icon: Database, iconColor: 'text-green-400', iconBg: 'bg-green-500/10', fallbackEnabled: false, fallbackMode: 'none', endpoint: '/api/leads/rapidapi-import', notes: 'PadMapper rental search by city or ZIP slug.' },
  { id: 'hotPads', name: 'HotPads Rental Scraper (RapidAPI)', category: 'Lead Sourcing', icon: Database, iconColor: 'text-green-400', iconBg: 'bg-green-500/10', fallbackEnabled: false, fallbackMode: 'none', endpoint: '/api/leads/rapidapi-import', notes: 'HotPads city-level rental search.' },
  { id: 'craigslist', name: 'Craigslist Real Estate Scraper (RapidAPI)', category: 'Lead Sourcing', icon: Database, iconColor: 'text-green-400', iconBg: 'bg-green-500/10', fallbackEnabled: false, fallbackMode: 'none', endpoint: '/api/leads/rapidapi-import', notes: 'Craigslist region search. Health checks avoid the low monthly quota.' },
  { id: 'airdna', name: 'Airdna (RapidAPI)', category: 'Rental Market Data', icon: TrendingUp, iconColor: 'text-teal-400', iconBg: 'bg-teal-500/10', fallbackEnabled: false, fallbackMode: 'none', endpoint: '/api/market/airdna-rental-estimate', notes: 'STR revenue estimates and market analytics.' },
  { id: 'propertyReport', name: 'Property Report (RapidAPI)', category: 'Property & Owner Data', icon: Database, iconColor: 'text-indigo-400', iconBg: 'bg-indigo-500/10', fallbackEnabled: false, fallbackMode: 'none', endpoint: '/api/enrichment/property-report', notes: 'Assessment, deed, and mortgage records.' },
  { id: 'twilio', name: 'Twilio', category: 'SMS & Voice', icon: Phone, iconColor: 'text-red-400', iconBg: 'bg-red-500/10', fallbackEnabled: false, fallbackMode: 'none', endpoint: '/api/sms/send', notes: 'SMS outreach and voice calls.' },
  { id: 'resend', name: 'Resend', category: 'Email Delivery', icon: Mail, iconColor: 'text-sky-400', iconBg: 'bg-sky-500/10', fallbackEnabled: false, fallbackMode: 'none', endpoint: '/api/send-workflow-step', notes: 'Transactional email delivery for workflows.' },
  { id: 'docusign', name: 'DocuSign', category: 'Document Signing', icon: FileText, iconColor: 'text-amber-400', iconBg: 'bg-amber-500/10', fallbackEnabled: false, fallbackMode: 'none', endpoint: '/api/docusign/create-envelope', notes: 'Embedded agreement signing.' },
];

const META_BY_ID = Object.fromEntries(INTEGRATION_META.map((item) => [item.id, item])) as Record<string, IntegrationMeta>;

function prettyIntegrationName(id: string) {
  return id.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildIntegration(meta: IntegrationMeta): ApiIntegration {
  return {
    ...meta,
    status: 'unknown',
    lastCheckedAt: null,
    latencyMs: null,
    message: null,
    envKeySet: false,
  };
}

function fallbackMetaFor(id: string): IntegrationMeta {
  return {
    id,
    name: prettyIntegrationName(id),
    category: 'Integration',
    icon: Shield,
    iconColor: 'text-slate-400',
    iconBg: 'bg-slate-500/10',
    fallbackEnabled: false,
    fallbackMode: 'none',
    endpoint: 'Not documented',
    notes: 'Reported dynamically by /api/integration-health/status.',
  };
}

function mergeLiveResults(current: ApiIntegration[], live: Record<string, LiveIntegrationResult>, checkedAt: string) {
  const currentById = new Map(current.map((item) => [item.id, item]));
  const ids = Array.from(new Set([...INTEGRATION_META.map((item) => item.id), ...current.map((item) => item.id), ...Object.keys(live)]));

  return ids.map((id) => {
    const meta = META_BY_ID[id] || fallbackMetaFor(id);
    const base = currentById.get(id) ? { ...buildIntegration(meta), ...currentById.get(id), ...meta } : buildIntegration(meta);
    const result = live[id];
    if (!result) return base;
    return {
      ...base,
      status: result.status,
      lastCheckedAt: checkedAt,
      latencyMs: result.latencyMs ?? null,
      message: result.message,
      envKeySet: Boolean(result.configured),
    };
  });
}

function averageLatency(items: ApiIntegration[]) {
  const values = items.map((item) => item.latencyMs).filter((value): value is number => value != null);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function relativeTime(value: string | null) {
  if (!value) return 'Never';
  const diffMs = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function IntegrationHealthClient() {
  const [integrations, setIntegrations] = useState<ApiIntegration[]>(INTEGRATION_META.map(buildIntegration));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ApiStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  const refresh = useCallback(async (integrationId?: string) => {
    if (integrationId) setError(null);
    else {
      setRefreshing(true);
      setError(null);
    }
    try {
      const suffix = integrationId ? `?integration=${encodeURIComponent(integrationId)}` : '';
      const res = await fetch(`/api/integration-health/status${suffix}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Failed to refresh integration health');
      const checkedAt = json.checkedAt || new Date().toISOString();
      setIntegrations((current) => mergeLiveResults(current, json.integrations || {}, checkedAt));
      setLastRefreshed(checkedAt);
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : 'Failed to refresh integration health';
      setError(message);
      throw refreshError;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return integrations.filter((integration) => {
      if (filter !== 'all' && integration.status !== filter) return false;
      if (!term) return true;
      return [integration.name, integration.category, integration.endpoint, integration.notes]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [filter, integrations, query]);

  const counts = useMemo(() => ({
    all: integrations.length,
    operational: integrations.filter((item) => item.status === 'operational').length,
    degraded: integrations.filter((item) => item.status === 'degraded').length,
    down: integrations.filter((item) => item.status === 'down').length,
    unknown: integrations.filter((item) => item.status === 'unknown').length,
  }), [integrations]);

  const stats = useMemo(() => {
    const configured = integrations.filter((item) => item.envKeySet).length;
    const attention = integrations.filter((item) => item.status === 'degraded' || item.status === 'down').length;
    const avgLatency = averageLatency(integrations);
    return [
      { label: 'Total integrations', value: integrations.length.toLocaleString(), hint: 'Every key returned by /api/integration-health/status is shown', icon: Database, tone: 'default' as const },
      { label: 'Configured', value: configured.toLocaleString(), hint: `${integrations.length - configured} missing credentials`, icon: Shield, tone: 'primary' as const },
      { label: 'Operational', value: counts.operational.toLocaleString(), hint: `${counts.degraded} degraded · ${counts.down} down`, icon: HeartPulse, tone: counts.operational > 0 ? 'success' as const : 'default' as const },
      { label: 'Avg latency', value: avgLatency != null ? `${avgLatency} ms` : '—', hint: 'Measured from the live health probe responses', icon: Activity, tone: avgLatency != null && avgLatency < 1000 ? 'success' as const : 'warning' as const },
      { label: 'Needs attention', value: attention.toLocaleString(), hint: attention ? 'Live probe returned degraded or down' : 'No integration currently flagged', icon: RefreshCw, tone: attention ? 'warning' as const : 'success' as const },
    ];
  }, [counts.degraded, counts.down, counts.operational, integrations]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={HeartPulse}
        title="Integration Health"
        description="Live, read-only provider checks with no fabricated operational metrics and no accidental lead imports."
        actions={(
          <button type="button" onClick={() => { void refresh(); }} disabled={refreshing} className={buttonPrimary}>
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh all'}
          </button>
        )}
      />

      {error && <ErrorBanner message={error} onRetry={() => { void refresh(); }} />}

      {loading ? (
        <LoadingState label="Running live integration checks…" />
      ) : (
        <>
          <StatGrid stats={stats} columns={5} />

          <Panel title="How tests work" icon={Shield}>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <StatusPill tone="default">Last refreshed {relativeTime(lastRefreshed)}</StatusPill>
              <StatusPill tone="warning">RapidAPI import providers are checked without calling /api/leads/rapidapi-import</StatusPill>
              <StatusPill tone="primary">Targeted card checks use ?integration=&lt;id&gt; to probe one provider at a time</StatusPill>
            </div>
          </Panel>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SegmentedTabs
              tabs={[
                { key: 'all', label: `All (${counts.all})` },
                { key: 'operational', label: `Operational (${counts.operational})` },
                { key: 'degraded', label: `Degraded (${counts.degraded})` },
                { key: 'down', label: `Down (${counts.down})` },
                { key: 'unknown', label: `Unknown (${counts.unknown})` },
              ]}
              value={filter}
              onChange={(value) => setFilter(value as ApiStatus | 'all')}
            />
            <div className="relative w-full lg:max-w-sm">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search integrations, categories, or endpoints…"
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={Search} title="No integrations match this filter" hint="Try a different status tab or a broader search term." />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {filtered.map((integration) => (
                <IntegrationCard key={integration.id} integration={integration} onCheck={refresh} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
