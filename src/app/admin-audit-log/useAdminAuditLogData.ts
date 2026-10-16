'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AdminAuditEntry, AuditSourceStat } from './types';
import { buildSourceStats, prettyLabel } from './utils';

type UserLookup = Record<string, { full_name: string | null; email: string | null; app_role: string | null }>;
type LeadLookup = Record<string, { address: string | null; state: string | null }>;

type ActivityRow = {
  id: string;
  lead_id: string | null;
  lead_address: string | null;
  lead_state: string | null;
  event_type: string;
  description: string | null;
  detail: string | null;
  previous_value: string | null;
  new_value: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
  event_timestamp: string | null;
  created_at: string;
};

type LeadActivityRow = {
  id: string;
  lead_id: string | null;
  activity_type: string;
  activity_data: Record<string, unknown> | null;
  performed_by: string | null;
  performed_by_name: string | null;
  created_at: string;
};

type AccessAuditRow = {
  id: string;
  target_user_id: string | null;
  changed_by: string | null;
  change_type: string;
  old_value: unknown;
  new_value: unknown;
  notes: string | null;
  created_at: string;
};

type ComplianceRow = {
  id: string;
  lead_id: string | null;
  lead_address: string | null;
  actor_name: string | null;
  actor_email: string | null;
  event_type: string | null;
  description: string | null;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  channel: string | null;
  created_at: string;
};

type LegacyTrailRow = {
  id: string;
  lead_id: string | null;
  event_type: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by_user_id: string | null;
  changed_by_email: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function stringifyValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function summarizeActivityData(value: Record<string, unknown> | null): string | null {
  if (!value) return null;
  const description = typeof value.description === 'string' ? value.description : null;
  if (description) return description;
  const title = typeof value.title === 'string' ? value.title : null;
  const body = typeof value.body === 'string' ? value.body : null;
  if (title && body) return `${title} — ${body}`;
  if (title) return title;
  return null;
}

async function fetchLookup<T extends { id: string }>(
  loader: (ids: string[]) => Promise<T[]>,
  ids: string[],
): Promise<Record<string, T>> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return {};

  const result: Record<string, T> = {};
  for (let index = 0; index < uniqueIds.length; index += 100) {
    const chunk = uniqueIds.slice(index, index + 100);
    const rows = await loader(chunk);
    for (const row of rows) result[row.id] = row;
  }
  return result;
}

