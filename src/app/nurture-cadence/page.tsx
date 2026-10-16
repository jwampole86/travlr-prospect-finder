'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, Mail, RefreshCcw, Shield, TimerReset, Users, Zap } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  Panel,
  StatGrid,
  StatusPill,
  buttonPrimary,
  buttonSecondary,
} from '@/components/ops';
import { createClient } from '@/lib/supabase/client';
import CadenceAuditPanel from './components/CadenceAuditPanel';
import CadenceSequenceEditor from './components/CadenceSequenceEditor';
import CadenceSequenceList from './components/CadenceSequenceList';
import type { CadenceSequence, CadenceStats, CadenceStep } from './components/types';

function parseSteps(raw: unknown): CadenceStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((step, index) => {
    const item = typeof step === 'object' && step ? (step as Record<string, unknown>) : {};
    return {
      step: typeof item.step === 'number' ? item.step : index,
      label: typeof item.label === 'string' ? item.label : `Step ${index + 1}`,
      channel: item.channel === 'sms' ? 'sms' : 'email',
      delay_days: typeof item.delay_days === 'number' ? item.delay_days : 0,
      delay_hours: typeof item.delay_hours === 'number' ? item.delay_hours : 0,
      template_key: typeof item.template_key === 'string' ? item.template_key : '',
      subject: typeof item.subject === 'string' ? item.subject : null,
    };
  });
}

