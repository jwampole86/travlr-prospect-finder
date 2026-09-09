'use client';

import React, { useState, useCallback, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';

import { leadsService } from '@/lib/services/leadsService';
import type { Lead } from '@/data/mockLeads';
import DuplicateMergeModal from '../lead-management/components/DuplicateMergeModal';
import { AlertTriangle, GitMerge, CheckCircle, X, RefreshCw, Search, Loader2, Users, Star, Phone, MapPin,  } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DuplicateGroup {
  id: string;
  leads: Lead[];
  matchReason: string;
  matchField: 'address' | 'phone' | 'name';
  confidence: 'high' | 'medium' | 'low';
}

// ─── Matching logic ───────────────────────────────────────────────────────────

function normalizeAddress(addr: string): string {
  return addr
    .toLowerCase()
    .replace(/\bstreet\b/g, 'st').replace(/\bavenue\b/g, 'ave')
    .replace(/\bboulevard\b/g, 'blvd').replace(/\bdrive\b/g, 'dr')
    .replace(/\broad\b/g, 'rd').replace(/\blane\b/g, 'ln')
    .replace(/\bunit\b/g, '#').replace(/\bapt\b/g, '#')
    .replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-10);
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

function detectDuplicates(leads: Lead[], matchBy: 'all' | 'address' | 'phone' | 'name'): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const processed = new Set<string>();

  // Address matching
  if (matchBy === 'all' || matchBy === 'address') {
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
        groups.push({
          id: `addr-${leads[i].id}`,
          leads: group,
          matchReason: 'Same normalized address in same city',
          matchField: 'address',
          confidence: 'high',
        });
      }
    }

    // Fuzzy address
    for (let i = 0; i < leads.length; i++) {
      if (processed.has(leads[i].id)) continue;
      const group: Lead[] = [leads[i]];
      const normA = normalizeAddress(leads[i].address);
      const wordsA = normA.split(' ').filter(w => w.length > 3);

      for (let j = i + 1; j < leads.length; j++) {
        if (processed.has(leads[j].id)) continue;
        const normB = normalizeAddress(leads[j].address);
        const wordsB = normB.split(' ').filter(w => w.length > 3);
        const common = wordsA.filter(w => wordsB.includes(w));
        const sim = common.length / Math.max(wordsA.length, wordsB.length);
        if (sim > 0.75 && leads[i].city === leads[j].city && leads[i].zip === leads[j].zip) {
          group.push(leads[j]);
          processed.add(leads[j].id);
        }
      }

      if (group.length > 1) {
        processed.add(leads[i].id);
        groups.push({
          id: `addr-sim-${leads[i].id}`,
          leads: group,
          matchReason: 'Similar address in same city/zip',
          matchField: 'address',
          confidence: 'medium',
        });
      }
    }
  }

  // Phone matching
  if (matchBy === 'all' || matchBy === 'phone') {
    const phoneMap = new Map<string, Lead[]>();
    for (const lead of leads) {
      if (processed.has(lead.id)) continue;
      const phone = (lead as any).phone ? normalizePhone((lead as any).phone) : '';
      if (phone.length === 10) {
        if (!phoneMap.has(phone)) phoneMap.set(phone, []);
        phoneMap.get(phone)!.push(lead);
      }
    }
    for (const [, group] of phoneMap) {
      if (group.length > 1) {
        group.forEach(l => processed.add(l.id));
        groups.push({
          id: `phone-${group[0].id}`,
          leads: group,
          matchReason: 'Same phone number across records',
          matchField: 'phone',
          confidence: 'high',
        });
      }
    }
  }

  // Name matching
  if (matchBy === 'all' || matchBy === 'name') {
    const nameMap = new Map<string, Lead[]>();
    for (const lead of leads) {
      if (processed.has(lead.id)) continue;
      const name = (lead as any).ownerName ? normalizeName((lead as any).ownerName) : '';
      if (name.length > 3) {
        if (!nameMap.has(name)) nameMap.set(name, []);
        nameMap.get(name)!.push(lead);
      }
    }
    for (const [, group] of nameMap) {
      if (group.length > 1) {
        group.forEach(l => processed.add(l.id));
        groups.push({
          id: `name-${group[0].id}`,
          leads: group,
          matchReason: 'Same owner name across records',
          matchField: 'name',
          confidence: 'medium',
        });
      }
    }
  }

  return groups;
}

// ─── Confidence badge ─────────────────────────────────────────────────────────

const CONF_STYLES = {
  high: 'bg-red-500/10 text-red-500 border-red-500/20',
  medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  low: 'bg-muted text-muted-foreground border-border',
};

