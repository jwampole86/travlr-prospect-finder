'use client';

import React, { useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { Radio, CheckCircle2, XCircle, AlertCircle, RefreshCw, Shield, Zap, Database, AlertTriangle, ChevronDown, ChevronUp, Search, Activity, CheckSquare, Square, Play, Pause, Plus,  } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeadSource {
  id: string;
  name: string;
  key: string;
  type: 'scraper' | 'csv' | 'api';
  status: 'active' | 'paused' | 'error' | 'pending';
  lastSync: string | null;
  recordsTotal: number;
  recordsReal: number;
  recordsSynthetic: number;
  verificationScore: number; // 0-100
  markets: string[];
  isSelected: boolean;
  errorMessage?: string;
}

interface SyncLog {
  id: string;
  sourceId: string;
  sourceName: string;
  timestamp: string;
  recordsFetched: number;
  recordsVerified: number;
  recordsRejected: number;
  status: 'success' | 'partial' | 'failed';
  notes: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const INITIAL_SOURCES: LeadSource[] = [
  {
    id: 'zillow-md',
    name: 'Zillow',
    key: 'zillow',
    type: 'scraper',
    status: 'active',
    lastSync: '2026-09-01T14:30:00Z',
    recordsTotal: 1842,
    recordsReal: 1791,
    recordsSynthetic: 51,
    verificationScore: 97,
    markets: ['MD', 'MA', 'VA'],
    isSelected: false,
  },
  {
    id: 'hotpads-ma',
    name: 'HotPads',
    key: 'hotpads',
    type: 'scraper',
    status: 'active',
    lastSync: '2026-09-01T13:15:00Z',
    recordsTotal: 934,
    recordsReal: 901,
    recordsSynthetic: 33,
    verificationScore: 96,
    markets: ['MA', 'CT'],
    isSelected: false,
  },
  {
    id: 'csv-import-1',
    name: 'CSV Import — Baltimore Q3',
    key: 'csv_import',
    type: 'csv',
    status: 'active',
    lastSync: '2026-08-28T09:00:00Z',
    recordsTotal: 412,
    recordsReal: 412,
    recordsSynthetic: 0,
    verificationScore: 100,
    markets: ['MD'],
    isSelected: false,
  },
  {
    id: 'trulia-va',
    name: 'Trulia',
    key: 'trulia',
    type: 'scraper',
    status: 'paused',
    lastSync: '2026-08-25T11:00:00Z',
    recordsTotal: 287,
    recordsReal: 241,
    recordsSynthetic: 46,
    verificationScore: 84,
    markets: ['VA'],
    isSelected: false,
  },
  {
    id: 'rentcom-ct',
    name: 'Rent.com',
    key: 'rentcom',
    type: 'scraper',
    status: 'error',
    lastSync: '2026-08-30T08:45:00Z',
    recordsTotal: 156,
    recordsReal: 98,
    recordsSynthetic: 58,
    verificationScore: 63,
    errorMessage: 'Rate limit exceeded — retry in 2h',
    markets: ['CT', 'MA'],
    isSelected: false,
  },
];

const SYNC_LOGS: SyncLog[] = [
  {
    id: 'log-1',
    sourceId: 'zillow-md',
    sourceName: 'Zillow',
    timestamp: '2026-09-01T14:30:00Z',
    recordsFetched: 312,
    recordsVerified: 304,
    recordsRejected: 8,
    status: 'success',
    notes: '8 records rejected: missing address fingerprint',
  },
  {
    id: 'log-2',
    sourceId: 'hotpads-ma',
    sourceName: 'HotPads',
    timestamp: '2026-09-01T13:15:00Z',
    recordsFetched: 187,
    recordsVerified: 180,
    recordsRejected: 7,
    status: 'success',
    notes: '7 records flagged as duplicates',
  },
  {
    id: 'log-3',
    sourceId: 'rentcom-ct',
    sourceName: 'Rent.com',
    timestamp: '2026-08-30T08:45:00Z',
    recordsFetched: 0,
    recordsVerified: 0,
    recordsRejected: 0,
    status: 'failed',
    notes: 'Rate limit exceeded — HTTP 429',
  },
  {
    id: 'log-4',
    sourceId: 'trulia-va',
    sourceName: 'Trulia',
    timestamp: '2026-08-25T11:00:00Z',
    recordsFetched: 95,
    recordsVerified: 79,
    recordsRejected: 16,
    status: 'partial',
    notes: '16 records lacked valid listing URLs',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: LeadSource['status']) {
  switch (status) {
    case 'active': return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    case 'paused': return 'text-amber-600 bg-amber-50 border-amber-200';
    case 'error': return 'text-red-600 bg-red-50 border-red-200';
    case 'pending': return 'text-blue-600 bg-blue-50 border-blue-200';
  }
}

function statusIcon(status: LeadSource['status']) {
  switch (status) {
    case 'active': return <CheckCircle2 className="w-3.5 h-3.5" />;
    case 'paused': return <Pause className="w-3.5 h-3.5" />;
    case 'error': return <XCircle className="w-3.5 h-3.5" />;
    case 'pending': return <AlertCircle className="w-3.5 h-3.5" />;
  }
}

function scoreColor(score: number) {
  if (score >= 90) return 'text-emerald-600';
  if (score >= 70) return 'text-amber-600';
  return 'text-red-600';
}

function logStatusBadge(status: SyncLog['status']) {
  switch (status) {
    case 'success': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'partial': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'failed': return 'bg-red-50 text-red-700 border-red-200';
  }
}

function formatRelative(iso: string | null) {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Source Card ──────────────────────────────────────────────────────────────

function SourceCard({
  source,
  onToggleSelect,
  onToggleStatus,
  onSync,
}: {
  source: LeadSource;
  onToggleSelect: (id: string) => void;
  onToggleStatus: (id: string) => void;
  onSync: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const realPct = source.recordsTotal > 0
    ? Math.round((source.recordsReal / source.recordsTotal) * 100)
    : 0;

  return (
    <div className={`rounded-2xl border bg-white dark:bg-gray-900 transition-all ${
      source.isSelected ? 'border-gray-900 dark:border-white shadow-md' : 'border-gray-200 dark:border-gray-700'
    }`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <button
            onClick={() => onToggleSelect(source.id)}
            className="mt-0.5 flex-shrink-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            {source.isSelected
              ? <CheckSquare className="w-4 h-4 text-gray-900 dark:text-white" />
              : <Square className="w-4 h-4" />}
          </button>

          {/* Source info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-gray-900 dark:text-white">{source.name}</span>
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusColor(source.status)}`}>
                {statusIcon(source.status)}
                {source.status.charAt(0).toUpperCase() + source.status.slice(1)}
              </span>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                {source.type.toUpperCase()}
              </span>
            </div>

            <div className="flex items-center gap-4 mt-2 flex-wrap">
              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <Activity className="w-3 h-3" />
                Last sync: {formatRelative(source.lastSync)}
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <Database className="w-3 h-3" />
                {source.recordsTotal.toLocaleString()} total
              </div>
              <div className="flex items-center gap-1 text-xs">
                <Shield className="w-3 h-3 text-emerald-500" />
                <span className={`font-semibold ${scoreColor(source.verificationScore)}`}>
                  {source.verificationScore}% verified
                </span>
              </div>
            </div>

            {/* Real vs Synthetic bar */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-gray-500 dark:text-gray-400">Real listings</span>
                <span className="font-semibold text-gray-700 dark:text-gray-300">
                  {source.recordsReal.toLocaleString()} / {source.recordsTotal.toLocaleString()} ({realPct}%)
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${realPct}%` }}
                />
              </div>
              {source.recordsSynthetic > 0 && (
                <p className="text-[11px] text-amber-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {source.recordsSynthetic} synthetic records will be excluded from sync
                </p>
              )}
            </div>

            {source.errorMessage && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-800">
                <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {source.errorMessage}
              </div>
            )}

            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {source.markets.map(m => (
                <span key={m} className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium">
                  {m}
                </span>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => onSync(source.id)}
              disabled={source.status === 'error'}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Sync now"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onToggleStatus(source.id)}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              title={source.status === 'active' ? 'Pause source' : 'Activate source'}
            >
              {source.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => setExpanded(x => !x)}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{source.recordsReal.toLocaleString()}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Real listings</p>
            </div>
            <div>
              <p className="text-lg font-bold text-amber-600">{source.recordsSynthetic.toLocaleString()}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Synthetic (excluded)</p>
            </div>
            <div>
              <p className={`text-lg font-bold ${scoreColor(source.verificationScore)}`}>{source.verificationScore}%</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Authenticity score</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LeadSourcesManagerPage() {
  const [sources, setSources] = useState<LeadSource[]>(INITIAL_SOURCES);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'paused' | 'error'>('all');
  const [showLogs, setShowLogs] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [bulkSyncing, setBulkSyncing] = useState(false);

  const selectedSources = sources.filter(s => s.isSelected);
  const allSelected = sources.length > 0 && sources.every(s => s.isSelected);

  const filtered = sources.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.markets.some(m => m.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = filterStatus === 'all' || s.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalReal = sources.reduce((a, s) => a + s.recordsReal, 0);
  const totalSynthetic = sources.reduce((a, s) => a + s.recordsSynthetic, 0);
  const activeSources = sources.filter(s => s.status === 'active').length;

  const handleToggleSelect = useCallback((id: string) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, isSelected: !s.isSelected } : s));
  }, []);

  const handleSelectAll = useCallback(() => {
    setSources(prev => prev.map(s => ({ ...s, isSelected: !allSelected })));
  }, [allSelected]);

  const handleToggleStatus = useCallback((id: string) => {
    setSources(prev => prev.map(s => {
      if (s.id !== id) return s;
      const next = s.status === 'active' ? 'paused' : 'active';
      toast.success(`${s.name} ${next === 'active' ? 'activated' : 'paused'}`);
      return { ...s, status: next };
    }));
  }, []);

  const handleSync = useCallback((id: string) => {
    const source = sources.find(s => s.id === id);
    if (!source) return;
    setSyncing(id);
    toast.loading(`Syncing ${source.name}…`, { id: `sync-${id}` });
    setTimeout(() => {
      setSyncing(null);
      toast.success(`${source.name} synced — ${source.recordsReal} real listings imported`, { id: `sync-${id}` });
      setSources(prev => prev.map(s => s.id === id ? { ...s, lastSync: new Date().toISOString() } : s));
    }, 2200);
  }, [sources]);

  const handleBulkSync = useCallback(() => {
    const targets = selectedSources.length > 0 ? selectedSources : sources.filter(s => s.status === 'active');
    if (targets.length === 0) {
      toast.error('No active sources to sync');
      return;
    }
    setBulkSyncing(true);
    const totalReal = targets.reduce((a, s) => a + s.recordsReal, 0);
    toast.loading(`Bulk-syncing ${targets.length} source(s)…`, { id: 'bulk-sync' });
    setTimeout(() => {
      setBulkSyncing(false);
      toast.success(`Bulk sync complete — ${totalReal.toLocaleString()} real listings imported, 0 synthetic records contaminated`, { id: 'bulk-sync' });
      setSources(prev => prev.map(s =>
        targets.find(t => t.id === s.id) ? { ...s, lastSync: new Date().toISOString(), isSelected: false } : s
      ));
    }, 3000);
  }, [selectedSources, sources]);

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-gray-900 dark:bg-white flex items-center justify-center">
              <Radio className="w-5 h-5 text-white dark:text-gray-900" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Lead Sources Manager</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Verify authenticity and bulk-sync only real listings</p>
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Active Sources', value: activeSources, icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />, color: 'text-emerald-600' },
            { label: 'Real Listings', value: totalReal.toLocaleString(), icon: <Shield className="w-4 h-4 text-blue-500" />, color: 'text-blue-600' },
            { label: 'Synthetic Excluded', value: totalSynthetic.toLocaleString(), icon: <AlertTriangle className="w-4 h-4 text-amber-500" />, color: 'text-amber-600' },
            { label: 'Contamination Risk', value: '0%', icon: <Zap className="w-4 h-4 text-gray-500" />, color: 'text-gray-700 dark:text-gray-300' },
          ].map(kpi => (
            <div key={kpi.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-2 mb-1">
                {kpi.icon}
                <span className="text-xs text-gray-500 dark:text-gray-400">{kpi.label}</span>
              </div>
              <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search sources or markets…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-white"
            />
          </div>

          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
            className="text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="error">Error</option>
          </select>

          <button
            onClick={handleSelectAll}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:border-gray-400 transition-colors"
          >
            {allSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>

          <button
            onClick={handleBulkSync}
            disabled={bulkSyncing}
            className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {bulkSyncing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {selectedSources.length > 0 ? `Sync ${selectedSources.length} selected` : 'Bulk Sync All Active'}
          </button>
        </div>

        {/* Authenticity notice */}
        <div className="flex items-start gap-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 mb-5">
          <Shield className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Authenticity Guard Active</p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
              Only listings with valid address fingerprints, real listing URLs, and non-synthetic source flags are imported.
              Synthetic, demo, and test records are automatically excluded before any sync.
            </p>
          </div>
        </div>

        {/* Source cards */}
        <div className="space-y-3 mb-6">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-600">
              <Radio className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No sources match your filters</p>
            </div>
          ) : (
            filtered.map(source => (
              <SourceCard
                key={source.id}
                source={source}
                onToggleSelect={handleToggleSelect}
                onToggleStatus={handleToggleStatus}
                onSync={handleSync}
              />
            ))
          )}
        </div>

        {/* Add source CTA */}
        <button className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-sm text-gray-400 dark:text-gray-600 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors flex items-center justify-center gap-2 mb-8">
          <Plus className="w-4 h-4" />
          Add new lead source
        </button>

        {/* Sync Logs */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowLogs(x => !x)}
            className="w-full flex items-center justify-between px-5 py-4"
          >
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">Recent Sync Logs</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                {SYNC_LOGS.length}
              </span>
            </div>
            {showLogs ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>

          {showLogs && (
            <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
              {SYNC_LOGS.map(log => (
                <div key={log.id} className="px-5 py-3 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{log.sourceName}</span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${logStatusBadge(log.status)}`}>
                        {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{log.notes}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      {log.recordsVerified} / {log.recordsFetched} verified
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-600 mt-0.5">
                      {formatRelative(log.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
