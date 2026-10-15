import type { ConfigItem, Health, LeadSourceOverview, SourceItem, SourceStatus } from '@/lib/leadSourceTypes';

export const fmtNum = (n: number | null | undefined) => (n === null || n === undefined ? '-' : n.toLocaleString('en-US'));
export const fmtPct = (n: number | null | undefined) => (n === null || n === undefined ? '-' : `${n}%`);

export function relTime(iso: string | null | undefined, empty = 'Never'): string {
  if (!iso) return empty;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return empty;
  const diff = Date.now() - t;
  const future = diff < 0;
  const mins = Math.floor(Math.abs(diff) / 60_000);
  const text = mins < 1 ? 'just now' : mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}d`;
  if (text === 'just now') return text;
  return future ? `in ${text}` : `${text} ago`;
}

export function intervalLabel(ms: number | null | undefined): string {
  if (!ms) return 'No schedule';
  const m = Math.round(ms / 60_000);
  if (m < 60) return `Every ${m} min`;
  const h = m / 60;
  if (h < 24) return `Every ${Number.isInteger(h) ? h : h.toFixed(1)}h`;
  return `Every ${Math.round(h / 24)}d`;
}

export const STATUS_META: Record<SourceStatus, { label: string; chip: string; dot: string; hint: string }> = {
  healthy: { label: 'Healthy', chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25', dot: 'bg-emerald-500', hint: 'Markets are active with no errors' },
  attention: { label: 'Needs attention', chip: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/25', dot: 'bg-red-500', hint: 'A market reported an error or the sync schedule is failing' },
  pending: { label: 'Waiting for first sync', chip: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/25', dot: 'bg-blue-500', hint: 'Configured but no successful sync recorded yet' },
  paused: { label: 'Paused', chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25', dot: 'bg-amber-500', hint: 'Every market is paused' },
  unmanaged: { label: 'No config', chip: 'bg-muted text-muted-foreground border-border', hint: 'Leads arrive from this source but it has no market config here', dot: 'bg-muted-foreground' },
};

export const HEALTH_META: Record<Health, { label: string; chip: string }> = {
  healthy: { label: 'Active', chip: STATUS_META.healthy.chip },
  attention: { label: 'Error', chip: STATUS_META.attention.chip },
  pending: { label: 'Pending', chip: STATUS_META.pending.chip },
  paused: { label: 'Paused', chip: STATUS_META.paused.chip },
};

const PALETTE = ['#2563eb', '#059669', '#d97706', '#9333ea', '#dc2626', '#0891b2', '#db2777', '#65a30d', '#7c3aed', '#ea580c'];
export function sourceColor(key: string): string {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function deriveStatus(configs: ConfigItem[], scheduleFailures: number): { status: SourceStatus; attention: number } {
  const attention = configs.filter(c => c.health === 'attention').length + (scheduleFailures > 0 ? 1 : 0);
  if (!configs.length) return { status: 'unmanaged', attention };
  if (attention > 0) return { status: 'attention', attention };
  if (configs.every(c => c.health === 'paused')) return { status: 'paused', attention };
  if (configs.every(c => c.health === 'pending' || c.health === 'paused')) return { status: 'pending', attention };
  return { status: 'healthy', attention };
}

/** Applies a change to some market configs and recomputes everything derived from them, so the screen reacts instantly. */
export function patchConfigs(data: LeadSourceOverview, ids: Set<string>, change: (c: ConfigItem) => ConfigItem): LeadSourceOverview {
  const sources: SourceItem[] = data.sources.map(s => {
    if (!s.configs.some(c => ids.has(c.id))) return s;
    const configs = s.configs.map(c => (ids.has(c.id) ? change(c) : c));
    const { status, attention } = deriveStatus(configs, s.schedule?.failures ?? 0);
    return { ...s, configs, status, attentionCount: attention };
  });
  const flat = sources.flatMap(s => s.configs);
  return {
    ...data, sources,
    totals: { ...data.totals, activeConfigs: flat.filter(c => c.active).length, pausedConfigs: flat.filter(c => c.health === 'paused').length, attentionConfigs: flat.filter(c => c.health === 'attention').length, pendingConfigs: flat.filter(c => c.health === 'pending').length },
  };
}

export function toCsv(sources: SourceItem[]): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Source', 'Status', 'Markets configured', 'Markets active', 'Leads', 'Added last 7 days', 'Phone on file %', 'Verified owner %', 'Contact coverage', 'Last successful sync', 'Schedule'];
  const rows = sources.map(s => {
    const real = s.stats.real || 0;
    const p = (n: number) => (real ? Math.round((n / real) * 100) : '');
    return [s.name, STATUS_META[s.status].label, s.configs.length, s.configs.filter(c => c.active).length, s.stats.total, s.stats.added7d, p(s.stats.phone), p(s.stats.verifiedOwner), s.stats.quality ?? '', s.lastSuccess ?? '', intervalLabel(s.schedule?.intervalMs)].map(esc).join(',');
  });
  return [head.map(esc).join(','), ...rows].join('\n');
}

/** Must match the server's key so a newly created source can be opened right away. */
export const sourceKeyOf = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
