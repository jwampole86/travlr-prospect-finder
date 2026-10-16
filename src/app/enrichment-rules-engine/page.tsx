'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import {
  AlertTriangle,
  BarChart2,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Zap,
} from 'lucide-react';
import type { Stat } from '@/components/ops';
import {
  buttonPrimary,
  buttonSecondary,
  ErrorBanner,
  inputClass,
  LoadingState,
  PageHeader,
  SegmentedTabs,
  StatGrid,
} from '@/components/ops';
import { toast } from 'sonner';
import RuleComposerPanel from './components/RuleComposerPanel';
import RulesTablePanel from './components/RulesTablePanel';
import type {
  ConfidenceRule,
  RuleAction,
  RuleFilter,
  RuleSeverity,
  RulesEngineResponse,
  ViolationSummary,
} from './components/types';
import ViolationsSummaryPanel from './components/ViolationsSummaryPanel';

export default function EnrichmentRulesEnginePage() {
  const [rules, setRules] = useState<ConfidenceRule[]>([]);
  const [violations, setViolations] = useState<ViolationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RuleFilter>('ALL');
  const [totalViolations, setTotalViolations] = useState(0);
  const [unresolvedViolations, setUnresolvedViolations] = useState(0);
  const [newRule, setNewRule] = useState<Partial<ConfidenceRule>>({
    rule_name: '',
    rule_type: 'ownership_min_confidence',
    threshold_value: 70,
    target_field: null,
    action: 'flag',
    severity: 'warning',
    enabled: true,
    description: '',
  });

  const requestJson = useCallback(async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((payload as { error?: string }).error || 'Request failed');
    }
    return payload as T;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await requestJson<RulesEngineResponse>('/api/enrichment/rules-engine', {
        cache: 'no-store',
      });
      setRules(data.rules || []);
      setViolations(data.violations || []);
      setTotalViolations(data.totalViolations || 0);
      setUnresolvedViolations(data.unresolvedViolations || 0);
    } catch (error) {
      console.error('[enrichment-rules-engine]', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load rules engine.');
      setRules([]);
      setViolations([]);
      setTotalViolations(0);
      setUnresolvedViolations(0);
    } finally {
      setLoading(false);
    }
  }, [requestJson]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRules = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rules.filter((rule) => {
      const statusMatch =
        filter === 'ALL' ? true : filter === 'ENABLED' ? rule.enabled : !rule.enabled;
      const queryMatch =
        !query ||
        [rule.rule_name, rule.rule_type, rule.description, rule.target_field]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(query));
      return statusMatch && queryMatch;
    });
  }, [filter, rules, search]);

  const stats = useMemo<Stat[]>(() => {
    const enabledCount = rules.filter((rule) => rule.enabled).length;
    return [
      {
        label: 'Active rules',
        value: enabledCount.toLocaleString(),
        hint: `${rules.length.toLocaleString()} total persisted rules`,
        icon: Shield,
        tone: enabledCount > 0 ? 'success' : 'default',
      },
      {
        label: 'Unresolved violations',
        value: unresolvedViolations.toLocaleString(),
        hint: 'Live count from rules_engine_violations where resolved = false',
        icon: AlertTriangle,
        tone: unresolvedViolations > 0 ? 'danger' : 'success',
      },
      {
        label: 'Total violations',
        value: totalViolations.toLocaleString(),
        hint: 'Historical violation rows captured by the rules engine',
        icon: Zap,
        tone: totalViolations > 0 ? 'warning' : 'default',
      },
      {
        label: 'Visible rules',
        value: filteredRules.length.toLocaleString(),
        hint: search.trim() ? 'After filter and search' : 'Current tab selection',
        icon: BarChart2,
        tone: 'primary',
      },
    ];
  }, [filteredRules.length, rules, search, totalViolations, unresolvedViolations]);

  async function mutateRule(url: string, successMessage: string, init: RequestInit) {
    const result = await requestJson<{ rule?: ConfidenceRule; success?: boolean }>(url, init);
    toast.success(successMessage);
    return result;
  }

  async function addRule() {
    if (!newRule.rule_name?.trim()) {
      toast.error('Rule name is required.');
      return;
    }

    if (newRule.rule_type === 'field_min_confidence' && !newRule.target_field?.trim()) {
      toast.error('Target field is required for field confidence rules.');
      return;
    }

    setSavingId('new');
    try {
      const result = await mutateRule('/api/enrichment/rules-engine', 'Rule saved.', {
        method: 'POST',
        body: JSON.stringify(newRule),
      });
      if (result.rule) setRules((current) => [...current, result.rule!]);
      setShowComposer(false);
      setNewRule({
        rule_name: '',
        rule_type: 'ownership_min_confidence',
        threshold_value: 70,
        target_field: null,
        action: 'flag',
        severity: 'warning',
        enabled: true,
        description: '',
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save rule.');
    } finally {
      setSavingId(null);
    }
  }

  async function patchRule(ruleId: string, patch: Partial<ConfidenceRule>, successMessage: string) {
    setSavingId(ruleId);
    try {
      const result = await mutateRule('/api/enrichment/rules-engine', successMessage, {
        method: 'PATCH',
        body: JSON.stringify({ id: ruleId, ...patch }),
      });
      if (result.rule) {
        setRules((current) => current.map((rule) => (rule.id === ruleId ? result.rule! : rule)));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update rule.');
    } finally {
      setSavingId(null);
    }
  }

  async function deleteRule(ruleId: string) {
    setSavingId(ruleId);
    try {
      await mutateRule('/api/enrichment/rules-engine', 'Rule deleted.', {
        method: 'DELETE',
        body: JSON.stringify({ id: ruleId }),
      });
      setRules((current) => current.filter((rule) => rule.id !== ruleId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete rule.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <PageHeader
          icon={Settings}
          title="Enrichment Rules Engine"
          description="Manage the real persisted confidence rules and review any actual violations captured during validation."
          actions={
            <>
              <button type="button" onClick={load} className={buttonSecondary} disabled={loading}>
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setShowComposer((current) => !current)}
                className={buttonPrimary}
              >
                <Plus size={16} />
                {showComposer ? 'Close composer' : 'Add rule'}
              </button>
            </>
          }
        />

        <StatGrid stats={stats} columns={4} />

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SegmentedTabs<RuleFilter>
            value={filter}
            onChange={setFilter}
            tabs={[
              { key: 'ALL', label: 'All rules' },
              { key: 'ENABLED', label: 'Enabled' },
              { key: 'DISABLED', label: 'Disabled' },
            ]}
          />

          <div className="relative w-full max-w-md">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search rules by name, type, or field"
              className={`${inputClass} pl-9`}
            />
          </div>
        </div>

        {errorMessage && <ErrorBanner message={errorMessage} onRetry={load} />}

        <RuleComposerPanel
          open={showComposer}
          saving={savingId === 'new'}
          newRule={newRule}
          onClose={() => setShowComposer(false)}
          onSave={addRule}
          onChange={(patch) => setNewRule((current) => ({ ...current, ...patch }))}
        />

        {loading ? (
          <LoadingState label="Loading live confidence rules…" />
        ) : (
          <>
            <RulesTablePanel
              rules={filteredRules}
              savingId={savingId}
              onToggle={(rule) =>
                patchRule(
                  rule.id,
                  { enabled: !rule.enabled },
                  rule.enabled ? 'Rule disabled.' : 'Rule enabled.'
                )
              }
              onDelete={deleteRule}
              onThresholdSave={(ruleId, value) =>
                patchRule(ruleId, { threshold_value: value }, 'Threshold updated.')
              }
              onActionChange={(ruleId, value) =>
                patchRule(ruleId, { action: value as RuleAction }, 'Rule action updated.')
              }
              onSeverityChange={(ruleId, value) =>
                patchRule(ruleId, { severity: value as RuleSeverity }, 'Rule severity updated.')
              }
            />
            <ViolationsSummaryPanel violations={violations} />
          </>
        )}
      </div>
    </AppLayout>
  );
}