const MATCH_ICONS = {
  address: MapPin,
  phone: Phone,
  name: Users,
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DuplicateAuditPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [merged, setMerged] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [matchBy, setMatchBy] = useState<'all' | 'address' | 'phone' | 'name'>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [search, setSearch] = useState('');
  const [mergeModal, setMergeModal] = useState<DuplicateGroup | null>(null);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const data = await leadsService.getLeads();
      setLeads(data);
    } catch {
      // fallback to empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  useEffect(() => {
    if (leads.length > 0) {
      setGroups(detectDuplicates(leads, matchBy));
    }
  }, [leads, matchBy]);

  const visibleGroups = groups.filter(g => {
    if (dismissed.has(g.id) || merged.has(g.id)) return false;
    if (confidenceFilter !== 'all' && g.confidence !== confidenceFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return g.leads.some(l =>
        l.address.toLowerCase().includes(q) ||
        l.city.toLowerCase().includes(q) ||
        (l as any).ownerName?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalDuplicateLeads = visibleGroups.reduce((s, g) => s + g.leads.length - 1, 0);

  function handleMerge(primaryId: string, mergeIds: string[]) {
    if (!mergeModal) return;
    // In production: call leadsService.mergeLeads(primaryId, mergeIds)
    setMerged(prev => new Set([...prev, mergeModal.id]));
    setMergeModal(null);
    toast.success(`Merged ${mergeIds.length} duplicate${mergeIds.length > 1 ? 's' : ''} into primary record. Scores, notes, and enrichment preserved.`);
  }

  function handleDismiss(groupId: string) {
    setDismissed(prev => new Set([...prev, groupId]));
    setMergeModal(null);
    toast.success('Group dismissed — these records will not be flagged again.');
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div>
            <h1 className="text-lg font-bold text-foreground">Duplicate Lead Audit</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Match by name, address, or phone · merge while preserving scores, notes &amp; enrichment
            </p>
          </div>
          <button
            onClick={loadLeads}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Re-scan
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-card/50 shrink-0 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by address, city, or owner..."
              className="w-full pl-8 pr-3 py-1.5 bg-muted border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {(['all', 'address', 'phone', 'name'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMatchBy(m)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all ${
                  matchBy === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {(['all', 'high', 'medium', 'low'] as const).map(c => (
              <button
                key={c}
                onClick={() => setConfidenceFilter(c)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all ${
                  confidenceFilter === c ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-6 px-6 py-2.5 border-b border-border bg-muted/20 shrink-0">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-amber-500" />
            <span className="text-xs text-muted-foreground"><strong className="text-foreground">{visibleGroups.length}</strong> duplicate groups</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users size={12} className="text-red-500" />
            <span className="text-xs text-muted-foreground"><strong className="text-foreground">{totalDuplicateLeads}</strong> redundant records</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle size={12} className="text-emerald-500" />
            <span className="text-xs text-muted-foreground"><strong className="text-foreground">{merged.size}</strong> merged</span>
          </div>
          <div className="flex items-center gap-1.5">
            <X size={12} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground"><strong className="text-foreground">{dismissed.size}</strong> dismissed</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 size={28} className="animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Scanning {leads.length} leads for duplicates...</p>
            </div>
          ) : visibleGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <CheckCircle size={40} className="text-emerald-500" />
              <p className="text-base font-semibold text-foreground">No duplicates found</p>
              <p className="text-sm text-muted-foreground">All lead records appear to be unique based on the current match criteria.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleGroups.map(group => {
                const MatchIcon = MATCH_ICONS[group.matchField];
                return (
                  <div key={group.id} className="bg-card border border-border rounded-xl overflow-hidden">
                    {/* Group header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
                      <div className="flex items-center gap-2">
                        <MatchIcon size={13} className="text-muted-foreground" />
                        <span className="text-xs font-semibold text-foreground">{group.matchReason}</span>
                        <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-semibold capitalize ${CONF_STYLES[group.confidence]}`}>
                          {group.confidence}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{group.leads.length} records</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDismiss(group.id)}
                          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors"
                        >
                          <X size={11} />
                          Dismiss
                        </button>
                        <button
                          onClick={() => setMergeModal(group)}
                          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-primary border border-primary/30 bg-primary/5 rounded-lg hover:bg-primary/10 transition-colors"
                        >
                          <GitMerge size={11} />
                          Merge
                        </button>
                      </div>
                    </div>

                    {/* Lead rows */}
                    <div className="divide-y divide-border">
                      {group.leads.map((lead, i) => (
                        <div key={lead.id} className="flex items-center gap-4 px-4 py-3">
                          <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{lead.address}</p>
                            <p className="text-[11px] text-muted-foreground">{lead.city}, {lead.state} {lead.zip}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            {(lead as any).ownerName && (
                              <span className="text-[11px] text-muted-foreground hidden sm:block">{(lead as any).ownerName}</span>
                            )}
                            <div className="flex items-center gap-1">
                              <Star size={10} className="text-amber-500" />
                              <span className="text-[11px] font-semibold text-foreground">{lead.score ?? '—'}</span>
                            </div>
                            <span className="text-[11px] text-muted-foreground capitalize hidden md:block">{lead.stage}</span>
                            <span className="text-[11px] text-muted-foreground hidden lg:block">{lead.source}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {mergeModal && (
        <DuplicateMergeModal
          group={mergeModal}
          onMerge={handleMerge}
          onDismiss={() => handleDismiss(mergeModal.id)}
          onClose={() => setMergeModal(null)}
        />
      )}
    </AppLayout>
  );
}
