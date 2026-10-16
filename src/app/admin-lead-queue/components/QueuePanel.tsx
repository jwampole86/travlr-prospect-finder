'use client';

import { Clock3, DollarSign, Flame, MapPin, PhoneCall, Search, Sparkles, User } from 'lucide-react';
import Link from 'next/link';
import { EmptyState, Panel, SegmentedTabs, StatusPill, buttonSecondary, inputClass } from '@/components/ops';
import type { AgentSummary, QueueFilter, QueueLead } from './types';

function formatCurrency(value?: number | null) {
  if (!value) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRelativeAge(createdAt: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m in queue`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h in queue`;
  return `${Math.floor(hours / 24)}d in queue`;
}

function priorityTone(lead: QueueLead): 'danger' | 'warning' | 'default' {
  if (lead.isHighPriority || lead.priorityTier >= 5) return 'danger';
  if (lead.priorityTier >= 4) return 'warning';
  return 'default';
}

function priorityLabel(lead: QueueLead) {
  if (lead.isHighPriority || lead.priorityTier >= 5) return 'Critical';
  if (lead.priorityTier >= 4) return 'High';
  if (lead.priorityTier >= 3) return 'Standard';
  return `Tier ${lead.priorityTier}`;
}

function stageTone(stage: string): 'primary' | 'success' | 'warning' | 'default' {
  if (stage === 'Under Contract') return 'success';
  if (stage === 'Proposal Sent' || stage === 'Interested') return 'warning';
  if (stage === 'Contacted') return 'primary';
  return 'default';
}

function LeadCard({
  lead,
  agents,
  isDragging,
  assigning,
  onDragStart,
  onDragEnd,
  onAssign,
}: {
  lead: QueueLead;
  agents: AgentSummary[];
  isDragging: boolean;
  assigning: boolean;
  onDragStart: (leadId: string) => void;
  onDragEnd: () => void;
  onAssign: (leadId: string, agent: AgentSummary) => void;
}) {
  const assignableAgents = agents.filter((agent) => agent.status.toLowerCase() === 'active');

  return (
    <article
      draggable={!assigning}
      onDragStart={() => onDragStart(lead.id)}
      onDragEnd={onDragEnd}
      className={`rounded-2xl border border-border bg-card p-4 transition ${isDragging ? 'scale-[0.98] opacity-60 shadow-lg' : 'hover:border-primary/30 hover:shadow-md'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{lead.contactName || 'Unknown contact'}</h3>
            <StatusPill tone={priorityTone(lead)} icon={Flame}>{priorityLabel(lead)}</StatusPill>
            <StatusPill tone={stageTone(lead.stage)}>{lead.stage}</StatusPill>
            {lead.enrichmentStatus && (
              <StatusPill tone={lead.enrichmentStatus === 'COMPLETE' ? 'success' : 'warning'}>
                {lead.enrichmentStatus}
              </StatusPill>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{lead.address}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><MapPin size={12} />{[lead.city, lead.state].filter(Boolean).join(', ') || 'Unknown location'}</span>
            <span className="inline-flex items-center gap-1"><Clock3 size={12} />{formatRelativeAge(lead.createdAt)}</span>
            {lead.prospectScore != null && <span className="font-semibold text-primary">Score {lead.prospectScore}</span>}
            {formatCurrency(lead.estimatedNetMonthly) && (
              <span className="inline-flex items-center gap-1 font-semibold text-success"><DollarSign size={12} />{formatCurrency(lead.estimatedNetMonthly)}/mo</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lead.assignedAgentName ? (
            <StatusPill tone="primary" icon={User}>{lead.assignedAgentName}</StatusPill>
          ) : (
            <select
              aria-label={`Assign ${lead.contactName || lead.address}`}
              className={`${inputClass} w-44 py-1.5 text-xs`}
              defaultValue=""
              disabled={assigning || assignableAgents.length === 0}
              onChange={(event) => {
                const next = agents.find((agent) => agent.userId === event.target.value);
                if (next) {
                  onAssign(lead.id, next);
                  event.target.value = '';
                }
              }}
            >
              <option value="">Quick assign…</option>
              {assignableAgents.map((agent) => (
                <option key={agent.userId} value={agent.userId}>
                  {agent.name} · {agent.assignedLeadCount} leads
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {lead.luxury ? <StatusPill tone="primary" icon={Sparkles}>Luxury</StatusPill> : null}
        {lead.regulationStatus ? <StatusPill>{lead.regulationStatus}</StatusPill> : null}
        {lead.phone ? (
          <Link
            href={`/teleprompter?phone=${encodeURIComponent(lead.phone)}&leadId=${lead.id}&contactName=${encodeURIComponent(lead.contactName || '')}&address=${encodeURIComponent(lead.address)}&city=${encodeURIComponent(lead.city)}&state=${encodeURIComponent(lead.state)}`}
            className={buttonSecondary}
          >
            <PhoneCall size={14} /> Call
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export function QueuePanel({
  leads,
  agents,
  filter,
  search,
  assigningLeadId,
  draggingLeadId,
  onFilterChange,
  onSearchChange,
  onDragStart,
  onDragEnd,
  onAssign,
  counts,
}: {
  leads: QueueLead[];
  agents: AgentSummary[];
  filter: QueueFilter;
  search: string;
  assigningLeadId: string | null;
  draggingLeadId: string | null;
  onFilterChange: (next: QueueFilter) => void;
  onSearchChange: (next: string) => void;
  onDragStart: (leadId: string) => void;
  onDragEnd: () => void;
  onAssign: (leadId: string, agent: AgentSummary) => void;
  counts: Record<QueueFilter, number>;
}) {
  return (
    <Panel
      title="Unassigned queue"
      actions={<span className="text-xs text-muted-foreground">Showing the newest {leads.length} unassigned leads</span>}
      className="h-full"
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SegmentedTabs
            tabs={[
              { key: 'all', label: 'All', badge: counts.all },
              { key: 'high', label: 'High priority', badge: counts.high },
              { key: 'unassigned', label: 'Ready to assign', badge: counts.unassigned },
            ]}
            value={filter}
            onChange={onFilterChange}
          />
          <label className="relative block lg:w-72">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className={`${inputClass} pl-9`}
              placeholder="Search name, address, state…"
            />
          </label>
        </div>

        <div className="space-y-3">
          {leads.length === 0 ? (
            <EmptyState
              icon={User}
              title="No leads match the current queue filters"
              hint="Try a different search, switch tabs, or wait for the next live queue update."
            />
          ) : (
            leads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                agents={agents}
                isDragging={draggingLeadId === lead.id}
                assigning={assigningLeadId === lead.id}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onAssign={onAssign}
              />
            ))
          )}
        </div>
      </div>
    </Panel>
  );
}
