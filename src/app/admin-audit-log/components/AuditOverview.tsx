import React from 'react';
import { Database, FileSpreadsheet, Link2, ShieldCheck } from 'lucide-react';
import { StatGrid } from '@/components/ops';

export default function AuditOverview({
  totalRows,
  filteredRows,
  activeSources,
  leadLinkedRows,
  dormantSources,
}: {
  totalRows: number;
  filteredRows: number;
  activeSources: number;
  leadLinkedRows: number;
  dormantSources: number;
}) {
  return (
    <StatGrid
      stats={[
        { label: 'Total audit rows', value: totalRows, hint: 'Exact counts across the backing audit tables', icon: Database, tone: 'primary' },
        { label: 'Rows in current view', value: filteredRows, hint: 'Real filtered records only', icon: FileSpreadsheet, tone: 'success' },
        { label: 'Active source tables', value: activeSources, hint: 'Tables with at least one row', icon: ShieldCheck, tone: 'default' },
        { label: 'Lead-linked rows loaded', value: leadLinkedRows, hint: 'Loaded rows tied to a specific lead id', icon: Link2, tone: 'warning' },
        { label: 'Dormant audit tables', value: dormantSources, hint: 'Configured tables with zero rows right now', icon: ShieldCheck, tone: dormantSources > 0 ? 'warning' : 'success' },
      ]}
      columns={5}
    />
  );
}
