import React, { useMemo, useState } from 'react';
import { ChevronDown, Loader2, Play, Search, AlertTriangle, CheckCircle2, Clock, CircleSlash } from 'lucide-react';
import { SOURCES, timeAgo, type SourceKey } from '../lib/syncEngine';
import type { PortfolioRow, SourceCell } from '../lib/types';

type Filter = 'all' | 'attention' | 'stale' | 'healthy';
type Health = 'running' | 'never' | 'failed' | 'partial' | 'ok' | 'empty' | 'stale';

const STALE_MS = 24 * 60 * 60 * 1000;

function cellsOf(row: PortfolioRow): SourceCell[] {
  return SOURCES.map((s) => row.cells[s.key]).filter((c): c is SourceCell => !!c);
}

function lastRunAt(row: PortfolioRow): string | null {
  return cellsOf(row).reduce<string | null>((latest, c) => (!latest || c.at > latest ? c.at : latest), null);
}

function healthOf(row: PortfolioRow): Health {
  if (row.running) return 'running';
  const cells = cellsOf(row);
  if (cells.length === 0) return 'never';
  const attempted = cells.filter((c) => c.status !== 'skipped');
  if (attempted.length === 0) return 'empty';
  const failed = attempted.filter((c) => c.status === 'failed').length;
  if (failed === attempted.length) return 'failed';
  if (failed > 0) return 'partial';
  const at = lastRunAt(row);
  if (at && Date.now() - new Date(at).getTime() > STALE_MS) return 'stale';
  return attempted.some((c) => c.status === 'success') ? 'ok' : 'empty';
}

const HEALTH_BADGE: Record<Health, { label: string; cls: string; icon: React.ElementType }> = {
  running: { label: 'Syncing', cls: 'bg-primary/10 text-primary', icon: Loader2 },
  never: { label: 'Never synced', cls: 'bg-muted text-muted-foreground', icon: Clock },
  failed: { label: 'Failed', cls: 'bg-danger/10 text-danger', icon: AlertTriangle },
  partial: { label: 'Partial', cls: 'bg-warning/10 text-warning', icon: AlertTriangle },
  ok: { label: 'Healthy', cls: 'bg-success/10 text-success', icon: CheckCircle2 },
  empty: { label: 'No new data', cls: 'bg-muted text-muted-foreground', icon: CircleSlash },
  stale: { label: 'Stale', cls: 'bg-warning/10 text-warning', icon: Clock },
};

const DOT: Record<string, string> = {
  success: 'bg-success',
  empty: 'bg-muted-foreground/40',
  failed: 'bg-danger',
  skipped: 'bg-transparent border border-dashed border-muted-foreground/40',
  idle: 'bg-muted-foreground/20',
};

function SourceChip({ name, cell }: { name: string; cell?: SourceCell }) {
  const status = cell?.status ?? 'idle';
  return (
    <span
      title={cell ? `${name}: ${cell.status}${cell.error ? ` — ${cell.error}` : ''} (${timeAgo(cell.at)})` : `${name}: not run yet`}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} />
      {name}
      {cell && cell.status === 'success' && <span className="font-semibold tabular-nums text-foreground">+{cell.newLeads}</span>}
    </span>
  );
}

export default function PortfolioSyncList({
  rows,
  busy,
  onSync,
}: {
  rows: PortfolioRow[];
  busy: boolean;
  onSync: (stateCode: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const enriched = useMemo(() => rows.map((r) => ({ row: r, health: healthOf(r), at: lastRunAt(r) })), [rows]);

  const counts = useMemo(() => ({
    all: enriched.length,
    attention: enriched.filter((e) => e.health === 'failed' || e.health === 'partial').length,
    stale: enriched.filter((e) => e.health === 'never' || e.health === 'stale').length,
    healthy: enriched.filter((e) => e.health === 'ok' || e.health === 'empty').length,
  }), [enriched]);

  const visible = enriched.filter(({ row, health }) => {
    if (query && !`${row.portfolio} ${row.stateCode}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === 'attention') return health === 'failed' || health === 'partial';
    if (filter === 'stale') return health === 'never' || health === 'stale';
    if (filter === 'healthy') return health === 'ok' || health === 'empty';
    return true;
  });

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'attention', label: 'Needs attention' },
    { key: 'stale', label: 'Stale / never' },
    { key: 'healthy', label: 'Healthy' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search portfolios…"
            className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
              <span className={`ml-1.5 tabular-nums ${filter === f.key ? 'opacity-80' : 'opacity-60'}`}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {visible.length === 0 ? (
          <div className="py-14 text-center text-sm text-muted-foreground">No portfolios match.</div>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map(({ row, health, at }) => {
              const badge = HEALTH_BADGE[health];
              const BadgeIcon = badge.icon;
              const isOpen = expanded === row.stateCode;
              const pct = row.progress.total ? Math.round((row.progress.done / row.progress.total) * 100) : 0;
              return (
                <li key={row.stateCode} className="relative">
                  {row.running && (
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-primary/10">
                      <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  <div className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/20">
                    <button
                      onClick={() => setExpanded(isOpen ? null : row.stateCode)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      aria-expanded={isOpen}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary">
                        {row.stateCode}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">{row.portfolio}</span>
                          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                            <BadgeIcon size={10} className={health === 'running' ? 'animate-spin' : ''} />
                            {row.running ? `Syncing ${row.progress.done}/${row.progress.total}` : badge.label}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {row.totalLeads.toLocaleString()} leads · last run {timeAgo(at)}
                        </span>
                      </span>
                      <span className="hidden shrink-0 items-center gap-1.5 md:flex">
                        {SOURCES.map((s) => (
                          <SourceChip key={s.key} name={s.name} cell={row.cells[s.key]} />
                        ))}
                      </span>
                      <ChevronDown size={14} className={`shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <button
                      onClick={() => onSync(row.stateCode)}
                      disabled={busy || row.running}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {row.running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                      Sync
                    </button>
                  </div>

                  {isOpen && (
                    <div className="grid grid-cols-1 gap-3 border-t border-border bg-muted/10 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
                      {SOURCES.map((s) => {
                        const c = row.cells[s.key as SourceKey];
                        return (
                          <div key={s.key} className="rounded-xl border border-border bg-card p-3">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                                <span className={`h-2 w-2 rounded-full ${s.accent}`} />
                                {s.name}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{c ? timeAgo(c.at) : '—'}</span>
                            </div>
                            {c ? (
                              <>
                                <dl className="mt-2 grid grid-cols-4 gap-2 text-center">
                                  {[
                                    ['Fetched', c.fetched],
                                    ['New', c.newLeads],
                                    ['Upd.', c.updated],
                                    ['Dupes', c.duplicates],
                                  ].map(([label, value]) => (
                                    <div key={label as string}>
                                      <dd className="text-sm font-bold tabular-nums text-foreground">{value as number}</dd>
                                      <dt className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                                    </div>
                                  ))}
                                </dl>
                                <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                                  <span className="capitalize">{c.status === 'skipped' ? 'No cities configured' : c.status}</span>
                                  {c.durationMs != null && <span>{(c.durationMs / 1000).toFixed(1)}s</span>}
                                </div>
                                {c.error && c.status !== 'skipped' && (
                                  <p className="mt-1.5 break-words text-[10px] text-danger">{c.error}</p>
                                )}
                              </>
                            ) : (
                              <p className="mt-3 text-[11px] text-muted-foreground">No pull recorded yet.</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
