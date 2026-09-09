'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useNotifications } from '@/contexts/NotificationContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  buildSyncCompleteNotification,
  buildEnrichmentStageNotification,
} from '@/lib/services/syncToastService';

/**
 * SyncToastEmitter — mounts once in AppLayout.
 *
 * Uses Supabase Realtime subscriptions (postgres_changes) instead of 60-second
 * polling, eliminating the N-users × 60s fan-out bottleneck:
 *
 *  1. sync_events        — fires when a sync completes (status = 'success')
 *  2. lead_enrichments   — fires when stage2 or stage3 completes on a high-priority lead
 *  3. sequence_enrollments — fires when a lead is auto-enrolled in a sequence
 *  4. outreach_history   — fires when outreach status changes (bounced / replied)
 */
export default function SyncToastEmitter() {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const supabase = createClient();
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!user) return;

    // ── 1. sync_events — notify on new success rows ──────────────────────────
    const syncChannel = supabase
      .channel('toast-sync-events')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sync_events',
          filter: `status=eq.success`,
        },
        async (payload) => {
          const event = payload.new as Record<string, unknown>;
          const portfolio =
            (event.operation_id as string) ||
            ((event.metadata as Record<string, unknown>)?.portfolio as string) ||
            'Unknown Portfolio';
          const meta = (event.payload as Record<string, unknown>) ||
            (event.metadata as Record<string, unknown>) || {};
          const notif = buildSyncCompleteNotification({
            portfolio,
            leadsImported:
              (meta.leads_imported as number) || (meta.success_count as number) || 0,
            duplicatesRemoved:
              (meta.duplicates_removed as number) || (meta.dedup_count as number) || 0,
            errors: (meta.errors as number) || (meta.error_count as number) || 0,
            sourcesRun: 1,
          });
          await addNotification(notif);
        }
      )
      // Also catch UPDATE rows that transition to 'success'
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sync_events',
          filter: `status=eq.success`,
        },
        async (payload) => {
          const event = payload.new as Record<string, unknown>;
          const oldEvent = payload.old as Record<string, unknown>;
          // Only fire if status actually changed to success
          if (oldEvent?.status === 'success') return;
          const portfolio =
            (event.operation_id as string) ||
            ((event.metadata as Record<string, unknown>)?.portfolio as string) ||
            'Unknown Portfolio';
          const meta = (event.payload as Record<string, unknown>) ||
            (event.metadata as Record<string, unknown>) || {};
          const notif = buildSyncCompleteNotification({
            portfolio,
            leadsImported:
              (meta.leads_imported as number) || (meta.success_count as number) || 0,
            duplicatesRemoved:
              (meta.duplicates_removed as number) || (meta.dedup_count as number) || 0,
            errors: (meta.errors as number) || (meta.error_count as number) || 0,
            sourcesRun: 1,
          });
          await addNotification(notif);
        }
      )
      .subscribe();

    // ── 2. lead_enrichments — stage2 / stage3 completions ───────────────────
    const enrichChannel = supabase
      .channel('toast-lead-enrichments')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'lead_enrichments' },
        async (payload) => {
          const row = payload.new as Record<string, unknown>;
          const old = payload.old as Record<string, unknown>;

          // Stage 2 just completed
          if (row.stage2_completed_at && !old.stage2_completed_at) {
            const { data: leadData } = await supabase
              .from('leads')
              .select('address, city, state, prospect_score, portfolio')
              .eq('id', row.lead_id as string)
              .single();
            if (leadData) {
              const notif = buildEnrichmentStageNotification({
                stage: 2,
                leadId: row.lead_id as string,
                leadAddress: `${leadData.address || 'Unknown'}, ${leadData.city || ''}`,
                prospectScore: (leadData.prospect_score as number) || 0,
                portfolio: (leadData.portfolio as string) || undefined,
              });
              if (notif) await addNotification(notif);
            }
          }

          // Stage 3 just completed
          if (row.stage3_completed_at && !old.stage3_completed_at) {
            const { data: leadData } = await supabase
              .from('leads')
              .select('address, city, state, prospect_score, portfolio')
              .eq('id', row.lead_id as string)
              .single();
            if (leadData) {
              const notif = buildEnrichmentStageNotification({
                stage: 3,
                leadId: row.lead_id as string,
                leadAddress: `${leadData.address || 'Unknown'}, ${leadData.city || ''}`,
                prospectScore: (leadData.prospect_score as number) || 0,
                portfolio: (leadData.portfolio as string) || undefined,
              });
              if (notif) await addNotification(notif);
            }
          }
        }
      )
      .subscribe();

    // ── 3. sequence_enrollments — auto-enrollment notifications ─────────────
    const enrollChannel = supabase
      .channel('toast-sequence-enrollments')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sequence_enrollments' },
        async (payload) => {
          const row = payload.new as Record<string, unknown>;
          // Only surface auto-enrollments (triggered by conditions, not manual)
          if (row.enroll_reason !== 'auto') return;

          const { data: leadData } = await supabase
            .from('leads')
            .select('address, city, state, prospect_score')
            .eq('id', row.lead_id as string)
            .single();

          const { data: seqData } = await supabase
            .from('follow_up_sequences')
            .select('name')
            .eq('id', row.sequence_id as string)
            .single();

          if (leadData && seqData) {
            await addNotification({
              type: 'sequence_enrollment' as const,
              title: `Auto-enrolled in sequence`,
              message: `${leadData.address || 'Lead'}, ${leadData.city || ''} → "${seqData.name}" (score ${leadData.prospect_score ?? 0})`,
              metadata: {
                lead_id: row.lead_id as string,
                sequence_id: row.sequence_id as string,
                sequence_name: seqData.name,
                enroll_reason: row.enroll_reason as string,
              },
            });
          }
        }
      )
      .subscribe();

    // ── 4. outreach_history — bounced / replied status changes ───────────────
    const outreachChannel = supabase
      .channel('toast-outreach-status')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'outreach_history' },
        async (payload) => {
          const row = payload.new as Record<string, unknown>;
          const old = payload.old as Record<string, unknown>;
          const newStatus = row.status as string;
          const oldStatus = old.status as string;

          // Only fire on meaningful status transitions
          if (newStatus === oldStatus) return;
          if (newStatus !== 'bounced' && newStatus !== 'replied') return;

          const { data: leadData } = await supabase
            .from('leads')
            .select('address, city')
            .eq('id', row.lead_id as string)
            .single();

          const leadLabel = leadData
            ? `${leadData.address || 'Lead'}, ${leadData.city || ''}`
            : `Lead ${row.lead_id}`;

          if (newStatus === 'replied') {
            await addNotification({
              type: 'outreach_replied' as const,
              title: `Reply received`,
              message: `${leadLabel} replied to your ${row.channel || 'outreach'}`,
              metadata: {
                lead_id: row.lead_id as string,
                channel: row.channel as string,
                outreach_id: row.id as string,
              },
            });
          } else if (newStatus === 'bounced') {
            await addNotification({
              type: 'outreach_bounced' as const,
              title: `Outreach bounced`,
              message: `${leadLabel} — ${row.channel || 'message'} bounced (${row.bounce_type || 'unknown'})`,
              metadata: {
                lead_id: row.lead_id as string,
                channel: row.channel as string,
                bounce_type: row.bounce_type as string,
                outreach_id: row.id as string,
              },
            });
          }
        }
      )
      .subscribe();

    mountedRef.current = true;

    return () => {
      supabase.removeChannel(syncChannel);
      supabase.removeChannel(enrichChannel);
      supabase.removeChannel(enrollChannel);
      supabase.removeChannel(outreachChannel);
    };
  }, [user, addNotification, supabase]);

  return null;
}
