'use client';

import React, { useState } from 'react';
import { Upload, RefreshCw, Download, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { showErrorWithRetry } from '@/lib/hooks/useRetryToast';
import { refreshLeadsFromSources, REFRESH_SOURCES } from '@/lib/services/leadsRefreshService';
import { leadsService } from '@/lib/services/leadsService';

interface LeadTableHeaderProps {
  totalCount: number;
  filteredCount: number;
  onOpenCSV: () => void;
  onLeadsRefreshed?: () => void;
  onExportFiltered?: () => void;
}

export default function LeadTableHeader({
  totalCount,
  filteredCount,
  onOpenCSV,
  onLeadsRefreshed,
  onExportFiltered,
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

  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Lead Management</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Showing{' '}
          <span className="font-mono-data font-semibold text-foreground">{filteredCount.toLocaleString()}</span>
          {filteredCount !== totalCount && (
            <span> of <span className="font-mono-data font-semibold text-foreground">{totalCount.toLocaleString()}</span></span>
          )}{' '}
          leads
        </p>
        {refreshing && refreshMsg && (
          <p className="text-xs text-primary mt-0.5 animate-pulse">{refreshMsg}</p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Verified Priority quick-access view */}
        <Link
          href="/lead-management?view=verified-priority"
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold text-success border border-success/30 bg-success/5 hover:bg-success/15 transition-all duration-150 min-h-[44px]"
          title="View fully verified high-priority leads ready for agent assignment"
        >
          <ShieldCheck size={13} />
          <span className="hidden sm:inline">Verified Priority</span>
          <span className="sm:hidden">Priority</span>
        </Link>
        <button
          onClick={handleRefreshAll}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground border border-border bg-card hover:bg-muted transition-all duration-150 disabled:opacity-60 min-h-[44px]"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh Leads'}</span>
          <span className="sm:hidden">{refreshing ? '…' : 'Refresh'}</span>
        </button>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground border border-border bg-card hover:bg-muted transition-all duration-150 min-h-[44px]"
        >
          <Download size={13} />
          <span className="hidden sm:inline">Export All CSV</span>
          <span className="sm:hidden">Export</span>
        </button>
        {onExportFiltered && (
          <button
            onClick={onExportFiltered}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-emerald-700 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all duration-150 min-h-[44px]"
            title="Export current filtered view to CSV"
          >
            <Download size={13} />
            <span className="hidden sm:inline">Export Filtered</span>
            <span className="sm:hidden">Filtered</span>
          </button>
        )}
        <button
          onClick={onOpenCSV}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 transition-all duration-150 active:scale-95 min-h-[44px]"
        >
          <Upload size={13} />
          <span className="hidden sm:inline">Upload CSV</span>
          <span className="sm:hidden">Upload</span>
        </button>
      </div>
    </div>
  );
}