'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Brain, Play, RefreshCw, Sparkles, Target, Users } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { createClient } from '@/lib/supabase/client';
import {
  ErrorBanner,
  LoadingState,
  PageHeader,
  SegmentedTabs,
  StatGrid,
  buttonPrimary,
  buttonSecondary,
} from '@/components/ops';
import { AgentsPanel, HistoryPanel, PreviewPanel } from './components/AssignmentPanels';
import { RuleEditorDialog } from './components/RuleEditorDialog';
import { RulesPanel } from './components/RulesPanel';
import type {
  AgentOption,
  AssignmentLogRecord,
  AssignmentPreviewRecord,
  AssignmentRuleRecord,
} from './components/types';

const STAGE_OPTIONS = ['New Lead', 'Contacted', 'Interested', 'Proposal Sent', 'Under Contract', 'Live', 'Not a Fit'];
type TabKey = 'rules' | 'preview' | 'history';

export default function LeadAutoAssignPage() {
  const supabase = useMemo(() => createClient(), []);
  const { configuredPortfolios } = usePortfolio();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('rules');
  const [rules, setRules] = useState<AssignmentRuleRecord[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [log, setLog] = useState<AssignmentLogRecord[]>([]);
  const [preview, setPreview] = useState<AssignmentPreviewRecord[]>([]);
  const [editingRule, setEditingRule] = useState<AssignmentRuleRecord | null | undefined>(undefined);
  const [runningPreview, setRunningPreview] = useState(false);
  const [runningAssign, setRunningAssign] = useState(false);
  const [stats, setStats] = useState({ activeRules: 0, queueCount: 0, recentAssignments: 0, scopedAgents: 0 });

  const loadRules = useCallback(async () => {
    const { data, error: rulesError } = await supabase
      .from('lead_assignment_rules')
      .select('id, name, priority, enabled, min_ai_score, max_ai_score, regions, expertise_tags, lead_stages, portfolios, score_threshold, availability_start, availability_end, availability_days, auto_assign_enabled, target_agent_id, target_agent_name, max_workload, total_assigned, last_run_at')
      .order('priority', { ascending: true });

    if (rulesError) throw rulesError;
    setRules((data || []) as AssignmentRuleRecord[]);
    setStats((current) => ({ ...current, activeRules: (data || []).filter((rule) => rule.enabled).length }));
  }, [supabase]);

  const loadAgents = useCallback(async () => {
    const [profilesRes, assignmentsRes] = await Promise.all([
      supabase.from('agent_profiles').select('id, owner_user_id, full_name, email, status').order('full_name'),
      supabase.from('agent_portfolio_assignments').select('agent_user_id, portfolio_key'),
    ]);

    if (profilesRes.error) throw profilesRes.error;
    if (assignmentsRes.error) throw assignmentsRes.error;

    const portfolioMap = new Map<string, string[]>();
    for (const row of assignmentsRes.data || []) {
      const current = portfolioMap.get(String(row.agent_user_id)) || [];
      current.push(String(row.portfolio_key));
      portfolioMap.set(String(row.agent_user_id), current);
    }

    const activeProfiles = (profilesRes.data || []).filter((profile) => (profile.status || '').toLowerCase() === 'active');
    const workloadPairs = await Promise.all(
      activeProfiles.map(async (profile) => {
        const userId = profile.owner_user_id || profile.id;
        const { count, error: countError } = await supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('primary_agent_id', userId);
        if (countError) throw countError;
        return [userId, count || 0] as const;
      }),
    );

    const workloadMap = new Map<string, number>(workloadPairs);
    const mappedAgents: AgentOption[] = activeProfiles.map((profile) => {
      const userId = profile.owner_user_id || profile.id;
      return {
        profileId: profile.id,
        userId,
        fullName: profile.full_name || 'Unnamed agent',
        email: profile.email,
        status: profile.status || 'unknown',
        assignedLeadCount: workloadMap.get(userId) || 0,
        portfolioKeys: portfolioMap.get(userId) || [],
      };
    });

    setAgents(mappedAgents);
    setStats((current) => ({
      ...current,
      scopedAgents: mappedAgents.filter((agent) => agent.portfolioKeys.length > 0).length,
    }));
  }, [supabase]);

  const loadLog = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [logRes, recentCountRes] = await Promise.all([
      supabase
        .from('lead_assignment_log')
        .select('id, lead_id, lead_address, assigned_to_agent_id, assigned_to_agent_name, rule_id, rule_name, ai_score, region, reason, assigned_at, stage, score, portfolio, execution_id')
        .order('assigned_at', { ascending: false })
        .limit(100),
      supabase
        .from('lead_assignment_log')
        .select('id', { count: 'exact', head: true })
        .gte('assigned_at', since),
    ]);

    if (logRes.error) throw logRes.error;
    if (recentCountRes.error) throw recentCountRes.error;
    const rows = (logRes.data || []) as AssignmentLogRecord[];
    setLog(rows);
    setStats((current) => ({
      ...current,
      recentAssignments: recentCountRes.count || 0,
    }));
  }, [supabase]);

  const loadQueueCount = useCallback(async () => {
    const { count, error: countError } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .in('stage', STAGE_OPTIONS.slice(0, 5))
      .is('primary_agent_id', null);

    if (countError) throw countError;
    setStats((current) => ({ ...current, queueCount: count || 0 }));
  }, [supabase]);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    setError(null);
    try {
      await Promise.all([loadRules(), loadAgents(), loadLog(), loadQueueCount()]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load auto-assignment data.');
    } finally {
      setLoading(false);
      if (!silent) setRefreshing(false);
    }
  }, [loadAgents, loadLog, loadQueueCount, loadRules]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleSaveRule = useCallback(async (payload: Omit<AssignmentRuleRecord, 'id' | 'last_run_at' | 'total_assigned'> & { id?: string; total_assigned?: number; last_run_at?: string | null }) => {
    try {
      const record = {
        name: payload.name,
        priority: payload.priority,
        enabled: payload.enabled,
        min_ai_score: payload.min_ai_score,
        max_ai_score: payload.max_ai_score,
        regions: payload.regions,
        expertise_tags: payload.expertise_tags,
        lead_stages: payload.lead_stages,
        portfolios: payload.portfolios,
        score_threshold: payload.score_threshold,
        availability_start: payload.availability_start,
        availability_end: payload.availability_end,
        availability_days: payload.availability_days,
        auto_assign_enabled: payload.auto_assign_enabled,
        target_agent_id: payload.target_agent_id,
        target_agent_name: payload.target_agent_name,
        max_workload: payload.max_workload,
        total_assigned: payload.total_assigned ?? 0,
        last_run_at: payload.last_run_at ?? null,
      };

      const query = payload.id
        ? supabase.from('lead_assignment_rules').update(record).eq('id', payload.id)
        : supabase.from('lead_assignment_rules').insert(record);

      const { error: saveError } = await query;
      if (saveError) throw saveError;

      toast.success(payload.id ? 'Rule updated.' : 'Rule created.');
      setEditingRule(undefined);
      await loadAll(true);
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'Could not save the rule.');
    }
  }, [loadAll, supabase]);

  const handleDeleteRule = useCallback(async (ruleId: string) => {
    try {
      const { error: deleteError } = await supabase.from('lead_assignment_rules').delete().eq('id', ruleId);
      if (deleteError) throw deleteError;
      toast.success('Rule deleted.');
      await loadAll(true);
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : 'Could not delete the rule.');
    }
  }, [loadAll, supabase]);

  const handleToggleRule = useCallback(async (rule: AssignmentRuleRecord) => {
    try {
      const { error: toggleError } = await supabase
        .from('lead_assignment_rules')
        .update({ enabled: !rule.enabled, updated_at: new Date().toISOString() })
        .eq('id', rule.id);
      if (toggleError) throw toggleError;
      toast.success(rule.enabled ? 'Rule disabled.' : 'Rule enabled.');
      await loadAll(true);
    } catch (toggleError) {
      toast.error(toggleError instanceof Error ? toggleError.message : 'Could not update the rule.');
    }
  }, [loadAll, supabase]);

  const handlePreview = useCallback(async () => {
    setRunningPreview(true);
    try {
      const response = await fetch('/api/leads/auto-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Dry-run preview failed.');
      }
      setPreview((payload.preview || []) as AssignmentPreviewRecord[]);
      setTab('preview');
      toast.success(`Preview generated for ${payload.assigned || 0} leads.`);
    } catch (previewError) {
      toast.error(previewError instanceof Error ? previewError.message : 'Could not preview assignments.');
    } finally {
      setRunningPreview(false);
    }
  }, []);

  const handleRun = useCallback(async () => {
    setRunningAssign(true);
    try {
      const response = await fetch('/api/leads/auto-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Auto-assignment failed.');
      }
      setPreview((payload.results || []) as AssignmentPreviewRecord[]);
      setTab('history');
      toast.success(`Assigned ${payload.assigned || 0} lead${payload.assigned === 1 ? '' : 's'}.`);
      await loadAll(true);
    } catch (runError) {
      toast.error(runError instanceof Error ? runError.message : 'Could not run auto-assignment.');
    } finally {
      setRunningAssign(false);
    }
  }, [loadAll]);

  return (
    <AppLayout>
      <div className="flex h-full flex-col gap-6 overflow-y-auto bg-background p-6">
        <PageHeader
          icon={Brain}
          title="AI Lead Auto-Assignment"
          description="This page now reflects the live rule tables and real lead counts. The page name remains, but execution is rule-based on actual scores, stages, portfolios, and active agent profiles."
          actions={(
            <>
              <button type="button" onClick={() => void loadAll()} className={buttonSecondary} disabled={refreshing}>
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh
              </button>
              <button type="button" onClick={handlePreview} className={buttonSecondary} disabled={runningPreview || rules.filter((rule) => rule.enabled).length === 0}>
                <Sparkles size={16} className={runningPreview ? 'animate-pulse' : ''} /> Dry preview
              </button>
              <button type="button" onClick={handleRun} className={buttonPrimary} disabled={runningAssign || rules.filter((rule) => rule.enabled).length === 0}>
                <Play size={16} /> {runningAssign ? 'Running…' : 'Run auto-assign'}
              </button>
            </>
          )}
        />

        {error ? <ErrorBanner message={error} onRetry={() => void loadAll()} /> : null}

        {loading ? (
          <LoadingState label="Loading assignment rules and live queue metrics…" />
        ) : (
          <>
            <StatGrid
              stats={[
                { label: 'Active rules', value: stats.activeRules, hint: 'Rows enabled in lead_assignment_rules', icon: Target },
                { label: 'Unassigned queue', value: stats.queueCount, hint: 'Exact count of active-stage leads without a primary agent', icon: Users },
                { label: 'Assignments (24h)', value: stats.recentAssignments, hint: 'Recent rows written to lead_assignment_log', icon: Play },
                { label: 'Scoped agents', value: stats.scopedAgents, hint: 'Active agent profiles with portfolio assignments', icon: Sparkles },
              ]}
            />

            <div className="flex items-center justify-between gap-3">
              <SegmentedTabs
                tabs={[
                  { key: 'rules', label: 'Rules' },
                  { key: 'preview', label: 'Preview', badge: preview.length },
                  { key: 'history', label: 'History', badge: log.length },
                ]}
                value={tab}
                onChange={setTab}
              />
            </div>

            {tab === 'rules' ? (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
                <RulesPanel
                  rules={rules}
                  agents={agents}
                  onCreate={() => setEditingRule(null)}
                  onEdit={(rule) => setEditingRule(rule)}
                  onDelete={(ruleId) => void handleDeleteRule(ruleId)}
                  onToggle={(rule) => void handleToggleRule(rule)}
                />
                <AgentsPanel agents={agents} />
              </div>
            ) : null}

            {tab === 'preview' ? <PreviewPanel preview={preview} /> : null}
            {tab === 'history' ? <HistoryPanel log={log} /> : null}
          </>
        )}
      </div>

      {editingRule !== undefined ? (
        <RuleEditorDialog
          rule={editingRule}
          agents={agents}
          portfolios={configuredPortfolios}
          stageOptions={STAGE_OPTIONS}
          onClose={() => setEditingRule(undefined)}
          onSave={(payload) => void handleSaveRule(payload)}
        />
      ) : null}
    </AppLayout>
  );
}
