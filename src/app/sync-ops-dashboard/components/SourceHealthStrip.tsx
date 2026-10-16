import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { timeAgo } from '../lib/syncEngine';
import type { SourceStat } from '../lib/types';

const DOMINANT_SHARE_PCT = 60;

export default function SourceHealthStrip({ stats, loading }: { stats: SourceStat[]; loading: boolean }) {
  const dominant = stats.find((s) => s.sharePct > DOMINANT_SHARE_PCT);

  return (
    <section aria-label="Source health" className="space-y-3">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {stats.map((s) => {
          const failing = s.lastStatus === 'failed';
          return (
            <div
              key={s.key}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-md"
            >
              <div className={`absolute inset-x-0 top-0 h-0.5 ${s.accent}`} />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${failing ? 'bg-danger animate-pulse' : s.lastStatus === 'success' ? 'bg-success' : 'bg-muted-foreground/40'}`} />
                  <span className="text-sm font-semibold text-foreground">{s.name}</span>
                </div>
                <span className="text-[10px] font-medium text-muted-foreground">{timeAgo(s.lastEventAt)}</span>
              </div>

              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className={`text-2xl font-bold tabular-nums text-foreground ${loading ? 'opacity-40' : ''}`}>
                    {s.total.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-muted-foreground">leads · +{s.last24h.toLocaleString()} in 24h</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums text-foreground">{s.sharePct}%</div>
                  <div className="text-[10px] text-muted-foreground">of all leads</div>
                </div>
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${s.accent} transition-all duration-500`} style={{ width: `${Math.min(100, s.sharePct)}%` }} />
              </div>

              {failing && s.lastError && (
                <p className="mt-2 truncate text-[10px] text-danger" title={s.lastError}>{s.lastError}</p>
              )}
            </div>
          );
        })}
      </div>

      {dominant && (
        <div className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <AlertTriangle size={13} />
          {dominant.name} supplies {dominant.sharePct}% of all leads. Other sources are under-represented.
        </div>
      )}
    </section>
  );
}
