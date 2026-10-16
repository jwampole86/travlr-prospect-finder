'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Clock3, Headphones, Phone, RefreshCw, Sparkles, Users } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import {
  EmptyState,
  ErrorBanner,
  LoadingState,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatGrid,
  buttonPrimary,
  buttonSecondary,
  inputClass,
} from '@/components/ops';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import AgentPerformanceTable from './components/AgentPerformanceTable';
import CallVolumeChart from './components/CallVolumeChart';
import EmailPresetPanel, { type EmailPreset } from './components/EmailPresetPanel';
import OutcomePanel from './components/OutcomePanel';
import RecentCallsTable from './components/RecentCallsTable';
import {
  formatDuration,
  loadCallAnalyticsData,
  type CallAnalyticsData,
  type DateRange,
} from './data';

const STORAGE_KEY = 'call_analytics_email_presets';

function buildExportPayload(data: CallAnalyticsData) {
  return {
    summary: {
      totalCalls: data.totalCalls,
      avgDuration: data.averageDurationSeconds,
      conversionRate: data.positiveOutcomeRate,
      interested: data.interestedCalls,
      callback: data.callbackCalls,
      voicemail: data.voicemailCalls,
      noAnswer: data.noAnswerCalls,
    },
    agents: data.agentRows.map((row) => ({
      agentName: row.agentName,
      totalCalls: row.totalCalls,
      interested: row.interestedCalls,
      callback: row.callbackCalls,
      voicemail: row.voicemailCalls,
      noAnswer: row.noAnswerCalls,
      conversionRate: row.totalCalls > 0 ? Math.round((row.positiveCalls / row.totalCalls) * 100) : 0,
    })),
    daily: data.trend.map((point) => ({
      date: point.label,
      calls: point.calls,
      interested: point.positive,
      callback: 0,
    })),
  };
}

export default function CallAnalyticsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user, loading: authLoading } = useAuth();
  const [range, setRange] = useState<DateRange>('30d');
  const [data, setData] = useState<CallAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [presets, setPresets] = useState<EmailPreset[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const nextData = await loadCallAnalyticsData(supabase, range);
      setData(nextData);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load call analytics');
    } finally {
      setLoading(false);
    }
  }, [range, supabase, user]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setPresets(JSON.parse(stored) as EmailPreset[]);
      }
    } catch {
      // Ignore corrupted local state and let the operator rebuild presets.
    }
  }, []);

  const persistPresets = useCallback((nextPresets: EmailPreset[]) => {
    setPresets(nextPresets);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPresets));
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const intervalId = window.setInterval(() => {
      load();
    }, 60000);
    return () => window.clearInterval(intervalId);
  }, [load, user]);

  const filteredAgents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term || !data) return data?.agentRows ?? [];
    return data.agentRows.filter((row) => row.agentName.toLowerCase().includes(term));
  }, [data, search]);

  const filteredRecentCalls = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term || !data) return data?.recentCalls ?? [];
    return data.recentCalls.filter((call) => call.agentName.toLowerCase().includes(term));
  }, [data, search]);

  const handleSend = useCallback(async (preset: EmailPreset) => {
    if (!data) return;
    setSendingId(preset.id);
    setSendMessage(null);

    try {
      const response = await fetch('/api/send-scheduled-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId: preset.id,
          scheduleName: preset.name,
          recipientEmails: preset.recipients.split(',').map((value) => value.trim()).filter(Boolean),
          frequency: 'manual',
          reportType: 'call_analytics',
          analyticsData: buildExportPayload(data),
        }),
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Email send failed');
      }

      setSendMessage(`Sent current analytics CSV to ${preset.recipients}.`);
    } catch (nextError) {
      setSendMessage(nextError instanceof Error ? nextError.message : 'Email send failed');
    } finally {
      setSendingId(null);
    }
  }, [data]);

  if (authLoading || loading) {
    return (
      <AppLayout>
        <LoadingState label="Loading call analytics…" />
      </AppLayout>
    );
  }

  if (!user) {
    return (
      <AppLayout>
        <div className="p-6">
          <EmptyState icon={Phone} title="Sign in to view call analytics" hint="This dashboard reads live call session data from Supabase for the authenticated operator." />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        <PageHeader
          icon={BarChart3}
          title="Call Analytics"
          description="Live metrics from real call_sessions records. No demo data, no fabricated health indicators."
          actions={
            <>
              <SegmentedTabs
                tabs={[
                  { key: '7d', label: '7 days' },
                  { key: '30d', label: '30 days' },
                  { key: '90d', label: '90 days' },
                ]}
                value={range}
                onChange={(value) => setRange(value)}
              />
              <button type="button" className={buttonSecondary} onClick={load}>
                <RefreshCw size={14} /> Refresh
              </button>
            </>
          }
        />

        {error && <ErrorBanner message={error} onRetry={load} />}

        <StatGrid
          columns={5}
          stats={[
            { label: 'Call sessions', value: data?.totalCalls ?? 0, hint: `Since ${new Date(data?.rangeStartIso ?? Date.now()).toLocaleDateString()}`, icon: Phone, tone: 'primary' },
            { label: 'Completed calls', value: data?.completedCalls ?? 0, hint: `${data?.callsWithDisposition ?? 0} with dispositions`, icon: Headphones, tone: 'success' },
            { label: 'Connected', value: data?.connectedCalls ?? 0, hint: `${data?.recordedCalls ?? 0} recordings saved`, icon: Users, tone: 'primary' },
            { label: 'Avg duration', value: formatDuration(data?.averageDurationSeconds ?? 0), hint: 'Completed calls only', icon: Clock3, tone: 'default' },
            { label: 'Positive outcome rate', value: `${data?.positiveOutcomeRate ?? 0}%`, hint: 'Interested, callback, questionnaire, follow-up, or proposal', icon: Sparkles, tone: 'warning' },
          ]}
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr),minmax(340px,1fr)]">
          <CallVolumeChart points={data?.trend ?? []} />
          <div className="space-y-6">
            <OutcomePanel outcomes={data?.outcomes ?? []} totalCalls={data?.totalCalls ?? 0} />
            <EmailPresetPanel
              presets={presets}
              sendingId={sendingId}
              sendMessage={sendMessage}
              onSave={(preset) => {
                const next = presets.some((existing) => existing.id === preset.id)
                  ? presets.map((existing) => existing.id === preset.id ? preset : existing)
                  : [...presets, preset];
                persistPresets(next);
              }}
              onDelete={(presetId) => persistPresets(presets.filter((preset) => preset.id !== presetId))}
              onSend={handleSend}
            />
          </div>
        </div>

        <Panel title="Search" padded={false}>
          <div className="p-4">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={inputClass}
              placeholder="Filter agents and recent sessions by agent name"
            />
          </div>
        </Panel>

        <div className="grid gap-6 xl:grid-cols-2">
          <AgentPerformanceTable rows={filteredAgents} />
          <RecentCallsTable calls={filteredRecentCalls} />
        </div>
      </div>
    </AppLayout>
  );
}
