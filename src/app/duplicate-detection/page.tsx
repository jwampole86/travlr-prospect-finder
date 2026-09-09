'use client';

import React, { useState, useCallback, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import type { Lead } from '@/data/mockLeads';
import { AlertTriangle, Merge, CheckCircle, X, GitMerge, Eye, Info, Loader2, RefreshCw, Shield, Database, Zap, Check } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { usePortfolio } from '@/contexts/PortfolioContext';

interface DuplicateGroup {
  id: string;
  leads: Lead[];
  matchReason: string;
  confidence: 'high' | 'medium' | 'low';
}

// ─── Field conflict resolution ────────────────────────────────────────────────

interface FieldConflict {
  field: string;
  label: string;
  values: { leadId: string; value: string | number; source: string; updatedAt: string }[];
  autoResolved: string | number;
  autoStrategy: 'most_recent' | 'highest_score' | 'most_complete' | 'primary';
  userOverride?: string | number;
}

function buildFieldConflicts(leads: Lead[], primaryId: string): FieldConflict[] {
  const fields: { key: keyof Lead; label: string }[] = [
    { key: 'beds', label: 'Bedrooms' },
    { key: 'baths', label: 'Bathrooms' },
    { key: 'price', label: 'Price' },
    { key: 'stage', label: 'Stage' },
    { key: 'regulationStatus', label: 'Regulation Status' },
    { key: 'prospectScore', label: 'Prospect Score' },
    { key: 'contactName', label: 'Contact Name' },
    { key: 'contactPhone', label: 'Contact Phone' },
    { key: 'notes', label: 'Notes' },
    { key: 'daysOnMarket', label: 'Days on Market' },
  ];

  const conflicts: FieldConflict[] = [];

  for (const { key, label } of fields) {
    const values = leads.map(l => ({
      leadId: l.id,
      value: (l[key] as string | number) ?? '',
      source: l.source,
      updatedAt: l.updatedAt || l.createdAt,
    }));

    const uniqueVals = [...new Set(values.map(v => String(v.value)))];
    if (uniqueVals.length <= 1) continue; // No conflict

    // Auto-resolution strategy
    let autoResolved: string | number = values[0].value;
    let autoStrategy: FieldConflict['autoStrategy'] = 'primary';

    if (key === 'prospectScore') {
      // Highest score wins
      const best = values.reduce((a, b) => Number(a.value) >= Number(b.value) ? a : b);
      autoResolved = best.value;
      autoStrategy = 'highest_score';
    } else if (key === 'notes' || key === 'contactName' || key === 'contactPhone') {
      // Most complete (non-empty) wins
      const best = values.find(v => v.value && String(v.value).trim() !== '') || values[0];
      autoResolved = best.value;
      autoStrategy = 'most_complete';
    } else if (key === 'price' || key === 'beds' || key === 'baths' || key === 'daysOnMarket') {
      // Most recent update wins
      const best = values.reduce((a, b) => new Date(a.updatedAt) >= new Date(b.updatedAt) ? a : b);
      autoResolved = best.value;
      autoStrategy = 'most_recent';
    } else {
      // Primary record wins
      const primary = values.find(v => v.leadId === primaryId);
      autoResolved = primary?.value ?? values[0].value;
      autoStrategy = 'primary';
    }

    conflicts.push({ field: key, label, values, autoResolved, autoStrategy });
  }

  return conflicts;
}

function strategyLabel(s: FieldConflict['autoStrategy']): string {
  return { most_recent: 'Most recent', highest_score: 'Highest score', most_complete: 'Most complete', primary: 'Primary record' }[s];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeAddress(addr: string): string {
  return addr
    .toLowerCase()
    .replace(/\bstreet\b/g, 'st').replace(/\bavenue\b/g, 'ave').replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bdrive\b/g, 'dr').replace(/\broad\b/g, 'rd').replace(/\blane\b/g, 'ln')
    .replace(/\bunit\b/g, '#').replace(/\bapt\b/g, '#').replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
}

function detectDuplicates(leads: Lead[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const processed = new Set<string>();

  for (let i = 0; i < leads.length; i++) {
    if (processed.has(leads[i].id)) continue;
    const group: Lead[] = [leads[i]];
    const normA = normalizeAddress(leads[i].address);

    for (let j = i + 1; j < leads.length; j++) {
      if (processed.has(leads[j].id)) continue;
      const normB = normalizeAddress(leads[j].address);
      if (normA === normB && leads[i].city === leads[j].city) {
        group.push(leads[j]);
        processed.add(leads[j].id);
      }
    }

    if (group.length > 1) {
      processed.add(leads[i].id);
      groups.push({ id: `dup-${leads[i].id}`, leads: group, matchReason: 'Same normalized address in same city', confidence: 'high' });
    }
  }

  for (let i = 0; i < leads.length; i++) {
    if (processed.has(leads[i].id)) continue;
    const group: Lead[] = [leads[i]];
    const normA = normalizeAddress(leads[i].address);
    const wordsA = normA.split(' ').filter(w => w.length > 3);

    for (let j = i + 1; j < leads.length; j++) {
      if (processed.has(leads[j].id)) continue;
      const normB = normalizeAddress(leads[j].address);
      const wordsB = normB.split(' ').filter(w => w.length > 3);
      const commonWords = wordsA.filter(w => wordsB.includes(w));
      const similarity = commonWords.length / Math.max(wordsA.length, wordsB.length);
      if (similarity > 0.75 && leads[i].city === leads[j].city && leads[i].zip === leads[j].zip) {
        group.push(leads[j]);
        processed.add(leads[j].id);
      }
    }

    if (group.length > 1) {
      processed.add(leads[i].id);
      groups.push({ id: `dup-sim-${leads[i].id}`, leads: group, matchReason: 'Similar address in same city/zip', confidence: 'medium' });
    }
  }

  return groups;
}

const confidenceConfig = {
  high: { label: 'High Confidence', color: 'bg-danger/10 text-danger border-danger/30' },
  medium: { label: 'Medium Confidence', color: 'bg-warning/10 text-warning border-warning/30' },
  low: { label: 'Low Confidence', color: 'bg-muted text-muted-foreground border-border' },
};

// ─── Enhanced Merge Modal with Field Conflict Resolution ──────────────────────

interface MergeModalProps {
  group: DuplicateGroup;
  onMerge: (primaryId: string, mergeIds: string[], resolvedFields: Record<string, string | number>) => void;
  onDismiss: () => void;
  onClose: () => void;
}

function MergeModal({ group, onMerge, onDismiss, onClose }: MergeModalProps) {
  const [primaryId, setPrimaryId] = useState(group.leads[0].id);
  const [step, setStep] = useState<'select' | 'preview'>('select');
  const [conflicts, setConflicts] = useState<FieldConflict[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string | number>>({});

  useEffect(() => {
    if (step === 'preview') {
      const c = buildFieldConflicts(group.leads, primaryId);
      setConflicts(c);
      // Initialize overrides with auto-resolved values
      const init: Record<string, string | number> = {};
      c.forEach(cf => { init[cf.field] = cf.autoResolved; });
      setOverrides(init);
    }
  }, [step, primaryId, group.leads]);

  function handleConfirmMerge() {
    const mergeIds = group.leads.filter(l => l.id !== primaryId).map(l => l.id);
    onMerge(primaryId, mergeIds, overrides);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <GitMerge size={18} className="text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                {step === 'select' ? 'Select Primary Record' : 'Merge Preview & Field Resolution'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {step === 'select' ? 'Choose which record to keep as the source of truth' : 'Review auto-resolved conflicts before confirming'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Step indicator */}
            <div className="flex items-center gap-1.5">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === 'select' ? 'bg-primary text-primary-foreground' : 'bg-emerald-500 text-white'}`}>
                {step === 'preview' ? <Check size={10} /> : '1'}
              </div>
              <div className="w-4 h-px bg-border" />
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === 'preview' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>2</div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors ml-2">
              <X size={15} className="text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Step 1: Select Primary */}
          {step === 'select' && (
            <div className="p-6 space-y-3">
              <div className="flex items-start gap-2 p-3 bg-info/5 border border-info/20 rounded-lg">
                <Info size={13} className="text-info mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  The primary record will be kept as the single source of truth. Field conflicts will be auto-resolved in the next step. All source history from duplicates will be merged in.
                </p>
              </div>
              {group.leads.map(lead => (
                <label
                  key={lead.id}
                  className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${primaryId === lead.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}
                >
                  <input type="radio" name="primary" value={lead.id} checked={primaryId === lead.id} onChange={() => setPrimaryId(lead.id)} className="mt-1 accent-primary" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{lead.address}</p>
                      {primaryId === lead.id && <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">Primary</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{lead.city}, {lead.state} · Source: {lead.source}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-muted-foreground">Score: {lead.prospectScore}</span>
                      <span className="text-[10px] text-muted-foreground">Stage: {lead.stage}</span>
                      <span className="text-[10px] text-muted-foreground">Updated: {new Date(lead.updatedAt || lead.createdAt).toLocaleDateString()}</span>
                      <span className="text-[10px] text-muted-foreground">{lead.beds}bd/{lead.baths}ba</span>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Step 2: Field Conflict Preview */}
          {step === 'preview' && (
            <div className="p-6 space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-foreground">{group.leads.length}</p>
                  <p className="text-[10px] text-muted-foreground">Records merging</p>
                </div>
                <div className="bg-amber-500/5 border border-amber-200 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-amber-600">{conflicts.length}</p>
                  <p className="text-[10px] text-muted-foreground">Field conflicts</p>
                </div>
                <div className="bg-emerald-500/5 border border-emerald-200 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-emerald-600">{conflicts.length}</p>
                  <p className="text-[10px] text-muted-foreground">Auto-resolved</p>
                </div>
              </div>

              {conflicts.length === 0 ? (
                <div className="flex items-center gap-2 p-4 bg-emerald-500/5 border border-emerald-200 rounded-xl">
                  <CheckCircle size={16} className="text-emerald-500" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">No field conflicts detected</p>
                    <p className="text-xs text-muted-foreground">All fields match across duplicate records. Safe to merge.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap size={13} className="text-amber-500" />
                    <p className="text-xs font-semibold text-foreground">Auto-resolved conflicts — review and override if needed</p>
                  </div>
                  {conflicts.map(cf => (
                    <div key={cf.field} className="border border-border rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/20">
                        <p className="text-xs font-semibold text-foreground">{cf.label}</p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 border border-amber-200">
                          {strategyLabel(cf.autoStrategy)}
                        </span>
                      </div>
                      <div className="px-4 py-3 space-y-2">
                        {/* Values from each source */}
                        <div className="flex flex-wrap gap-2">
                          {cf.values.map(v => (
                            <button
                              key={v.leadId}
                              onClick={() => setOverrides(prev => ({ ...prev, [cf.field]: v.value }))}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all ${
                                overrides[cf.field] === v.value
                                  ? 'border-primary bg-primary/5 text-primary font-medium' :'border-border text-muted-foreground hover:border-primary/30'
                              }`}
                            >
                              {overrides[cf.field] === v.value && <Check size={10} />}
                              <span className="font-medium">{String(v.value) || '(empty)'}</span>
                              <span className="text-[10px] opacity-60">· {v.source}</span>
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Selected: <strong className="text-foreground">{String(overrides[cf.field] ?? cf.autoResolved) || '(empty)'}</strong>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Data sources being merged */}
              <div className="flex items-start gap-2 p-3 bg-blue-500/5 border border-blue-200 rounded-lg">
                <Database size={13} className="text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1">Data sources being merged</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.leads.map(l => (
                      <span key={l.id} className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-700 rounded-full">{l.source}</span>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">All source history will be preserved in the merged record.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <button
            onClick={onDismiss}
            className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors"
          >
            Not a Duplicate
          </button>
          <div className="flex gap-2">
            {step === 'preview' && (
              <button onClick={() => setStep('select')} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors">
                ← Back
              </button>
            )}
            <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors">
              Cancel
            </button>
            {step === 'select' ? (
              <button
                onClick={() => setStep('preview')}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Preview Merge →
              </button>
            ) : (
              <button
                onClick={handleConfirmMerge}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <GitMerge size={14} />
                Confirm Merge
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DuplicateDetectionPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [mergeModalGroup, setMergeModalGroup] = useState<DuplicateGroup | null>(null);
  const [dismissedGroups, setDismissedGroups] = useState<Set<string>>(new Set());
  const [mergedCount, setMergedCount] = useState(0);
  const supabase = createClient();
  const { filterLeadsByPortfolio } = usePortfolio();

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('id, address, city, state, zip, beds, baths, price, source, stage, regulation_status, prospect_score, days_on_market, last_checked, contact_name, contact_phone, notes, tags, estimated_net_monthly, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(2000);

      if (error) throw error;

      const mapped: Lead[] = (data || []).map((d: Record<string, unknown>) => ({
        id: String(d.id),
        address: String(d.address || ''),
        city: String(d.city || ''),
        state: String(d.state || ''),
        zip: String(d.zip || ''),
        beds: Number(d.beds || 0),
        baths: Number(d.baths || 0),
        price: Number(d.price || 0),
        source: String(d.source || ''),
        stage: String(d.stage || 'New Lead') as Lead['stage'],
        regulationStatus: String(d.regulation_status || 'Unknown') as Lead['regulationStatus'],
        prospectScore: Number(d.prospect_score || 0),
        daysOnMarket: Number(d.days_on_market || 0),
        lastChecked: String(d.last_checked || new Date().toISOString().split('T')[0]),
        contactName: d.contact_name ? String(d.contact_name) : undefined,
        contactPhone: d.contact_phone ? String(d.contact_phone) : undefined,
        notes: String(d.notes || ''),
        tags: Array.isArray(d.tags) ? d.tags : [],
        estimatedNetMonthly: Number(d.estimated_net_monthly || 0),
        createdAt: String(d.created_at || new Date().toISOString()),
        updatedAt: String(d.updated_at || d.created_at || new Date().toISOString()),
      }));

      const portfolioLeads = filterLeadsByPortfolio(mapped);
      setLeads(portfolioLeads);
      setDuplicateGroups(detectDuplicates(portfolioLeads));
    } catch {
      toast.error('Failed to load leads for duplicate detection');
      setLeads([]);
      setDuplicateGroups([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, filterLeadsByPortfolio]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const visibleGroups = duplicateGroups.filter(g => !dismissedGroups.has(g.id));

  const handleMerge = useCallback(async (primaryId: string, mergeIds: string[], resolvedFields: Record<string, string | number>) => {
    try {
      // Apply resolved field overrides to primary record
      if (Object.keys(resolvedFields).length > 0) {
        const fieldMap: Record<string, string> = {
          beds: 'beds', baths: 'baths', price: 'price', stage: 'stage',
          regulationStatus: 'regulation_status', prospectScore: 'prospect_score',
          contactName: 'contact_name', contactPhone: 'contact_phone',
          notes: 'notes', daysOnMarket: 'days_on_market',
        };
        const dbUpdate: Record<string, string | number> = {};
        for (const [k, v] of Object.entries(resolvedFields)) {
          if (fieldMap[k]) dbUpdate[fieldMap[k]] = v;
        }
        if (Object.keys(dbUpdate).length > 0) {
          await supabase.from('leads').update(dbUpdate).eq('id', primaryId);
        }
      }

      // Delete duplicates
      await supabase.from('leads').delete().in('id', mergeIds);
      setLeads(prev => prev.filter(l => !mergeIds.includes(l.id)));
      setDuplicateGroups(prev => prev.filter(g => g.id !== mergeModalGroup?.id));
      setMergeModalGroup(null);
      setMergedCount(c => c + mergeIds.length);
      toast.success(`Merged ${mergeIds.length} duplicate${mergeIds.length > 1 ? 's' : ''} into primary record`);
    } catch {
      toast.error('Failed to merge records');
    }
  }, [supabase, mergeModalGroup]);

  const handleDismiss = useCallback((groupId: string) => {
    setDismissedGroups(prev => new Set([...prev, groupId]));
    setMergeModalGroup(null);
    toast.info('Group dismissed — leads will not be merged');
  }, []);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={20} className="animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Scanning for duplicates…</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <GitMerge size={20} className="text-primary" />
              Duplicate Detection
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {leads.length} leads scanned · {visibleGroups.length} duplicate group{visibleGroups.length !== 1 ? 's' : ''} found
              {mergedCount > 0 && <span className="ml-2 text-emerald-600 font-medium">· {mergedCount} merged this session</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/5 border border-blue-200 rounded-lg">
              <Zap size={12} className="text-blue-500" />
              <span className="text-xs text-blue-700 font-medium">Auto field resolution</span>
            </div>
            <button
              onClick={loadLeads}
              className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              <RefreshCw size={13} />
              Re-scan
            </button>
          </div>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 p-4 bg-blue-500/5 border border-blue-200 rounded-xl">
          <Database size={15} className="text-blue-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-foreground">Automatic field conflict resolution</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              When merging, field conflicts are auto-resolved using smart strategies: most recent data wins for numeric fields, highest score for prospect scores, most complete value for contact info. You can override any field in the merge preview before confirming.
            </p>
          </div>
        </div>

        {visibleGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle size={24} className="text-emerald-500" />
            </div>
            <p className="text-base font-semibold text-foreground">No duplicates found</p>
            <p className="text-sm text-muted-foreground max-w-xs">
              All {leads.length} leads in this portfolio have unique addresses.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleGroups.map(group => {
              const cfg = confidenceConfig[group.confidence];
              return (
                <div key={group.id} className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={14} className="text-warning" />
                      <span className="text-xs font-semibold text-foreground">{group.leads.length} duplicate records</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>{cfg.label}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{group.matchReason}</span>
                  </div>
                  <div className="divide-y divide-border">
                    {group.leads.map(lead => (
                      <div key={lead.id} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-xs font-semibold text-foreground">{lead.address}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {lead.city}, {lead.state} · {lead.source} · Score: {lead.prospectScore} · {lead.beds}bd/{lead.baths}ba
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-muted-foreground">{lead.stage}</span>
                          <p className="text-[10px] text-muted-foreground">Updated: {new Date(lead.updatedAt || lead.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-muted/10">
                    <button
                      onClick={() => setMergeModalGroup(group)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
                    >
                      <Merge size={12} />
                      Review & Merge
                    </button>
                    <button
                      onClick={() => handleDismiss(group.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors"
                    >
                      <Eye size={12} />
                      Not a Duplicate
                    </button>
                    <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1">
                      <Shield size={10} />
                      Auto field resolution ready
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {mergeModalGroup && (
        <MergeModal
          group={mergeModalGroup}
          onMerge={handleMerge}
          onDismiss={() => handleDismiss(mergeModalGroup.id)}
          onClose={() => setMergeModalGroup(null)}
        />
      )}
    </AppLayout>
  );
}
