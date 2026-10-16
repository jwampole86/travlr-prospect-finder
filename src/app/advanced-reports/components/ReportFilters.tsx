'use client';

import React, { useState } from 'react';
import { ChevronDown, Download, Filter, Play, RotateCcw } from 'lucide-react';
import { buttonPrimary, buttonSecondary, inputClass } from '@/components/ops';
import type { ReportFilters, ReportOptions } from '../reporting';

function MultiSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string[];
  options: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (option: string) => {
    if (value.includes(option)) onChange(value.filter((item) => item !== option));
    else onChange([...value, option]);
  };

  return (
    <div className="relative">
      <button type="button" className={`${buttonSecondary} min-w-[180px] justify-between`} onClick={() => setOpen((current) => !current)}>
        <span className="truncate">{value.length ? `${label} (${value.length})` : label}</span>
        <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-72 rounded-2xl border border-border bg-card p-2 shadow-xl">
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {options.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No live values found yet.</p>
            ) : (
              options.map((option) => {
                const checked = value.includes(option);
                return (
                  <label key={option} className="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm text-foreground hover:bg-muted/60">
                    <input type="checkbox" checked={checked} onChange={() => toggle(option)} className="accent-current" />
                    <span className="truncate">{option}</span>
                  </label>
                );
              })
            )}
          </div>
          {value.length > 0 && (
            <button
              type="button"
              className="mt-2 w-full rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              onClick={() => {
                setOpen(false);
                onChange([]);
              }}
            >
              Clear {label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReportFilters({
  filters,
  options,
  loading,
  dirty,
  exportDisabled,
  onChange,
  onRun,
  onReset,
  onExport,
}: {
  filters: ReportFilters;
  options: ReportOptions;
  loading: boolean;
  dirty: boolean;
  exportDisabled: boolean;
  onChange: (patch: Partial<ReportFilters>) => void;
  onRun: () => void;
  onReset: () => void;
  onExport: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Filter size={16} className="text-primary" />
        Real-data filters
      </div>
      <div className="grid gap-3 xl:grid-cols-[repeat(6,minmax(0,1fr))]">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Date range</label>
          <select
            value={filters.dateRange}
            onChange={(event) => onChange({ dateRange: event.target.value as ReportFilters['dateRange'] })}
            className={inputClass}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="mtd">Month to date</option>
            <option value="ytd">Year to date</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        {filters.dateRange === 'custom' && (
          <>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Start date</label>
              <input type="date" value={filters.startDate} onChange={(event) => onChange({ startDate: event.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">End date</label>
              <input type="date" value={filters.endDate} onChange={(event) => onChange({ endDate: event.target.value })} className={inputClass} />
            </div>
          </>
        )}
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Minimum score</label>
          <input type="number" min={0} max={100} value={filters.scoreMin} onChange={(event) => onChange({ scoreMin: Number(event.target.value) || 0 })} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Maximum score</label>
          <input type="number" min={0} max={100} value={filters.scoreMax} onChange={(event) => onChange({ scoreMax: Number(event.target.value) || 0 })} className={inputClass} />
        </div>
        <div className="xl:col-span-2">
          <label className="mb-1 block text-xs text-muted-foreground">Sources</label>
          <MultiSelect label="All sources" value={filters.sources} options={options.sources} onChange={(sources) => onChange({ sources })} />
        </div>
        <div className="xl:col-span-2">
          <label className="mb-1 block text-xs text-muted-foreground">Stages</label>
          <MultiSelect label="All stages" value={filters.stages} options={options.stages} onChange={(stages) => onChange({ stages })} />
        </div>
        <div className="xl:col-span-2">
          <label className="mb-1 block text-xs text-muted-foreground">Agents</label>
          <MultiSelect label="All agents" value={filters.agents} options={options.agents} onChange={(agents) => onChange({ agents })} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Counts and exports are computed from paginated leads, outreach_history, and sms_lead_engagement.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonSecondary} onClick={onReset}>
            <RotateCcw size={14} />
            Reset
          </button>
          <button type="button" className={buttonSecondary} onClick={onExport} disabled={exportDisabled || loading}>
            <Download size={14} />
            Export CSV
          </button>
          <button type="button" className={buttonPrimary} onClick={onRun} disabled={loading || !dirty}>
            <Play size={14} />
            {loading ? 'Running…' : dirty ? 'Run report' : 'Up to date'}
          </button>
        </div>
      </div>
    </div>
  );
}