export function useAdminAuditLogData() {
  const supabase = useMemo(() => createClient(), []);
  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [sourceStats, setSourceStats] = useState<AuditSourceStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [
        activityCountRes,
        leadActivityCountRes,
        accessCountRes,
        complianceCountRes,
        legacyCountRes,
        activityRes,
        leadActivityRes,
        accessRes,
        complianceRes,
        legacyRes,
      ] = await Promise.all([
        supabase.from('activity_events').select('*', { count: 'exact', head: true }),
        supabase.from('lead_activity_log').select('*', { count: 'exact', head: true }),
        supabase.from('user_access_audit').select('*', { count: 'exact', head: true }),
        supabase.from('compliance_audit_log').select('*', { count: 'exact', head: true }),
        supabase.from('lead_audit_trail').select('*', { count: 'exact', head: true }),
        supabase
          .from('activity_events')
          .select('id,lead_id,lead_address,lead_state,event_type,description,detail,previous_value,new_value,actor_user_id,actor_email,source,metadata,event_timestamp,created_at')
          .order('event_timestamp', { ascending: false })
          .limit(250),
        supabase
          .from('lead_activity_log')
          .select('id,lead_id,activity_type,activity_data,performed_by,performed_by_name,created_at')
          .order('created_at', { ascending: false })
          .limit(250),
        supabase
          .from('user_access_audit')
          .select('id,target_user_id,changed_by,change_type,old_value,new_value,notes,created_at')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('compliance_audit_log')
          .select('id,lead_id,lead_address,actor_name,actor_email,event_type,description,old_value,new_value,reason,metadata,channel,created_at')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('lead_audit_trail')
          .select('id,lead_id,event_type,field_name,old_value,new_value,changed_by_user_id,changed_by_email,metadata,created_at')
          .order('created_at', { ascending: false })
          .limit(100),
      ]);

      for (const response of [activityCountRes, leadActivityCountRes, accessCountRes, complianceCountRes, legacyCountRes, activityRes, leadActivityRes, accessRes, complianceRes, legacyRes]) {
        if (response.error) throw response.error;
      }

      const activityRows = (activityRes.data || []) as ActivityRow[];
      const leadActivityRows = (leadActivityRes.data || []) as LeadActivityRow[];
      const accessRows = (accessRes.data || []) as AccessAuditRow[];
      const complianceRows = (complianceRes.data || []) as ComplianceRow[];
      const legacyRows = (legacyRes.data || []) as LegacyTrailRow[];

      const leadIds = [
        ...activityRows.map((row) => row.lead_id),
        ...leadActivityRows.map((row) => row.lead_id),
        ...complianceRows.map((row) => row.lead_id),
        ...legacyRows.map((row) => row.lead_id),
      ].filter(Boolean) as string[];

      const userIds = [
        ...activityRows.map((row) => row.actor_user_id),
        ...leadActivityRows.map((row) => row.performed_by),
        ...accessRows.flatMap((row) => [row.target_user_id, row.changed_by]),
        ...legacyRows.map((row) => row.changed_by_user_id),
      ].filter(Boolean) as string[];

      const [leadLookup, userLookup] = await Promise.all([
        fetchLookup(async (ids) => {
          const { data, error } = await supabase.from('leads').select('id,address,state').in('id', ids);
          if (error) throw error;
          return (data || []) as Array<{ id: string; address: string | null; state: string | null }>;
        }, leadIds) as Promise<LeadLookup>,
        fetchLookup(async (ids) => {
          const { data, error } = await supabase.from('user_profiles').select('id,full_name,email,app_role').in('id', ids);
          if (error) throw error;
          return (data || []) as Array<{ id: string; full_name: string | null; email: string | null; app_role: string | null }>;
        }, userIds) as Promise<UserLookup>,
      ]);

      const normalizedEntries: AdminAuditEntry[] = [
        ...activityRows.map((row) => ({
          id: row.id,
          sourceTable: 'activity_events' as const,
          timestamp: row.event_timestamp || row.created_at,
          category: ['csv_imported', 'sync_imported', 'lead_created'].includes(row.event_type) ? 'ingestion' as const : 'lead' as const,
          eventType: row.event_type,
          title: row.description || prettyLabel(row.event_type),
          summary: row.detail || stringifyValue(row.metadata?.importFilename) || null,
          actorName: row.actor_user_id ? userLookup[row.actor_user_id]?.full_name || row.actor_email || null : row.actor_email || 'System',
          actorEmail: row.actor_email || userLookup[row.actor_user_id || '']?.email || null,
          leadId: row.lead_id || null,
          leadAddress: row.lead_address || leadLookup[row.lead_id || '']?.address || null,
          leadState: row.lead_state || leadLookup[row.lead_id || '']?.state || null,
          targetLabel: row.source || null,
          beforeValue: row.previous_value || null,
          afterValue: row.new_value || null,
          reason: null,
          metadata: row.metadata || {},
        })),
        ...leadActivityRows.map((row) => ({
          id: row.id,
          sourceTable: 'lead_activity_log' as const,
          timestamp: row.created_at,
          category: row.activity_type.toUpperCase().includes('ENRICH') ? 'enrichment' as const : 'lead' as const,
          eventType: row.activity_type,
          title: summarizeActivityData(row.activity_data) || prettyLabel(row.activity_type),
          summary: stringifyValue(row.activity_data?.provider) || null,
          actorName: row.performed_by_name || userLookup[row.performed_by || '']?.full_name || null,
          actorEmail: userLookup[row.performed_by || '']?.email || null,
          leadId: row.lead_id || null,
          leadAddress: leadLookup[row.lead_id || '']?.address || null,
          leadState: leadLookup[row.lead_id || '']?.state || null,
          targetLabel: null,
          beforeValue: null,
          afterValue: null,
          reason: null,
          metadata: row.activity_data || {},
        })),
        ...accessRows.map((row) => {
          const targetProfile = userLookup[row.target_user_id || ''];
          const changedByProfile = userLookup[row.changed_by || ''];
          return {
            id: row.id,
            sourceTable: 'user_access_audit' as const,
            timestamp: row.created_at,
            category: 'access' as const,
            eventType: row.change_type,
            title: prettyLabel(row.change_type),
            summary: row.notes || null,
            actorName: changedByProfile?.full_name || changedByProfile?.email || null,
            actorEmail: changedByProfile?.email || null,
            leadId: null,
            leadAddress: null,
            leadState: null,
            targetLabel: targetProfile?.full_name || targetProfile?.email || row.target_user_id || null,
            beforeValue: stringifyValue(row.old_value),
            afterValue: stringifyValue(row.new_value),
            reason: row.notes || null,
            metadata: {},
          };
        }),
        ...complianceRows.map((row) => ({
          id: row.id,
          sourceTable: 'compliance_audit_log' as const,
          timestamp: row.created_at,
          category: 'compliance' as const,
          eventType: row.event_type || row.channel || 'compliance_event',
          title: row.description || prettyLabel(row.event_type || row.channel || 'compliance_event'),
          summary: row.reason || null,
          actorName: row.actor_name || row.actor_email || null,
          actorEmail: row.actor_email || null,
          leadId: row.lead_id || null,
          leadAddress: row.lead_address || leadLookup[row.lead_id || '']?.address || null,
          leadState: leadLookup[row.lead_id || '']?.state || null,
          targetLabel: row.channel || null,
          beforeValue: row.old_value || null,
          afterValue: row.new_value || null,
          reason: row.reason || null,
          metadata: row.metadata || {},
        })),
        ...legacyRows.map((row) => ({
          id: row.id,
          sourceTable: 'lead_audit_trail' as const,
          timestamp: row.created_at,
          category: 'lead' as const,
          eventType: row.event_type,
          title: row.field_name ? `${prettyLabel(row.field_name)} updated` : prettyLabel(row.event_type),
          summary: row.field_name ? `${row.old_value || '—'} → ${row.new_value || '—'}` : null,
          actorName: row.changed_by_email || userLookup[row.changed_by_user_id || '']?.full_name || null,
          actorEmail: row.changed_by_email || userLookup[row.changed_by_user_id || '']?.email || null,
          leadId: row.lead_id || null,
          leadAddress: leadLookup[row.lead_id || '']?.address || null,
          leadState: leadLookup[row.lead_id || '']?.state || null,
          targetLabel: row.field_name || null,
          beforeValue: row.old_value || null,
          afterValue: row.new_value || null,
          reason: null,
          metadata: row.metadata || {},
        })),
      ].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      setEntries(normalizedEntries);
      setSourceStats(buildSourceStats([
        { sourceTable: 'activity_events', count: activityCountRes.count || 0, lastSeenAt: activityRows[0]?.event_timestamp || activityRows[0]?.created_at || null },
        { sourceTable: 'lead_activity_log', count: leadActivityCountRes.count || 0, lastSeenAt: leadActivityRows[0]?.created_at || null },
        { sourceTable: 'user_access_audit', count: accessCountRes.count || 0, lastSeenAt: accessRows[0]?.created_at || null },
        { sourceTable: 'compliance_audit_log', count: complianceCountRes.count || 0, lastSeenAt: complianceRows[0]?.created_at || null },
        { sourceTable: 'lead_audit_trail', count: legacyCountRes.count || 0, lastSeenAt: legacyRows[0]?.created_at || null },
      ]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the admin audit log.');
      setEntries([]);
      setSourceStats([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  return { entries, sourceStats, loading, error, reload: load };
}
