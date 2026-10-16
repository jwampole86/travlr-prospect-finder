"use client";

import { useMemo, useState } from 'react';
import { AlertTriangle, Flame, PhoneCall, RefreshCw, Search, UserRound, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import {
  EmptyState,
  ErrorBanner,
  PageHeader,
  Panel,
  SegmentedTabs,
  StatGrid,
  StatusPill,
  buttonSecondary,
  inputClass,
} from '@/components/ops';
import { createClient } from '@/lib/supabase/client';

import EscalatedLeadCard from './EscalatedLeadCard';
import type { EscalatedLead, EscalatedLeadsPageData } from './types';

type LeadTab = 'all' | 'assigned' | 'unassigned';

function matchesSearch(lead: EscalatedLead, query: string): boolean {
  const haystack = [
    lead.displayName,
    lead.ownerName,
    lead.contactName,
    lead.address,
    lead.city,
    lead.state,
    lead.contactPhone,
    lead.escalationReason,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export default function EscalatedLeadsClient({ initialData }: { initialData: EscalatedLeadsPageData }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState<'all' | string>('all');
  const [tab, setTab] = useState<LeadTab>('all');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reasons = useMemo(
    () => ['all', ...Array.from(new Set(initialData.leads.map((lead) => lead.escalationReason).filter((value): value is string => Boolean(value))))],
    [initialData.leads],
  );

  const filtered = useMemo(() => initialData.leads.filter((lead) => {
    if (tab === 'assigned' && !lead.assignedAgentId) return false;
    if (tab === 'unassigned' && lead.assignedAgentId) return false;
    if (reason !== 'all' && lead.escalationReason !== reason) return false;
    if (search && !matchesSearch(lead, search)) return false;
    return true;
  }), [initialData.leads, reason, search, tab]);

  async function actor() {
    const supabase = createClient();
    const { data: userResult } = await supabase.auth.getUser();
    const user = userResult.user;
    if (!user) return {};
    const { data: profile } = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
    return { agent_id: user.id, agent_name: profile?.full_name ?? user.email ?? 'Unknown agent' };
  }

  async function logTouch(lead: EscalatedLead, channel: 'call' | 'sms', redirectTo: string) {
    setBusyAction(`${channel}:${lead.id}`);
    setActionError(null);
    try {
      const performer = await actor();
      const response = await fetch('/api/cadence/log-touchpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: lead.id,
          channel,
          ...performer,
          notes: `Logged from Escalated Leads dashboard before ${channel === 'call' ? 'teleprompter handoff' : 'lead record follow-up'}`,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Failed to log ${channel}`);
      toast.success(channel === 'call' ? 'Call handoff logged' : 'SMS handoff logged');
      router.push(redirectTo);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Action failed';
      setActionError(message);
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6">
      <PageHeader
        icon={Flame}
        title="Escalated Leads"
        description="Live leads in the human_outreach stage. Counts come from leads.stage, escalated_at, pipeline_status, outreach_history, and call_sessions."
        actions={
          <button type="button" onClick={() => router.refresh()} className={buttonSecondary}>
            <RefreshCw size={14} />
            Refresh
          </button>
        }
      />

      <StatGrid
        stats={[
          { label: 'Human outreach stage', value: initialData.summary.total.toLocaleString(), hint: 'Exact count from leads.stage = human_outreach', icon: Flame, tone: 'warning' },
          { label: 'Assigned', value: initialData.summary.assigned.toLocaleString(), hint: `${initialData.summary.unassigned.toLocaleString()} still unassigned`, icon: UserRound, tone: 'primary' },
          { label: 'Callback scheduled', value: initialData.summary.callbackScheduled.toLocaleString(), hint: 'Exact count from leads.pipeline_status', icon: PhoneCall, tone: 'success' },
          { label: 'Escalated in 24h', value: initialData.summary.escalatedLast24h.toLocaleString(), hint: 'Exact count from leads.escalated_at', icon: UsersRound, tone: 'default' },
        ]}
      />

      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <SegmentedTabs
            tabs={[
              { key: 'all', label: 'All leads', badge: initialData.summary.total },
              { key: 'assigned', label: 'Assigned', badge: initialData.summary.assigned },
              { key: 'unassigned', label: 'Unassigned', badge: initialData.summary.unassigned },
            ]}
            value={tab}
            onChange={(value) => setTab(value)}
          />

          <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
            <label className="relative min-w-[18rem] flex-1 lg:w-80">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={`${inputClass} pl-9`}
                placeholder="Search by homeowner, address, phone, or reason"
              />
            </label>
            <select value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass}>
              {reasons.map((value) => (
                <option key={value} value={value}>{value === 'all' ? 'All escalation reasons' : value}</option>
              ))}
            </select>
          </div>
        </div>
      </Panel>

      {actionError ? <ErrorBanner message={actionError} /> : null}

      <Panel padded={false}>
        <div className="border-b border-border px-4 py-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{filtered.length.toLocaleString()}</span> lead{filtered.length === 1 ? '' : 's'} shown
          <span className="mx-2 text-border">•</span>
          <StatusPill tone="warning">Stage = human_outreach</StatusPill>
        </div>
        <div className="space-y-4 p-4">
          {filtered.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="No escalated leads match these filters"
              hint="The live queue only includes leads whose stage is human_outreach. Try clearing the search box or reason filter."
            />
          ) : (
            filtered.map((lead) => (
              <EscalatedLeadCard
                key={lead.id}
                lead={lead}
                busyAction={busyAction}
                onCall={(currentLead) => logTouch(currentLead, 'call', `/teleprompter?leadId=${currentLead.id}`)}
                onSms={(currentLead) => logTouch(currentLead, 'sms', `/lead-record?id=${currentLead.id}`)}
              />
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}
