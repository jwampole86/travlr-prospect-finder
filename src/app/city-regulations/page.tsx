'use client';

import React, { useEffect, useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { Shield, Plus, Edit3, Save, X, RefreshCw, Loader2, ExternalLink, Search, BarChart2, Zap, Database } from 'lucide-react';
import { cityRegulationService, CANONICAL_STATUS_LABELS, CANONICAL_STATUS_COLORS, formatRegDate } from '@/lib/services/cityRegulationService';
import type { CityRegulation, CanonicalRegStatus, RegulationCoverage } from '@/lib/services/cityRegulationService';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

const STATUS_OPTIONS: CanonicalRegStatus[] = [
  'ALLOWED', 'ALLOWED_WITH_REQUIREMENTS', 'PERMIT_REQUIRED', 'RESTRICTED',
  'PRIMARY_RESIDENCE_REQUIRED', 'PROHIBITED', 'UNKNOWN', 'REVIEW_REQUIRED',
];

function StatusBadge({ status }: { status: CanonicalRegStatus }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${CANONICAL_STATUS_COLORS[status]}`}>
      {CANONICAL_STATUS_LABELS[status]}
    </span>
  );
}

function CoverageKPI({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{pct}% of total</p>
    </div>
  );
}

export default function CityRegulationsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [regulations, setRegulations] = useState<CityRegulation[]>([]);
  const [coverage, setCoverage] = useState<RegulationCoverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [coverageLoading, setCoverageLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CityRegulation>>({});
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<Partial<CityRegulation>>({ status: 'UNKNOWN', jurisdictionType: 'CITY', confidence: 'MEDIUM', reviewStatus: 'CURRENT' });
  const [backfilling, setBackfilling] = useState(false);
  const [activeTab, setActiveTab] = useState<'regulations' | 'coverage'>('coverage');

  const loadData = useCallback(async () => {
    setLoading(true);
    setCoverageLoading(true);
    const [regs, cov] = await Promise.all([
      cityRegulationService.getAllCityRegulations(),
      cityRegulationService.getCoverage(),
    ]);
    setRegulations(regs);
    setCoverage(cov);
    setLoading(false);
    setCoverageLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = regulations.filter(r => {
    const matchSearch = !search || [r.jurisdictionName, r.city, r.state, r.county].some(v => v?.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  async function handleSave(id: string) {
    setSaving(true);
    try {
      const res = await fetch('/api/regulations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...editForm }),
      });
      if (!res.ok) throw new Error('Save failed');
      toast.success('Regulation updated and propagated to all affected properties');
      setEditingId(null);
      setEditForm({});
      await loadData();
    } catch {
      toast.error('Failed to save regulation');
    }
    setSaving(false);
  }

  async function handleAdd() {
    if (!addForm.jurisdictionName || !addForm.state) {
      toast.error('Jurisdiction name and state are required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/regulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      if (!res.ok) throw new Error('Add failed');
      toast.success('City regulation added');
      setShowAddForm(false);
      setAddForm({ status: 'UNKNOWN', jurisdictionType: 'CITY', confidence: 'MEDIUM', reviewStatus: 'CURRENT' });
      await loadData();
    } catch {
      toast.error('Failed to add regulation');
    }
    setSaving(false);
  }

  async function handleBackfill() {
    setBackfilling(true);
    try {
      const res = await fetch('/api/regulations/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backfillAll: true }),
      });
      const data = await res.json();
      toast.success(`Backfill complete — ${data.count} leads evaluated`);
      await loadData();
    } catch {
      toast.error('Backfill failed');
    }
    setBackfilling(false);
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Shield size={20} className="text-primary" />
              City Regulations / STR Rules
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Canonical local STR regulation records — one source of truth for all properties</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleBackfill}
              disabled={backfilling}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
            >
              {backfilling ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
              Backfill All Leads
            </button>
            <button
              onClick={() => router.push('/regulation-trace')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors"
            >
              <Database size={12} />
              Trace Regulation
            </button>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus size={12} />
              Add Regulation
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-border">
          {[
            { key: 'coverage', label: 'Coverage Dashboard', icon: <BarChart2 size={13} /> },
            { key: 'regulations', label: 'Regulation Records', icon: <Shield size={13} /> },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-all ${
                activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* Coverage Tab */}
        {activeTab === 'coverage' && (
          <div className="space-y-6">
            {coverageLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : coverage ? (
              <>
                {/* Top KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-card border border-border rounded-xl p-4 col-span-2 md:col-span-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Total Leads</p>
                    <p className="text-3xl font-bold text-foreground">{coverage.totalApplicable.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Canonical properties</p>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Regulation Evaluated</p>
                    <p className="text-2xl font-bold text-foreground">{coverage.regulationEvaluated.toLocaleString()}</p>
                    <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${coverage.coveragePercent}%` }} />
                    </div>
                    <p className="text-xs text-primary mt-0.5">{coverage.coveragePercent}% coverage</p>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">City Rules Found</p>
                    <p className="text-2xl font-bold text-foreground">{coverage.cityRulesFound.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Canonical match</p>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Stale Records</p>
                    <p className={`text-2xl font-bold ${coverage.stale > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>{coverage.stale.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Need review</p>
                  </div>
                </div>

                {/* Status breakdown */}
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3">Regulation Status Breakdown</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Allowed', value: coverage.allowed, color: 'text-emerald-600', status: 'ALLOWED' },
                      { label: 'Allowed w/ Requirements', value: coverage.allowedWithRequirements, color: 'text-blue-600', status: 'ALLOWED_WITH_REQUIREMENTS' },
                      { label: 'Permit Required', value: coverage.permitRequired, color: 'text-amber-600', status: 'PERMIT_REQUIRED' },
                      { label: 'Restricted', value: coverage.restricted, color: 'text-orange-600', status: 'RESTRICTED' },
                      { label: 'Primary Residence Req.', value: coverage.primaryResidenceRequired, color: 'text-purple-600', status: 'PRIMARY_RESIDENCE_REQUIRED' },
                      { label: 'Prohibited', value: coverage.prohibited, color: 'text-red-600', status: 'PROHIBITED' },
                      { label: 'Unknown', value: coverage.unknown, color: 'text-muted-foreground', status: 'UNKNOWN' },
                      { label: 'Review Required', value: coverage.reviewRequired, color: 'text-yellow-600', status: 'REVIEW_REQUIRED' },
                    ].map(item => (
                      <button
                        key={item.status}
                        onClick={() => router.push(`/lead-management?cityRegulationStatus=${item.status}`)}
                        className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/50 hover:bg-muted/30 transition-all group"
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{item.label}</p>
                        <p className={`text-2xl font-bold ${item.color}`}>{item.value.toLocaleString()}</p>
                        <p className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">Click to filter leads →</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Data quality */}
                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Data Quality Flags</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-xs text-muted-foreground">Jurisdiction Unknown</p>
                      <p className="text-lg font-bold text-orange-600">{coverage.jurisdictionUnknown.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-xs text-muted-foreground">Stale Regulation</p>
                      <p className="text-lg font-bold text-orange-600">{coverage.stale.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-xs text-muted-foreground">Coverage %</p>
                      <p className={`text-lg font-bold ${coverage.coveragePercent >= 80 ? 'text-emerald-600' : coverage.coveragePercent >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                        {coverage.coveragePercent}%
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* Regulations Tab */}
        {activeTab === 'regulations' && (
          <div className="space-y-4">
            {/* Add form */}
            {showAddForm && (
              <div className="bg-card border border-primary/30 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Add New City Regulation</h3>
                  <button onClick={() => setShowAddForm(false)} className="p-1 rounded hover:bg-muted"><X size={14} /></button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Jurisdiction Name *</label>
                    <input value={addForm.jurisdictionName || ''} onChange={e => setAddForm(p => ({ ...p, jurisdictionName: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background" placeholder="e.g. Palm Springs, CA" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">City</label>
                    <input value={addForm.city || ''} onChange={e => setAddForm(p => ({ ...p, city: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background" placeholder="e.g. Palm Springs" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">State *</label>
                    <input value={addForm.state || ''} onChange={e => setAddForm(p => ({ ...p, state: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background" placeholder="e.g. CA" maxLength={2} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Status</label>
                    <select value={addForm.status || 'UNKNOWN'} onChange={e => setAddForm(p => ({ ...p, status: e.target.value as CanonicalRegStatus }))} className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background">
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{CANONICAL_STATUS_LABELS[s]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Permit Required</label>
                    <select value={addForm.permitRequired === true ? 'true' : addForm.permitRequired === false ? 'false' : ''} onChange={e => setAddForm(p => ({ ...p, permitRequired: e.target.value === '' ? undefined : e.target.value === 'true' }))} className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background">
                      <option value="">Unknown</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Primary Residence Required</label>
                    <select value={addForm.primaryResidenceRequired === true ? 'true' : addForm.primaryResidenceRequired === false ? 'false' : ''} onChange={e => setAddForm(p => ({ ...p, primaryResidenceRequired: e.target.value === '' ? undefined : e.target.value === 'true' }))} className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background">
                      <option value="">Unknown</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </div>
                  <div className="col-span-2 md:col-span-3">
                    <label className="text-xs text-muted-foreground block mb-1">Agent Summary</label>
                    <textarea value={addForm.agentSummary || ''} onChange={e => setAddForm(p => ({ ...p, agentSummary: e.target.value }))} rows={2} className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background resize-none" placeholder="Concise summary for agents before calling..." />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Source Name</label>
                    <input value={addForm.sourceName || ''} onChange={e => setAddForm(p => ({ ...p, sourceName: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background" placeholder="e.g. City of Palm Springs" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Source URL</label>
                    <input value={addForm.sourceUrl || ''} onChange={e => setAddForm(p => ({ ...p, sourceUrl: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background" placeholder="https://..." />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAdd} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 disabled:opacity-50">
                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                    Save Regulation
                  </button>
                  <button onClick={() => setShowAddForm(false)} className="px-4 py-2 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted">Cancel</button>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search jurisdiction, city, state…"
                  className="w-full pl-8 pr-3 py-2 text-xs border border-border rounded-lg bg-background"
                />
              </div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2 text-xs border border-border rounded-lg bg-background">
                <option value="all">All Statuses</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{CANONICAL_STATUS_LABELS[s]}</option>)}
              </select>
              <button onClick={loadData} className="p-2 rounded-lg border border-border hover:bg-muted transition-colors">
                <RefreshCw size={12} className="text-muted-foreground" />
              </button>
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Jurisdiction</th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Permit</th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Primary Res.</th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Last Verified</th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Source</th>
                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground">v</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.map(reg => (
                        <React.Fragment key={reg.id}>
                          <tr className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-foreground">{reg.jurisdictionName}</p>
                              <p className="text-muted-foreground">{reg.jurisdictionType} · {reg.state}</p>
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={reg.status} />
                            </td>
                            <td className="px-4 py-3">
                              <span className={reg.permitRequired === true ? 'text-orange-600 font-semibold' : reg.permitRequired === false ? 'text-emerald-600' : 'text-muted-foreground'}>
                                {reg.permitRequired === true ? 'Required' : reg.permitRequired === false ? 'No' : '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={reg.primaryResidenceRequired === true ? 'text-orange-600 font-semibold' : reg.primaryResidenceRequired === false ? 'text-emerald-600' : 'text-muted-foreground'}>
                                {reg.primaryResidenceRequired === true ? 'Required' : reg.primaryResidenceRequired === false ? 'No' : '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{formatRegDate(reg.lastVerifiedAt)}</td>
                            <td className="px-4 py-3">
                              {reg.sourceUrl ? (
                                <a href={reg.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                                  <ExternalLink size={10} />
                                  {reg.sourceName || 'Source'}
                                </a>
                              ) : (
                                <span className="text-muted-foreground">{reg.sourceName || '—'}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">v{reg.regulationVersion}</td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => { setEditingId(reg.id); setEditForm({ status: reg.status, permitRequired: reg.permitRequired, primaryResidenceRequired: reg.primaryResidenceRequired, nightCap: reg.nightCap, agentSummary: reg.agentSummary, sourceName: reg.sourceName, sourceUrl: reg.sourceUrl, reviewStatus: reg.reviewStatus, confidence: reg.confidence }); }}
                                className="p-1.5 rounded hover:bg-muted transition-colors"
                              >
                                <Edit3 size={12} className="text-muted-foreground" />
                              </button>
                            </td>
                          </tr>
                          {editingId === reg.id && (
                            <tr>
                              <td colSpan={8} className="px-4 py-4 bg-muted/20 border-b border-border">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                                  <div>
                                    <label className="text-[10px] text-muted-foreground block mb-1">Status</label>
                                    <select value={editForm.status || reg.status} onChange={e => setEditForm(p => ({ ...p, status: e.target.value as CanonicalRegStatus }))} className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background">
                                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{CANONICAL_STATUS_LABELS[s]}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-muted-foreground block mb-1">Permit Required</label>
                                    <select value={editForm.permitRequired === true ? 'true' : editForm.permitRequired === false ? 'false' : ''} onChange={e => setEditForm(p => ({ ...p, permitRequired: e.target.value === '' ? undefined : e.target.value === 'true' }))} className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background">
                                      <option value="">Unknown</option>
                                      <option value="true">Yes</option>
                                      <option value="false">No</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-muted-foreground block mb-1">Primary Res. Required</label>
                                    <select value={editForm.primaryResidenceRequired === true ? 'true' : editForm.primaryResidenceRequired === false ? 'false' : ''} onChange={e => setEditForm(p => ({ ...p, primaryResidenceRequired: e.target.value === '' ? undefined : e.target.value === 'true' }))} className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background">
                                      <option value="">Unknown</option>
                                      <option value="true">Yes</option>
                                      <option value="false">No</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-muted-foreground block mb-1">Review Status</label>
                                    <select value={editForm.reviewStatus || reg.reviewStatus} onChange={e => setEditForm(p => ({ ...p, reviewStatus: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background">
                                      <option value="CURRENT">Current</option>
                                      <option value="REVIEW_DUE">Review Due</option>
                                      <option value="STALE">Stale</option>
                                      <option value="UNKNOWN">Unknown</option>
                                    </select>
                                  </div>
                                  <div className="col-span-2">
                                    <label className="text-[10px] text-muted-foreground block mb-1">Agent Summary</label>
                                    <textarea value={editForm.agentSummary || ''} onChange={e => setEditForm(p => ({ ...p, agentSummary: e.target.value }))} rows={2} className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background resize-none" />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-muted-foreground block mb-1">Source Name</label>
                                    <input value={editForm.sourceName || ''} onChange={e => setEditForm(p => ({ ...p, sourceName: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background" />
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-muted-foreground block mb-1">Source URL</label>
                                    <input value={editForm.sourceUrl || ''} onChange={e => setEditForm(p => ({ ...p, sourceUrl: e.target.value }))} className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background" />
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => handleSave(reg.id)} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 disabled:opacity-50">
                                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                                    Save & Propagate
                                  </button>
                                  <button onClick={() => { setEditingId(null); setEditForm({}); }} className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted">Cancel</button>
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-2">Saving will propagate status changes to all properties referencing this regulation and log activity for material changes.</p>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground text-sm">
                            No regulation records found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