export default function NurtureCadencePage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [sequences, setSequences] = useState<CadenceSequence[]>([]);
  const [activeSeqId, setActiveSeqId] = useState<string | null>(null);
  const [stats, setStats] = useState<CadenceStats>({
    sequenceCount: 0,
    activeSequenceCount: 0,
    defaultSequenceCount: 0,
    enrollmentCount: 0,
    activeEnrollmentCount: 0,
    completedEnrollmentCount: 0,
    escalatedEnrollmentCount: 0,
    unsubscribedEnrollmentCount: 0,
    sendCount: 0,
    unsubscribeTokenCount: 0,
    newLeadCount: 0,
    nurturingLeadCount: 0,
    humanOutreachCount: 0,
    scheduledTouchCount: 0,
  });
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const count = async (query: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
      const result = await query;
      if (result.error) throw new Error(result.error.message);
      return result.count ?? 0;
    };

    try {
      const [sequenceResult, nextStats] = await Promise.all([
        supabase.from('cadence_sequences').select('id,name,description,is_active,is_default,trigger_stage,steps,created_at,updated_at').order('created_at', { ascending: true }),
        Promise.all([
          count(supabase.from('cadence_sequences').select('*', { count: 'exact', head: true })),
          count(supabase.from('cadence_sequences').select('*', { count: 'exact', head: true }).eq('is_active', true)),
          count(supabase.from('cadence_sequences').select('*', { count: 'exact', head: true }).eq('is_default', true)),
          count(supabase.from('cadence_enrollments').select('*', { count: 'exact', head: true })),
          count(supabase.from('cadence_enrollments').select('*', { count: 'exact', head: true }).eq('status', 'active')),
          count(supabase.from('cadence_enrollments').select('*', { count: 'exact', head: true }).eq('status', 'completed')),
          count(supabase.from('cadence_enrollments').select('*', { count: 'exact', head: true }).eq('status', 'escalated')),
          count(supabase.from('cadence_enrollments').select('*', { count: 'exact', head: true }).eq('status', 'unsubscribed')),
          count(supabase.from('cadence_send_log').select('*', { count: 'exact', head: true })),
          count(supabase.from('email_unsubscribe_tokens').select('*', { count: 'exact', head: true })),
          count(supabase.from('leads').select('*', { count: 'exact', head: true }).eq('stage', 'New Lead')),
          count(supabase.from('leads').select('*', { count: 'exact', head: true }).eq('stage', 'nurturing')),
          count(supabase.from('leads').select('*', { count: 'exact', head: true }).eq('stage', 'human_outreach')),
          count(supabase.from('leads').select('*', { count: 'exact', head: true }).not('next_scheduled_touch_at', 'is', null)),
        ]),
      ]);

      if (sequenceResult.error) throw new Error(sequenceResult.error.message);

      const parsed = (sequenceResult.data ?? []).map((sequence) => ({
        ...(sequence as Omit<CadenceSequence, 'steps'>),
        steps: parseSteps((sequence as { steps: unknown }).steps),
      }));

      setSequences(parsed);
      setActiveSeqId((current) => current && parsed.some((sequence) => sequence.id === current) ? current : parsed[0]?.id ?? null);
      setStats({
        sequenceCount: nextStats[0],
        activeSequenceCount: nextStats[1],
        defaultSequenceCount: nextStats[2],
        enrollmentCount: nextStats[3],
        activeEnrollmentCount: nextStats[4],
        completedEnrollmentCount: nextStats[5],
        escalatedEnrollmentCount: nextStats[6],
        unsubscribedEnrollmentCount: nextStats[7],
        sendCount: nextStats[8],
        unsubscribeTokenCount: nextStats[9],
        newLeadCount: nextStats[10],
        nurturingLeadCount: nextStats[11],
        humanOutreachCount: nextStats[12],
        scheduledTouchCount: nextStats[13],
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load cadence data.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load, refreshToken]);

  const filteredSequences = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return sequences;
    return sequences.filter((sequence) => `${sequence.name} ${sequence.description || ''} ${sequence.trigger_stage}`.toLowerCase().includes(needle));
  }, [search, sequences]);

  const activeSequence = sequences.find((sequence) => sequence.id === activeSeqId) ?? null;
  const triggerStageSuggestions = useMemo(() => {
    return Array.from(new Set([
      ...sequences.map((sequence) => sequence.trigger_stage).filter(Boolean),
      'New Lead',
      'nurturing',
      'Interested',
      'Proposal Sent',
      'human_outreach',
    ])).sort();
  }, [sequences]);

  function updateActiveSequence(updates: Partial<CadenceSequence>) {
    if (!activeSeqId) return;
    setSequences((current) => current.map((sequence) => sequence.id === activeSeqId ? { ...sequence, ...updates } : sequence));
  }

  function removeStep(index: number) {
    if (!activeSequence) return;
    const steps = activeSequence.steps.filter((_, stepIndex) => stepIndex !== index).map((step, stepIndex) => ({ ...step, step: stepIndex }));
    updateActiveSequence({ steps });
  }

  async function handleSave() {
    if (!activeSequence) return;
    const normalized = {
      ...activeSequence,
      name: activeSequence.name.trim(),
      trigger_stage: activeSequence.trigger_stage.trim(),
      description: activeSequence.description?.trim() || null,
      steps: activeSequence.steps.map((step, index) => ({
        ...step,
        step: index,
        label: step.label.trim() || `Step ${index + 1}`,
        template_key: step.template_key.trim(),
        subject: step.channel === 'email' ? (step.subject?.trim() || null) : null,
      })),
    };

    if (!normalized.name) {
      toast.error('Sequence name is required.');
      return;
    }

    setSaving(true);
    const { error: saveError } = await supabase
      .from('cadence_sequences')
      .update({
        name: normalized.name,
        description: normalized.description,
        is_active: normalized.is_active,
        trigger_stage: normalized.trigger_stage,
        steps: normalized.steps,
        updated_at: new Date().toISOString(),
      })
      .eq('id', normalized.id);
    setSaving(false);

    if (saveError) {
      toast.error(saveError.message);
      return;
    }

    setSequences((current) => current.map((sequence) => sequence.id === normalized.id ? normalized : sequence));
    toast.success('Cadence sequence saved.');
    setRefreshToken((value) => value + 1);
  }

  async function handleNewSequence() {
    const { data, error: insertError } = await supabase
      .from('cadence_sequences')
      .insert({
        name: 'New Sequence',
        description: null,
        is_active: false,
        is_default: false,
        trigger_stage: 'New Lead',
        steps: [],
      })
      .select('id,name,description,is_active,is_default,trigger_stage,steps,created_at,updated_at')
      .single();

    if (insertError || !data) {
      toast.error(insertError?.message || 'Failed to create a new sequence.');
      return;
    }

    const next = { ...data, steps: parseSteps(data.steps) } as CadenceSequence;
    setSequences((current) => [...current, next]);
    setActiveSeqId(next.id);
    toast.success('New sequence created.');
    setRefreshToken((value) => value + 1);
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-screen-2xl space-y-5 px-4 py-5 sm:px-6">
        <PageHeader
          icon={Zap}
          title="Nurture Cadence Engine"
          description="Edit live cadence_sequences records, review the actual execution footprint, and keep the UI honest about what the cron-owned cadence engine is really doing today."
          actions={
            <>
              <button type="button" disabled className={`${buttonSecondary} cursor-not-allowed opacity-70`}>
                <Shield size={14} /> Cron-owned job route
              </button>
              <button type="button" onClick={() => setRefreshToken((value) => value + 1)} className={buttonSecondary}>
                <RefreshCcw size={14} /> Refresh
              </button>
              <button type="button" onClick={handleNewSequence} className={buttonPrimary}>
                <Zap size={14} /> New sequence
              </button>
            </>
          }
        />

        <StatGrid
          stats={[
            {
              label: 'Sequences',
              value: `${stats.activeSequenceCount}/${stats.sequenceCount}`,
              hint: `${stats.defaultSequenceCount} default active path(s)`,
              icon: Database,
              tone: 'primary',
            },
            {
              label: 'Enrollments',
              value: stats.enrollmentCount.toLocaleString(),
              hint: `${stats.activeEnrollmentCount} active · ${stats.completedEnrollmentCount} completed`,
              icon: Users,
              tone: stats.enrollmentCount > 0 ? 'success' : 'warning',
            },
            {
              label: 'Send evidence',
              value: stats.sendCount.toLocaleString(),
              hint: `${stats.unsubscribeTokenCount} unsubscribe tokens issued`,
              icon: Mail,
              tone: stats.sendCount > 0 ? 'success' : 'warning',
            },
            {
              label: 'Lead staging',
              value: `${stats.newLeadCount.toLocaleString()} new`,
              hint: `${stats.nurturingLeadCount.toLocaleString()} nurturing · ${stats.humanOutreachCount.toLocaleString()} human outreach`,
              icon: TimerReset,
              tone: stats.nurturingLeadCount > 0 ? 'primary' : 'danger',
            },
          ]}
        />

        {error && <ErrorBanner message={error} onRetry={() => setRefreshToken((value) => value + 1)} />}

        {loading ? (
          <LoadingState label="Loading live cadence configuration…" />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-4">
              <CadenceAuditPanel stats={stats} />
              <Panel title="Sequences" icon={Zap}>
                <CadenceSequenceList
                  sequences={filteredSequences}
                  activeSeqId={activeSeqId}
                  onSelect={setActiveSeqId}
                  search={search}
                  onSearchChange={setSearch}
                />
              </Panel>
            </div>

            {activeSequence ? (
              <CadenceSequenceEditor
                sequence={activeSequence}
                saving={saving}
                onChange={updateActiveSequence}
                onAddStep={() => updateActiveSequence({
                  steps: [
                    ...activeSequence.steps,
                    {
                      step: activeSequence.steps.length,
                      label: `Step ${activeSequence.steps.length + 1}`,
                      channel: 'email',
                      delay_days: 0,
                      delay_hours: 0,
                      template_key: '',
                      subject: '',
                    },
                  ],
                })}
                onRemoveStep={removeStep}
                onSave={handleSave}
                triggerStageSuggestions={triggerStageSuggestions}
              />
            ) : (
              <Panel>
                <EmptyState icon={Zap} title="Select a sequence" hint="Choose a cadence sequence from the left or create a new one." />
              </Panel>
            )}
          </div>
        )}

        {!loading && (
          <Panel title="Execution status" icon={Shield}>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <StatusPill tone={stats.enrollmentCount > 0 ? 'success' : 'warning'}>
                {stats.enrollmentCount > 0 ? 'Engine has enrollment evidence' : 'No enrollment evidence yet'}
              </StatusPill>
              <StatusPill tone={stats.sendCount > 0 ? 'success' : 'warning'}>
                {stats.sendCount > 0 ? 'Send log present' : 'No send log rows yet'}
              </StatusPill>
              <StatusPill tone="primary">Jennifer &amp; Spencer Wampole remain protected contacts</StatusPill>
            </div>
          </Panel>
        )}
      </div>
    </AppLayout>
  );
}
