import type { AdminAuditEntry, AuditCategory, AuditSourceStat, AuditSourceTable } from './types';

export const SOURCE_LABELS: Record<AuditSourceTable, string> = {
  activity_events: 'activity_events',
  lead_activity_log: 'lead_activity_log',
  user_access_audit: 'user_access_audit',
  compliance_audit_log: 'compliance_audit_log',
  lead_audit_trail: 'lead_audit_trail',
};

export const SOURCE_DESCRIPTIONS: Record<AuditSourceTable, string> = {
  activity_events: 'Live activity feed rows written by imports and lead timeline actions.',
  lead_activity_log: 'Lead-level activity rows, currently populated heavily by enrichment flows.',
  user_access_audit: 'Role and permission audit table used by the admin roles page.',
  compliance_audit_log: 'Compliance communications audit table; configured in schema but may be empty.',
  lead_audit_trail: 'Legacy lead audit table used by auditTrailService; currently not populated in most environments.',
};

export function prettyLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatRelativeTime(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatDateHeading(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function categoryTone(category: AuditCategory): 'primary' | 'success' | 'warning' | 'danger' | 'default' {
  if (category === 'ingestion') return 'primary';
  if (category === 'enrichment') return 'success';
  if (category === 'access') return 'warning';
  if (category === 'compliance') return 'danger';
  return 'default';
}

export function sourceTone(sourceTable: AuditSourceTable): 'primary' | 'success' | 'warning' | 'danger' | 'default' {
  if (sourceTable === 'activity_events') return 'primary';
  if (sourceTable === 'lead_activity_log') return 'success';
  if (sourceTable === 'user_access_audit') return 'warning';
  if (sourceTable === 'compliance_audit_log') return 'danger';
  return 'default';
}

export function entryMatchesSearch(entry: AdminAuditEntry, query: string): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  return [
    entry.title,
    entry.summary || '',
    entry.eventType,
    entry.actorName || '',
    entry.actorEmail || '',
    entry.leadAddress || '',
    entry.leadId || '',
    entry.targetLabel || '',
    entry.reason || '',
    JSON.stringify(entry.metadata),
  ].join(' ').toLowerCase().includes(q);
}

export function entryLooksCrossTenant(entry: AdminAuditEntry): boolean {
  return [
    entry.title,
    entry.summary || '',
    entry.eventType,
    entry.reason || '',
    JSON.stringify(entry.metadata),
  ].join(' ').toLowerCase().includes('cross-tenant')
    || [entry.title, entry.summary || '', entry.eventType, entry.reason || '', JSON.stringify(entry.metadata)].join(' ').toLowerCase().includes('cross tenant')
    || [entry.title, entry.summary || '', entry.eventType, entry.reason || '', JSON.stringify(entry.metadata)].join(' ').toLowerCase().includes('org boundary');
}

function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function downloadEntriesCsv(entries: AdminAuditEntry[], filenamePrefix: string) {
  const header = ['timestamp', 'source_table', 'category', 'event_type', 'title', 'summary', 'actor_name', 'actor_email', 'lead_id', 'lead_address', 'lead_state', 'target', 'before', 'after', 'reason', 'metadata'];
  const rows = entries.map((entry) => [
    entry.timestamp,
    entry.sourceTable,
    entry.category,
    entry.eventType,
    entry.title,
    entry.summary || '',
    entry.actorName || '',
    entry.actorEmail || '',
    entry.leadId || '',
    entry.leadAddress || '',
    entry.leadState || '',
    entry.targetLabel || '',
    entry.beforeValue || '',
    entry.afterValue || '',
    entry.reason || '',
    JSON.stringify(entry.metadata),
  ].map((cell) => escapeCsvCell(String(cell))).join(','));

  const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function buildSourceStats(stats: Array<Pick<AuditSourceStat, 'sourceTable' | 'count' | 'lastSeenAt'>>): AuditSourceStat[] {
  return stats.map((stat) => ({
    ...stat,
    label: SOURCE_LABELS[stat.sourceTable],
    description: SOURCE_DESCRIPTIONS[stat.sourceTable],
  }));
}
