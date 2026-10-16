export type AuditSourceTable =
  | 'activity_events'
  | 'lead_activity_log'
  | 'user_access_audit'
  | 'compliance_audit_log'
  | 'lead_audit_trail';

export type AuditCategory = 'ingestion' | 'lead' | 'enrichment' | 'access' | 'compliance';
export type TabId = 'log' | 'cross_tenant' | 'compliance';
export type AuditViewScope = 'all' | 'lead-linked' | 'system';

export interface AdminAuditEntry {
  id: string;
  sourceTable: AuditSourceTable;
  timestamp: string;
  category: AuditCategory;
  eventType: string;
  title: string;
  summary: string | null;
  actorName: string | null;
  actorEmail: string | null;
  leadId: string | null;
  leadAddress: string | null;
  leadState: string | null;
  targetLabel: string | null;
  beforeValue: string | null;
  afterValue: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
}

export interface AuditSourceStat {
  sourceTable: AuditSourceTable;
  label: string;
  description: string;
  count: number;
  lastSeenAt: string | null;
}
