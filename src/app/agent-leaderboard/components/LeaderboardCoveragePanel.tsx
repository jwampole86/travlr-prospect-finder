import { AlertTriangle, Database, Phone, Reply, Trophy } from 'lucide-react';
import { Panel, StatusPill } from '@/components/ops';
import type { LeaderboardCoverage } from '../types';

export default function LeaderboardCoveragePanel({ coverage }: { coverage: LeaderboardCoverage }) {
  return (
    <Panel title="Data coverage" icon={Database}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Tracked agents</span>
            <Trophy size={14} className="text-primary" />
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{coverage.totalAgents}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Attributed outreach</span>
            <Reply size={14} className="text-primary" />
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{coverage.attributedOutreachRecords}</div>
          <div className="mt-1 text-xs text-muted-foreground">{coverage.totalOutreachRecords} total records • {coverage.attributedOutreachPct.toFixed(1)}% attributable</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Calls logged</span>
            <Phone size={14} className="text-primary" />
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{coverage.totalCalls}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Closed deals</span>
            <Database size={14} className="text-primary" />
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{coverage.totalDeals}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-start gap-2 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <div>
          <div className="font-semibold">Honest read of the current data</div>
          <div className="mt-1 text-warning">
            Rankings only use attributed leads, outreach, calls, and deals. If outreach lacks <code className="rounded bg-warning/20 px-1 py-0.5">agent_id</code> or the deals table is empty, those metrics stay blank or zero instead of being inferred.
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusPill tone={coverage.attributedOutreachRecords > 0 ? 'primary' : 'warning'}>{coverage.attributedOutreachRecords > 0 ? 'Outreach attribution available' : 'No attributed outreach yet'}</StatusPill>
            <StatusPill tone={coverage.totalDeals > 0 ? 'primary' : 'warning'}>{coverage.totalDeals > 0 ? 'Closed deals recorded' : 'No closed deals recorded'}</StatusPill>
          </div>
        </div>
      </div>
    </Panel>
  );
}
