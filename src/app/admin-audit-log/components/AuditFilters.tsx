import React from 'react';
import { Search } from 'lucide-react';
import { Panel, buttonPrimary, buttonSecondary, inputClass } from '@/components/ops';
import type { AuditSourceStat, AuditSourceTable, AuditViewScope } from '../types';

export default function AuditFilters({
  search,
  onSearchChange,
  sourceFilter,
  onSourceFilterChange,
  scope,
  onScopeChange,
  sourceStats,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  sourceFilter: 'all' | AuditSourceTable;
  onSourceFilterChange: (value: 'all' | AuditSourceTable) => void;
  scope: AuditViewScope;
  onScopeChange: (value: AuditViewScope) => void;
  sourceStats: AuditSourceStat[];
}) {
  return (
    <Panel title="Search and filter" icon={Search}>
      <div className="space-y-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className={`${inputClass} pl-9`}
            placeholder="Search title, lead, actor, target, reason, or metadata"
          />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Source tables</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onSourceFilterChange('all')} className={sourceFilter === 'all' ? buttonPrimary : buttonSecondary}>All sources</button>
            {sourceStats.map((source) => (
              <button
                key={source.sourceTable}
                type="button"
                onClick={() => onSourceFilterChange(source.sourceTable)}
                className={sourceFilter === source.sourceTable ? buttonPrimary : buttonSecondary}
              >
                {source.label} ({source.count})
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Scope</p>
          <div className="flex flex-wrap gap-2">
            {([
              ['all', 'All rows'],
              ['lead-linked', 'Lead-linked only'],
              ['system', 'System-level only'],
            ] as Array<[AuditViewScope, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onScopeChange(value)}
                className={scope === value ? buttonPrimary : buttonSecondary}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
