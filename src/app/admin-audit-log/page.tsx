'use client';

import React, { useMemo, useState } from 'react';
import { Download, RefreshCw, ShieldCheck } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { EmptyState, ErrorBanner, LoadingState, PageHeader, SegmentedTabs } from '@/components/ops';
import AuditFilters from './components/AuditFilters';
import AuditOverview from './components/AuditOverview';
import AuditSourcesPanel from './components/AuditSourcesPanel';
import AuditTimeline from './components/AuditTimeline';
import CompliancePanel from './components/CompliancePanel';
import CrossTenantPanel from './components/CrossTenantPanel';
import type { AuditSourceTable, AuditViewScope, TabId } from './types';
import { downloadEntriesCsv, entryLooksCrossTenant, entryMatchesSearch } from './utils';
import { useAdminAuditLogData } from './useAdminAuditLogData';

export default function AdminAuditLogPage() {
  const { entries, sourceStats, loading, error, reload } = useAdminAuditLogData();
  const [activeTab, setActiveTab] = useState<TabId>('log');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | AuditSourceTable>('all');
  const [scope, setScope] = useState<AuditViewScope>('all');

  const totalRows = useMemo(() => sourceStats.reduce((sum, source) => sum + source.count, 0), [sourceStats]);
  const activeSources = useMemo(() => sourceStats.filter((source) => source.count > 0).length, [sourceStats]);
  const dormantSources = useMemo(() => sourceStats.filter((source) => source.count === 0).length, [sourceStats]);

  const baseEntries = useMemo(() => {
    if (activeTab === 'cross_tenant') return entries.filter(entryLooksCrossTenant);
    if (activeTab === 'compliance') return entries.filter((entry) => entry.sourceTable === 'compliance_audit_log');
    return entries;
  }, [activeTab, entries]);

  const filteredEntries = useMemo(() => {
    return baseEntries.filter((entry) => {
      if (sourceFilter !== 'all' && entry.sourceTable !== sourceFilter) return false;
      if (scope === 'lead-linked' && !entry.leadId) return false;
      if (scope === 'system' && entry.leadId) return false;
      return entryMatchesSearch(entry, search);
    });
  }, [baseEntries, scope, search, sourceFilter]);

  const leadLinkedRows = useMemo(() => filteredEntries.filter((entry) => !!entry.leadId).length, [filteredEntries]);
  const crossTenantCount = useMemo(() => entries.filter(entryLooksCrossTenant).length, [entries]);
  const complianceCount = useMemo(() => entries.filter((entry) => entry.sourceTable === 'compliance_audit_log').length, [entries]);
  const complianceSource = sourceStats.find((source) => source.sourceTable === 'compliance_audit_log');

  const handleExport = () => {
    if (filteredEntries.length === 0) return;
    const prefix = activeTab === 'cross_tenant' ? 'admin-audit-cross-tenant' : activeTab === 'compliance' ? 'admin-audit-compliance' : 'admin-audit-log';
    downloadEntriesCsv(filteredEntries, prefix);
  };

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <PageHeader
          icon={ShieldCheck}
          title="Admin Audit Log"
          description="Real audit view of the tables the app actually writes today. activity_events and lead_activity_log are populated; other audit tables may honestly show as empty."
          actions={
            <>
              <button
                type="button"
                onClick={handleExport}
                disabled={filteredEntries.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
              >
                <Download size={16} />
                Export current view
              </button>
              <button
                type="button"
                onClick={() => void reload()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </>
          }
        />

        {error && <ErrorBanner message={error} onRetry={() => void reload()} />}

        {loading && sourceStats.length === 0 ? (
          <LoadingState label="Loading live audit tables…" />
        ) : entries.length === 0 && !loading ? (
          <EmptyState
            icon={ShieldCheck}
            title="No audit data could be loaded"
            hint="If the backing tables are empty, this page now reports that honestly instead of showing fabricated admin activity."
          />
        ) : (
          <>
            <SegmentedTabs
              value={activeTab}
              onChange={setActiveTab}
              tabs={[
                { key: 'log', label: 'Audit Log' },
                { key: 'cross_tenant', label: 'Cross-tenant', badge: crossTenantCount },
                { key: 'compliance', label: 'Compliance', badge: complianceCount },
              ]}
            />

            <AuditOverview
              totalRows={totalRows}
              filteredRows={filteredEntries.length}
              activeSources={activeSources}
              leadLinkedRows={leadLinkedRows}
              dormantSources={dormantSources}
            />

            <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
              <div className="space-y-6">
                <AuditFilters
                  search={search}
                  onSearchChange={setSearch}
                  sourceFilter={sourceFilter}
                  onSourceFilterChange={setSourceFilter}
                  scope={scope}
                  onScopeChange={setScope}
                  sourceStats={sourceStats}
                />

                {activeTab === 'log' && (
                  <AuditTimeline
                    entries={filteredEntries}
                    emptyTitle="No audit rows match the current filters"
                    emptyHint="The export button stays honest too: if nothing matches, there is nothing to export."
                  />
                )}

                {activeTab === 'cross_tenant' && (
                  <CrossTenantPanel entries={filteredEntries} sourceStats={sourceStats} />
                )}

                {activeTab === 'compliance' && (
                  <CompliancePanel entries={filteredEntries} complianceSource={complianceSource} />
                )}
              </div>

              <AuditSourcesPanel sourceStats={sourceStats} />
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
