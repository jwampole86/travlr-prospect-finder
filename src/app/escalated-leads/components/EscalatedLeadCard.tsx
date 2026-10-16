"use client";

import Link from 'next/link';
import { Activity, ArrowRight, Clock3, Mail, MessageSquare, Mic, Phone, UserRound } from 'lucide-react';

import { Panel, StatusPill, buttonPrimary, buttonSecondary } from '@/components/ops';

import type { EscalatedLead, EscalatedTouchpoint } from './types';

function relativeTime(value: string | null): string {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return '—';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function longDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function summarizeTouchpoint(touchpoint: EscalatedTouchpoint): string {
  if (touchpoint.direction === 'inbound' && touchpoint.body) return touchpoint.body;
  if (touchpoint.body) return touchpoint.body;
  if (touchpoint.kind) return touchpoint.kind.replace(/_/g, ' ');
  if (touchpoint.failureReason) return touchpoint.failureReason;
  return touchpoint.status.replace(/_/g, ' ');
}

function toneForStatus(status: string): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'replied' || status === 'opened' || status === 'delivered') return 'success';
  if (status === 'failed' || status === 'bounced') return 'danger';
  if (status === 'queued' || status === 'scheduled') return 'warning';
  return 'default';
}

export default function EscalatedLeadCard({
  lead,
  onCall,
  onSms,
  busyAction,
}: {
  lead: EscalatedLead;
  onCall: (lead: EscalatedLead) => void;
  onSms: (lead: EscalatedLead) => void;
  busyAction: string | null;
}) {
  const location = [lead.address, lead.city, lead.state].filter(Boolean).join(', ');
  const outboundSms = lead.touches.filter((item) => item.channel === 'sms' && item.direction !== 'inbound');
  const inboundSms = lead.touches.filter((item) => item.channel === 'sms' && item.direction === 'inbound');
  const outboundEmail = lead.touches.filter((item) => item.channel === 'email' && item.direction !== 'inbound');
  const latestCall = lead.calls[0] ?? null;
  const lastTouch = [...lead.touches]
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())[0];

  return (
    <Panel className="border-border/80 shadow-sm shadow-black/5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">{lead.displayName}</h3>
            <StatusPill tone="warning">{lead.stage.replace(/_/g, ' ')}</StatusPill>
            {lead.pipelineStatus && <StatusPill>{lead.pipelineStatus.replace(/_/g, ' ')}</StatusPill>}
            {lead.assignedAgentName ? (
              <StatusPill tone="primary" icon={UserRound}>{lead.assignedAgentName}</StatusPill>
            ) : (
              <StatusPill tone="danger">Unassigned</StatusPill>
            )}
          </div>

          <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide">Property</p>
              <p className="text-foreground">{location || 'Address missing'}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide">Phone</p>
              <p className="text-foreground">{lead.contactPhone || 'No phone on file'}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide">Escalated</p>
              <p className="text-foreground">{longDate(lead.escalatedAt)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide">Last touch</p>
              <p className="text-foreground">{lead.lastContactedAt ? `${relativeTime(lead.lastContactedAt)} (${longDate(lead.lastContactedAt)})` : 'No manual touch logged yet'}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-warning/20 bg-warning/10 p-3 text-sm text-foreground">
            <p className="font-medium text-warning">Escalation reason</p>
            <p className="mt-1 text-sm text-foreground">{lead.escalationReason || 'No escalation note was recorded.'}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="uppercase tracking-wide">Outbound SMS</span>
                <MessageSquare size={12} />
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{outboundSms.length}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="uppercase tracking-wide">Inbound replies</span>
                <Activity size={12} />
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{inboundSms.length}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="uppercase tracking-wide">Emails</span>
                <Mail size={12} />
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{outboundEmail.length}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onCall(lead)}
              disabled={!lead.contactPhone || busyAction !== null}
              className={buttonPrimary}
            >
              <Phone size={14} />
              {busyAction === `call:${lead.id}` ? 'Logging call…' : 'Log call + open teleprompter'}
            </button>
            <button
              type="button"
              onClick={() => onSms(lead)}
              disabled={!lead.contactPhone || busyAction !== null}
              className={buttonSecondary}
            >
              <MessageSquare size={14} />
              {busyAction === `sms:${lead.id}` ? 'Logging SMS…' : 'Log SMS handoff'}
            </button>
            <Link href={`/lead-record?id=${lead.id}`} className={buttonSecondary}>
              <ArrowRight size={14} />
              Open lead record
            </Link>
          </div>
        </div>

        <div className="w-full max-w-xl space-y-3 lg:min-w-[24rem]">
          <div className="rounded-2xl border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Clock3 size={12} />
              Recent outreach
            </div>
            {lead.touches.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No outreach history was logged for this escalated lead.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {lead.touches.slice(0, 4).map((touchpoint) => (
                  <div key={touchpoint.id} className="rounded-xl border border-border bg-card p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={toneForStatus(touchpoint.status)}>
                        {touchpoint.channel.toUpperCase()} · {touchpoint.status.replace(/_/g, ' ')}
                      </StatusPill>
                      <span className="text-xs text-muted-foreground">{longDate(touchpoint.sentAt)}</span>
                    </div>
                    <p className="mt-2 text-sm text-foreground">{summarizeTouchpoint(touchpoint)}</p>
                    {touchpoint.twilioStatus && (
                      <p className="mt-1 text-xs text-muted-foreground">Provider status: {touchpoint.twilioStatus}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Mic size={12} />
              Call context
            </div>
            {latestCall ? (
              <div className="mt-3 space-y-3">
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Most recent call</p>
                      <p className="text-xs text-muted-foreground">{longDate(latestCall.startedAt)}</p>
                    </div>
                    <StatusPill tone="primary">{latestCall.outcome || 'No outcome'}</StatusPill>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Duration: {latestCall.durationSeconds ? `${Math.floor(latestCall.durationSeconds / 60)}m ${String(latestCall.durationSeconds % 60).padStart(2, '0')}s` : 'Unknown'}
                  </p>
                  {latestCall.recordingUrl ? (
                    <a href={latestCall.recordingUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-medium text-primary hover:underline">
                      Open recording
                    </a>
                  ) : null}
                </div>
                {latestCall.transcript ? (
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-border bg-card p-3 text-xs leading-6 text-foreground whitespace-pre-wrap">
                    {latestCall.transcript}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">A call exists, but no transcript is stored yet.</p>
                )}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
                No call_sessions rows exist for this lead yet. Outreach history currently comes from SMS and email events only.
              </div>
            )}
          </div>

          {lead.latestActivityNote ? (
            <div className="rounded-2xl border border-border bg-muted/20 p-3 text-sm text-foreground">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latest lead activity</p>
              <p className="mt-2">{lead.latestActivityNote}</p>
              {lastTouch ? <p className="mt-2 text-xs text-muted-foreground">Most recent channel: {lastTouch.channel.toUpperCase()} · {relativeTime(lastTouch.sentAt)}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
