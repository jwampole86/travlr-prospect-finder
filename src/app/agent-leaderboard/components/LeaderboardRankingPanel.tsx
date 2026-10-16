import { ChevronDown, ChevronUp, Phone, Reply, Target, Trophy } from 'lucide-react';
import { EmptyState, Panel, StatusPill } from '@/components/ops';
import type { AgentLeaderboardRow, LeaderboardMetric } from '../types';
import { formatDays, formatMetricValue, formatPercent, METRIC_LABELS, metricBarWidth, sortAgents } from '../utils';

export default function LeaderboardRankingPanel({
  agents,
  metric,
  expandedAgentId,
  onToggleExpanded,
}: {
  agents: AgentLeaderboardRow[];
  metric: LeaderboardMetric;
  expandedAgentId: string | null;
  onToggleExpanded: (agentId: string) => void;
}) {
  const sortedAgents = sortAgents(agents, metric);
  const numericValues = sortedAgents.map((agent) => metric === 'replyRate' ? agent.replyRate ?? 0 : agent[metric]);
  const maxMetric = Math.max(...numericValues, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <Panel title={`${METRIC_LABELS[metric]} overview`} icon={Target}>
        {sortedAgents.length === 0 ? (
          <EmptyState icon={Trophy} title="No real performance data yet" hint="This leaderboard only renders rows backed by assigned leads, outreach, calls, or closed deals." />
        ) : (
          <div className="space-y-4">
            {sortedAgents.map((agent) => {
              const value = metric === 'replyRate' ? agent.replyRate ?? 0 : agent[metric];
              return (
                <div key={`bar-${agent.id}`} className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{agent.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{agent.email}</div>
                    </div>
                    <div className="shrink-0 font-semibold tabular-nums text-foreground">{formatMetricValue(agent, metric)}</div>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${metricBarWidth(value, maxMetric)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Leaderboard" icon={Trophy} padded={false}>
        {sortedAgents.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={Trophy} title="No leaderboard rows" hint="Once leads are assigned or agent-attributed outreach/call/deal rows exist, rankings will appear here." />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sortedAgents.map((agent, index) => {
              const expanded = expandedAgentId === agent.id;
              return (
                <div key={agent.id}>
                  <button
                    type="button"
                    onClick={() => onToggleExpanded(agent.id)}
                    className="flex w-full items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-muted/30"
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-semibold ${index === 0 ? 'bg-warning/10 text-warning' : index === 1 ? 'bg-primary/10 text-primary' : index === 2 ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-foreground">{agent.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{agent.email}</div>
                    </div>
                    <div className="hidden items-center gap-6 md:flex">
                      <div className="text-right text-xs">
                        <div className="font-semibold tabular-nums text-foreground">{agent.assignedLeads}</div>
                        <div className="text-muted-foreground">leads</div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="font-semibold tabular-nums text-foreground">{formatPercent(agent.replyRate)}</div>
                        <div className="text-muted-foreground">reply rate</div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="font-semibold tabular-nums text-foreground">{agent.callsLogged}</div>
                        <div className="text-muted-foreground">calls</div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="font-semibold tabular-nums text-foreground">{agent.dealsClosed}</div>
                        <div className="text-muted-foreground">deals</div>
                      </div>
                    </div>
                    {expanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                  </button>

                  {expanded && (
                    <div className="space-y-4 bg-muted/20 px-4 pb-4">
                      <div className="grid gap-3 pt-1 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-border bg-card p-3">
                          <div className="text-xs text-muted-foreground">Assigned leads</div>
                          <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">{agent.assignedLeads}</div>
                        </div>
                        <div className="rounded-2xl border border-border bg-card p-3">
                          <div className="text-xs text-muted-foreground">Attributed outreach</div>
                          <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">{agent.outreachSent}</div>
                          <div className="text-xs text-muted-foreground">{agent.outreachReplies} replies</div>
                        </div>
                        <div className="rounded-2xl border border-border bg-card p-3">
                          <div className="text-xs text-muted-foreground">Calls logged</div>
                          <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">{agent.callsLogged}</div>
                        </div>
                        <div className="rounded-2xl border border-border bg-card p-3">
                          <div className="text-xs text-muted-foreground">Average close time</div>
                          <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">{formatDays(agent.avgCloseDays)}</div>
                          <div className="text-xs text-muted-foreground">{agent.dealsClosed} closed deals</div>
                        </div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                        <div className="rounded-2xl border border-border bg-card p-4">
                          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                            <Reply size={14} className="text-primary" /> Template usage
                          </div>
                          {agent.topTemplates.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No agent-attributed template usage exists yet for this teammate.</p>
                          ) : (
                            <div className="space-y-2">
                              {agent.topTemplates.map((template) => (
                                <div key={template.id || template.name} className="rounded-2xl border border-border px-3 py-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium text-foreground">{template.name}</div>
                                      <div className="text-xs text-muted-foreground">{template.count} sends • {template.replies} replies</div>
                                    </div>
                                    <StatusPill tone="primary">{template.count > 0 ? `${Math.round((template.replies / template.count) * 100)}%` : '0%'} replied</StatusPill>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="rounded-2xl border border-border bg-card p-4">
                          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                            <Phone size={14} className="text-primary" /> Real-data signals
                          </div>
                          <div className="space-y-2 text-sm text-muted-foreground">
                            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2">
                              <span>Reply rate</span>
                              <span className="font-semibold tabular-nums text-foreground">{formatPercent(agent.replyRate)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2">
                              <span>Calls per lead</span>
                              <span className="font-semibold tabular-nums text-foreground">{agent.assignedLeads > 0 ? (agent.callsLogged / agent.assignedLeads).toFixed(2) : '—'}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2">
                              <span>Outreach per lead</span>
                              <span className="font-semibold tabular-nums text-foreground">{agent.assignedLeads > 0 ? (agent.outreachSent / agent.assignedLeads).toFixed(2) : '—'}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2">
                              <span>Deals closed</span>
                              <span className="font-semibold tabular-nums text-foreground">{agent.dealsClosed}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
