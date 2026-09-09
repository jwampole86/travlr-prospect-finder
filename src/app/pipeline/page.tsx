'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import type { Lead, LeadStage } from '@/data/mockLeads';
import { Clock, AlertTriangle, User, MapPin, Star, X, Smartphone, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { usePortfolio } from '@/contexts/PortfolioContext';
import ContractDealModal from '@/components/ContractDealModal';

const STAGES: LeadStage[] = ['New Lead', 'Contacted', 'Interested', 'Proposal Sent', 'Under Contract', 'Live', 'Not a Fit'];

const STAGE_COLORS: Record<string, string> = {
  'New Lead': 'border-t-slate-400',
  'Contacted': 'border-t-blue-400',
  'Interested': 'border-t-amber-400',
  'Proposal Sent': 'border-t-purple-400',
  'Under Contract': 'border-t-green-500',
  'Live': 'border-t-emerald-500',
  'Not a Fit': 'border-t-red-400',
};

const STAGE_HEADER_COLORS: Record<string, string> = {
  'New Lead': 'bg-slate-50 text-slate-700',
  'Contacted': 'bg-blue-50 text-blue-700',
  'Interested': 'bg-amber-50 text-amber-700',
  'Proposal Sent': 'bg-purple-50 text-purple-700',
  'Under Contract': 'bg-green-50 text-green-700',
  'Live': 'bg-emerald-50 text-emerald-700',
  'Not a Fit': 'bg-red-50 text-red-700',
};

const STALE_DAYS: Record<string, number> = {
  'New Lead': 3,
  'Contacted': 7,
  'Interested': 5,
  'Proposal Sent': 14,
  'Under Contract': 21,
  'Live': 999,
  'Not a Fit': 999,
};

const PAGE_SIZE = 50; // Reduced from 200 — load fewer cards per page for faster initial render

// Minimal columns needed for the kanban board — avoids fetching heavy unused columns
const PIPELINE_SELECT = [
  'id', 'address', 'city', 'state', 'zip',
  'beds', 'baths', 'price', 'source', 'stage',
  'regulation_status', 'prospect_score',
  'days_on_market', 'last_checked',
  'contact_name', 'contact_phone',
  'notes', 'tags', 'estimated_net_monthly',
  'created_at', 'updated_at', 'agent_id', 'version',
].join(',');

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function isStale(lead: Lead): boolean {
  const days = daysSince(lead.updatedAt || lead.lastChecked || lead.createdAt);
  return days >= (STALE_DAYS[lead.stage] ?? 7);
}

interface KanbanCardProps {
  lead: Lead;
  onDragStart: (e: React.DragEvent, lead: Lead) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  onClick: (lead: Lead) => void;
}

function KanbanCard({ lead, onDragStart, onDragEnd, isDragging, onClick }: KanbanCardProps) {
  const stale = isStale(lead);
  const days = daysSince(lead.updatedAt || lead.lastChecked || lead.createdAt);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(lead)}
      className={`group bg-card border rounded-xl p-3.5 cursor-grab active:cursor-grabbing transition-all hover:shadow-md hover:border-primary/30 select-none ${
        isDragging ? 'opacity-40 scale-95' : 'opacity-100'
      } ${stale ? 'border-warning/50 bg-warning/5' : 'border-border'}`}
    >
      {stale && (
        <div className="flex items-center gap-1.5 mb-2 px-2 py-1 bg-warning/10 rounded-lg">
          <AlertTriangle size={11} className="text-warning shrink-0" />
          <span className="text-[10px] font-medium text-warning">Stale — {days}d in stage</span>
        </div>
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2 flex-1">{lead.address}</p>
        <div className="flex items-center gap-1 shrink-0">
          <Star size={10} className="text-amber-400 fill-amber-400" />
          <span className="text-[10px] font-bold text-foreground">{lead.prospectScore}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 mb-2">
        <MapPin size={10} className="text-muted-foreground shrink-0" />
        <span className="text-[10px] text-muted-foreground truncate">{lead.city}, {lead.state}</span>
      </div>
      {lead.contactName && (
        <div className="flex items-center gap-1 mb-2">
          <User size={10} className="text-muted-foreground shrink-0" />
          <span className="text-[10px] text-muted-foreground truncate">{lead.contactName}</span>
        </div>
      )}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
        <span className="text-[10px] text-muted-foreground">{lead.source}</span>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock size={9} />
          <span>{days}d ago</span>
        </div>
      </div>
    </div>
  );
}

interface LeadDetailModalProps {
  lead: Lead;
  onClose: () => void;
  onStageChange: (id: string, stage: LeadStage) => void;
}

function LeadDetailModal({ lead, onClose, onStageChange }: LeadDetailModalProps) {
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(true);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    return () => setVisible(false);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 180);
  };

  return (
    <div
      className={`fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
      onClick={handleClose}
    >
      <div
        className={`bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl transition-all duration-200 ${visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">{lead.address}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{lead.city}, {lead.state} {lead.zip}</p>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X size={15} className="text-muted-foreground" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground mb-1">Prospect Score</p>
            <p className="text-lg font-bold text-foreground">{lead.prospectScore}</p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground mb-1">Est. Net/Mo</p>
            <p className="text-lg font-bold text-foreground">${(lead.estimatedNetMonthly ?? 0).toLocaleString()}</p>
          </div>
        </div>
        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Move to Stage</p>
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map(s => (
              <button
                key={s}
                onClick={() => { onStageChange(lead.id, s); handleClose(); }}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                  lead.stage === s
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        {lead.contactName && (
          <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
            <User size={14} className="text-muted-foreground" />
            <div>
              <p className="text-xs font-medium text-foreground">{lead.contactName}</p>
              {lead.contactPhone && <p className="text-[10px] text-muted-foreground">{lead.contactPhone}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function dbRowToLead(d: Record<string, unknown>): Lead {
  return {
    id: String(d.id),
    address: String(d.address || ''),
    city: String(d.city || ''),
    state: String(d.state || ''),
    zip: String(d.zip || ''),
    beds: Number(d.beds || 0),
    baths: Number(d.baths || 0),
    price: Number(d.price || 0),
    source: String(d.source || ''),
    stage: String(d.stage || 'New Lead') as LeadStage,
    regulationStatus: String(d.regulation_status || 'Unknown') as Lead['regulationStatus'],
    prospectScore: Number(d.prospect_score || 0),
    daysOnMarket: Number(d.days_on_market || 0),
    lastChecked: String(d.last_checked || new Date().toISOString().split('T')[0]),
    contactName: d.contact_name ? String(d.contact_name) : undefined,
    contactPhone: d.contact_phone ? String(d.contact_phone) : undefined,
    notes: String(d.notes || ''),
    tags: Array.isArray(d.tags) ? d.tags : [],
    estimatedNetMonthly: Number(d.estimated_net_monthly || 0),
    createdAt: String(d.created_at || new Date().toISOString().split('T')[0]),
    updatedAt: String(d.updated_at || d.created_at || new Date().toISOString().split('T')[0]),
    agent_id: d.agent_id ? String(d.agent_id) : undefined,
    version: d.version !== undefined ? Number(d.version) : undefined,
  } as Lead & { version?: number };
}

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [portfolioSwitching, setPortfolioSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState(false);
  const [draggingLead, setDraggingLead] = useState<Lead | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileHintDismissed, setMobileHintDismissed] = useState(false);
  const supabase = createClient();
  const { filterLeadsByPortfolio, selectedPortfolio } = usePortfolio();
  const loadedRef = useRef(false);
  const prevPortfolioRef = useRef(selectedPortfolio.key);
  const [contractModalLead, setContractModalLead] = useState<Lead | null>(null);

  // Detect mobile viewport
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const loadLeads = useCallback(async (pageIndex = 0) => {
    setLoading(true);
    setError(null);
    setNetworkError(false);
    try {
      const from = pageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error: dbError, count } = await supabase
        .from('leads')
        .select(PIPELINE_SELECT, { count: 'exact' })
        .eq('is_synthetic', false)
        .order('updated_at', { ascending: false })
        .range(from, to);

      if (dbError) throw dbError;

      if (count !== null) setTotalCount(count);

      if (data && data.length > 0) {
        setLeads(data.map((d: Record<string, unknown>) => dbRowToLead(d)));
      } else {
        setLeads([]);
      }
    } catch (err: unknown) {
      const isNetworkErr = err instanceof TypeError && err.message.includes('fetch');
      const msg = err instanceof Error ? err.message : 'Failed to load pipeline';
      if (isNetworkErr) {
        setNetworkError(true);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
      setPortfolioSwitching(false);
    }
  }, [supabase]);

  // Detect portfolio switch and show scoped loading indicator
  useEffect(() => {
    if (prevPortfolioRef.current !== selectedPortfolio.key) {
      prevPortfolioRef.current = selectedPortfolio.key;
      setPortfolioSwitching(true);
      // Portfolio filter is client-side, so just briefly show the indicator
      const t = setTimeout(() => setPortfolioSwitching(false), 350);
      return () => clearTimeout(t);
    }
  }, [selectedPortfolio.key]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadLeads(0);
  }, [loadLeads]);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    loadedRef.current = false;
    loadLeads(newPage);
  }, [loadLeads]);

  const handleDragStart = useCallback((e: React.DragEvent, lead: Lead) => {
    setDraggingLead(lead);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingLead(null);
    setDragOverStage(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, stage: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stage);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, stage: LeadStage) => {
    e.preventDefault();
    if (!draggingLead || draggingLead.stage === stage) {
      setDragOverStage(null);
      return;
    }

    const currentVersion = (draggingLead as Lead & { version?: number }).version ?? 1;
    const updatedLead = { ...draggingLead, stage, updatedAt: new Date().toISOString().split('T')[0] };

    setLeads(prev => prev.map(l => l.id === draggingLead.id ? updatedLead : l));
    setDragOverStage(null);

    try {
      const { data: current, error: fetchErr } = await supabase
        .from('leads')
        .select('version, updated_at')
        .eq('id', draggingLead.id)
        .single();

      if (fetchErr) throw fetchErr;

      const dbVersion = (current as Record<string, unknown>)?.version as number | undefined;
      if (dbVersion !== undefined && dbVersion !== currentVersion) {
        setLeads(prev => prev.map(l => l.id === draggingLead.id ? draggingLead : l));
        toast.error('This lead was updated by someone else. Please refresh and try again.', { duration: 6000 });
        return;
      }

      const { error: updateErr } = await supabase
        .from('leads')
        .update({
          stage,
          updated_at: new Date().toISOString(),
          version: (currentVersion ?? 1) + 1,
        })
        .eq('id', draggingLead.id)
        .eq('version', currentVersion);

      if (updateErr) throw updateErr;
      toast.success(`Moved to ${stage}`);
    } catch {
      toast.error('Failed to update stage');
      setLeads(prev => prev.map(l => l.id === draggingLead.id ? draggingLead : l));
    }
  }, [draggingLead, supabase]);

  const handleStageChange = useCallback(async (id: string, stage: LeadStage) => {
    const prevLead = leads.find(l => l.id === id);
    const currentVersion = (prevLead as (Lead & { version?: number }) | undefined)?.version ?? 1;

    setLeads(prev => prev.map(l => l.id === id ? { ...l, stage, updatedAt: new Date().toISOString().split('T')[0] } : l));

    // Show Contract modal when moving to Live stage
    if (stage === 'Live') {
      const targetLead = leads.find(l => l.id === id);
      if (targetLead) {
        setContractModalLead({ ...targetLead, stage });
      }
    }

    try {
      const { data: current, error: fetchErr } = await supabase
        .from('leads')
        .select('version, updated_at')
        .eq('id', id)
        .single();

      if (fetchErr) throw fetchErr;

      const dbVersion = (current as Record<string, unknown>)?.version as number | undefined;
      if (dbVersion !== undefined && dbVersion !== currentVersion) {
        if (prevLead) setLeads(cur => cur.map(l => l.id === id ? prevLead : l));
        toast.error('This lead was updated by someone else. Please refresh and try again.', { duration: 6000 });
        return;
      }

      const { error: updateErr } = await supabase
        .from('leads')
        .update({
          stage,
          updated_at: new Date().toISOString(),
          version: (currentVersion ?? 1) + 1,
        })
        .eq('id', id)
        .eq('version', currentVersion);

      if (updateErr) throw updateErr;
      toast.success(`Stage updated to ${stage}`);
    } catch {
      toast.error('Failed to update stage');
      if (prevLead) setLeads(cur => cur.map(l => l.id === id ? prevLead : l));
    }
  }, [leads, supabase]);

  const filteredLeads = filterLeadsByPortfolio(leads).filter(l => {
    if (filterAgent === 'all') return true;
    return (l as Lead & { agent_id?: string }).agent_id === filterAgent;
  });

  const stageLeads = (stage: LeadStage) => filteredLeads.filter(l => l.stage === stage);
  const staleCount = filteredLeads.filter(isStale).length;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex flex-col h-full">
          {/* Header skeleton */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border bg-card shrink-0">
            <div className="space-y-1.5">
              <div className="h-5 w-32 bg-muted animate-pulse rounded" />
              <div className="h-3 w-48 bg-muted animate-pulse rounded" />
            </div>
          </div>
          {/* Kanban skeleton */}
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex gap-3 p-4 h-full min-w-max">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={`kskel-${i}`} className="flex flex-col w-64 shrink-0 rounded-xl border-2 border-border bg-muted/30 overflow-hidden">
                  <div className="px-3 py-2.5 bg-muted/50 flex items-center justify-between">
                    <div className="h-3 w-20 bg-muted animate-pulse rounded" />
                    <div className="h-5 w-8 bg-muted animate-pulse rounded-full" />
                  </div>
                  <div className="flex-1 p-2 space-y-2">
                    {Array.from({ length: 3 }).map((_, j) => (
                      <div key={`kskel-card-${j}`} className="bg-card border border-border rounded-xl p-3.5 space-y-2">
                        <div className="h-3 w-full bg-muted animate-pulse rounded" />
                        <div className="h-3 w-3/4 bg-muted animate-pulse rounded" />
                        <div className="h-3 w-1/2 bg-muted animate-pulse rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-4 max-w-sm text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle size={20} className="text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">Failed to load pipeline</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
            <button
              onClick={() => loadLeads(page)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Clock size={14} />
              Retry
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div>
            <h1 className="text-lg font-bold text-foreground">Pipeline Board</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {filteredLeads.length} of {totalCount} leads shown
              {staleCount > 0 && <> · <span className="text-warning font-medium">{staleCount} stale</span></>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {staleCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-warning/10 border border-warning/30 rounded-lg">
                <AlertTriangle size={13} className="text-warning" />
                <span className="text-xs font-medium text-warning">{staleCount} stale leads</span>
              </div>
            )}
            <span className="text-xs text-muted-foreground px-2 py-1.5 bg-muted/60 border border-border rounded-lg font-medium">
              {selectedPortfolio.stateCode === 'all' ? 'All Portfolios' : selectedPortfolio.label}
            </span>
          </div>
        </div>

        {/* Mobile drag-and-drop hint */}
        {isMobile && !mobileHintDismissed && (
          <div className="mx-4 mt-3 flex items-start gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
            <Smartphone size={15} className="text-blue-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-blue-800">Moving leads on mobile</p>
              <p className="text-[11px] text-blue-700 mt-0.5 leading-relaxed">
                Drag-and-drop requires a mouse. On mobile, <strong>tap any card</strong> to open it, then use the <strong>"Move to Stage"</strong> buttons to change its stage.
              </p>
            </div>
            <button
              onClick={() => setMobileHintDismissed(true)}
              className="p-1 rounded hover:bg-blue-100 transition-colors shrink-0"
              aria-label="Dismiss hint"
            >
              <X size={13} className="text-blue-500" />
            </button>
          </div>
        )}

        {/* Pagination controls (shown when more than one page) */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-2 border-b border-border bg-muted/20 shrink-0">
            <p className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages} · {totalCount.toLocaleString()} total leads
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 0}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-border bg-card hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={12} />
                Prev
              </button>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages - 1}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-border bg-card hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}

        {/* Kanban Board */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden relative">
          {/* Portfolio switching overlay — scoped to just the board */}
          {portfolioSwitching && (
            <div className="absolute inset-0 z-10 flex items-start justify-center pt-8 bg-background/40 backdrop-blur-[1px] transition-opacity duration-200">
              <div className="flex items-center gap-2.5 px-4 py-2.5 bg-card border border-border rounded-full shadow-lg">
                <RefreshCw size={13} className="text-primary animate-spin" />
                <span className="text-sm font-medium text-foreground">Loading {selectedPortfolio.label}…</span>
              </div>
            </div>
          )}
          {/* Network error banner */}
          {networkError && (
            <div className="mx-4 mt-3">
              <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Connection lost</p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">Check your internet connection. Your changes are safe — retry when you're back online.</p>
                </div>
                <button
                  onClick={() => { setNetworkError(false); loadLeads(page); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 rounded-lg text-xs font-medium hover:bg-amber-200 transition-colors shrink-0"
                >
                  <RefreshCw size={11} />
                  Retry
                </button>
              </div>
            </div>
          )}
          {/* Mobile scroll hint */}
          <div className="md:hidden flex items-center gap-1.5 px-4 pt-2 pb-1">
            <svg className="w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            <span className="text-[10px] text-muted-foreground">Swipe to see all stages · Tap a card to move it</span>
          </div>
          <div className={`flex gap-3 p-4 h-full min-w-max ${portfolioSwitching ? 'portfolio-fade' : ''}`}>
            {STAGES.map(stage => {
              const cards = stageLeads(stage);
              const isDragTarget = dragOverStage === stage;
              return (
                <div
                  key={stage}
                  className={`flex flex-col w-64 shrink-0 rounded-xl border-2 border-t-4 transition-all ${STAGE_COLORS[stage]} ${
                    isDragTarget ? 'border-primary/50 bg-primary/5 scale-[1.01]' : 'border-border bg-muted/30'
                  }`}
                  onDragOver={(e) => handleDragOver(e, stage)}
                  onDrop={(e) => handleDrop(e, stage)}
                  onDragLeave={() => setDragOverStage(null)}
                >
                  {/* Column header */}
                  <div className={`flex items-center justify-between px-3 py-2.5 rounded-t-lg ${STAGE_HEADER_COLORS[stage]}`}>
                    <span className="text-xs font-bold uppercase tracking-wide">{stage}</span>
                    <span className="text-xs font-bold bg-white/60 px-2 py-0.5 rounded-full">{cards.length}</span>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[200px]">
                    {cards.length === 0 && (
                      <div className={`flex items-center justify-center h-20 rounded-lg border-2 border-dashed transition-all ${
                        isDragTarget ? 'border-primary/50 bg-primary/5' : 'border-border/50'
                      }`}>
                        <p className="text-[10px] text-muted-foreground">
                          {filteredLeads.length === 0 ? 'No leads' : 'Drop here'}
                        </p>
                      </div>
                    )}
                    {cards.map(lead => (
                      <KanbanCard
                        key={lead.id}
                        lead={lead}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        isDragging={draggingLead?.id === lead.id}
                        onClick={setSelectedLead}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onStageChange={(id, stage) => {
            handleStageChange(id, stage);
            setSelectedLead(null);
          }}
        />
      )}

      {contractModalLead && (
        <ContractDealModal
          leadId={contractModalLead.id}
          leadAddress={contractModalLead.address}
          onClose={() => setContractModalLead(null)}
          onSaved={() => setContractModalLead(null)}
        />
      )}
    </AppLayout>
  );
}
