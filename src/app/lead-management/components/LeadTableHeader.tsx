'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Upload, RefreshCw, Download, ChevronDown, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { showErrorWithRetry } from '@/lib/hooks/useRetryToast';
import { refreshLeadsFromSources, REFRESH_SOURCES } from '@/lib/services/leadsRefreshService';
import { leadsService } from '@/lib/services/leadsService';

interface LeadTableHeaderProps {
  totalCount: number;
  filteredCount: number;
  onOpenCSV: () => void;
  onOpenMasterData?: () => void;
  onLeadsRefreshed?: () => void;
  onExportFiltered?: () => void;
  /** Rarely used admin actions, tucked into one menu. */
  tools?: Array<{ label: string; hint?: string; onClick: () => void }>;
  extraToolsContent?: React.ReactNode;
}

function Menu({ label, icon, children, align = 'right' }: { label: string; icon: React.ReactNode; children: (close: () => void) => React.ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(v => !v)} aria-haspopup="menu" aria-expanded={open} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-foreground border border-border bg-card hover:bg-muted transition">
        {icon}<span className="hidden sm:inline">{label}</span><ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div role="menu" className={`absolute z-40 mt-1.5 w-64 bg-card border border-border rounded-xl shadow-xl p-1.5 ${align === 'right' ? 'right-0' : 'left-0'}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export default function LeadTableHeader({
  totalCount,
  filteredCount,
  onOpenCSV,
  onOpenMasterData,
  onLeadsRefreshed,
  onExportFiltered,
  tools,
  extraToolsContent,
}: LeadTableHeaderProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState('');

  async function handleRefreshAll() {
    setRefreshing(true);
    setRefreshMsg('Connecting to sources…');

    try {
      const result = await refreshLeadsFromSources((msg) => setRefreshMsg(msg));

      setRefreshing(false);
      setRefreshMsg('');

      if (result.error) {
        showErrorWithRetry({
          message: 'Sync completed with errors',
          detail: result.error,
          onRetry: handleRefreshAll,
        });
      } else {
        toast.success(`${result.newLeads} new leads found`, {
          description: `Checked ${REFRESH_SOURCES.length} sources`,
        });
      }
    } catch (err) {
      setRefreshing(false);
      setRefreshMsg('');
      showErrorWithRetry({
        message: 'Sync failed — could not reach lead sources',
        detail: err instanceof Error ? err.message : 'Network error',
        onRetry: handleRefreshAll,
      });
    }
    onLeadsRefreshed?.();
  }

  async function handleExport() {
    toast.loading('Preparing CSV export…', { id: 'lm-export' });
    try {
      const leads = await leadsService.getAll();
      if (leads.length === 0) {
        toast.error('No leads to export', { id: 'lm-export' });
        return;
      }
      const headers = [
        'ID', 'Address', 'City', 'State', 'Zip', 'Beds', 'Baths', 'Price',
        'Source', 'Stage', 'Regulation Status', 'Prospect Score', 'Days On Market',
        'Listing URL', 'Notes', 'Contact Name', 'Contact Phone',
        'Est. ADR', 'Est. Occupancy %', 'Est. Gross Monthly', 'Est. Net Monthly',
        'Created At', 'Updated At',
      ];
      const rows = leads.map((l) => [
        l.id, `"${l.address}"`, l.city, l.state, l.zip, l.beds, l.baths, l.price,
        l.source, l.stage, l.regulationStatus, l.prospectScore, l.daysOnMarket,
        l.listingUrl, `"${(l.notes || '').replace(/"/g, '""')}"`,
        l.contactName || '', l.contactPhone || '',
        l.estimatedADR, l.estimatedOccupancy, l.estimatedGrossMonthly, l.estimatedNetMonthly,
        l.createdAt, l.updatedAt,
      ]);
      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `travlr-leads-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${leads.length.toLocaleString()} leads`, { id: 'lm-export' });
    } catch {
      toast.error('Export failed. Please try again.', { id: 'lm-export' });
    }
  }

  const item = 'w-full text-left px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted transition';
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Lead Management</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          <span className="font-semibold text-foreground tabular-nums">{filteredCount.toLocaleString()}</span>
          {filteredCount !== totalCount && <span> of <span className="font-semibold text-foreground tabular-nums">{totalCount.toLocaleString()}</span></span>} leads
          {refreshing && refreshMsg && <span className="ml-2 text-xs text-primary animate-pulse">{refreshMsg}</span>}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={handleRefreshAll} disabled={refreshing} title="Pull new leads from the connected sources" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-foreground border border-border bg-card hover:bg-muted transition disabled:opacity-60">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /><span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
        </button>
        <Menu label="Export" icon={<Download size={14} />}>
          {close => (<>
            {onExportFiltered && <button role="menuitem" className={item} onClick={() => { close(); onExportFiltered(); }}>Export this view<span className="block text-[11px] text-muted-foreground">Leads matching the current filters</span></button>}
            <button role="menuitem" className={item} onClick={() => { close(); void handleExport(); }}>Export all leads<span className="block text-[11px] text-muted-foreground">Everything you can see, as CSV</span></button>
          </>)}
        </Menu>
        {tools && tools.length > 0 && (
          <Menu label="Data tools" icon={<Wrench size={14} />}>
            {close => (<>
              {tools.map(t => <button key={t.label} role="menuitem" className={item} onClick={() => { close(); t.onClick(); }}>{t.label}{t.hint && <span className="block text-[11px] text-muted-foreground">{t.hint}</span>}</button>)}
              {onOpenMasterData && <button role="menuitem" className={item} onClick={() => { close(); onOpenMasterData(); }}>Master homeowner data<span className="block text-[11px] text-muted-foreground">Upload databases for matching and enrichment</span></button>}
              {extraToolsContent && <div className="border-t border-border mt-1 pt-1 px-1">{extraToolsContent}</div>}
            </>)}
          </Menu>
        )}
        <button onClick={onOpenCSV} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 transition active:scale-95 shadow-sm">
          <Upload size={14} />Upload CSV
        </button>
      </div>
    </div>
  );
}
