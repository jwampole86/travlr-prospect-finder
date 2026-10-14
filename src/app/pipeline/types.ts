export type StageKey = 'prospect' | 'queued' | 'texted' | 'engaged' | 'hot' | 'human' | 'contract' | 'live' | 'unreachable' | 'closed';

export interface Card {
  id: string; address: string; city: string; state: string; zip: string | null; beds: number | null; baths: number | null; score: number; netMonthly: number | null;
  owner: string | null; hasPhone: boolean; program: string | null; luxury: boolean; stage: StageKey; manual: boolean; batch: string | null; temperature: string | null;
  summary: string; activityAt: string | null; activityAgo: string | null; replied: boolean; assignedTo: string | null; located: boolean; approximate: boolean;
}
export interface Column { key: StageKey; label: string; hint: string; manual: boolean; count: number; cards: Card[] }
export interface Detail {
  card: Card; version: number; manualStage: string | null;
  lead: { phone: string | null; owner_name?: string | null; contact_name?: string | null; notes?: string | null; listing_url?: string | null; regulation_status?: string | null; estimated_adr?: number | null; estimated_occupancy?: number | null; estimated_gross_monthly?: number | null; estimated_net_monthly?: number | null; beds?: number | null; baths?: number | null; square_feet?: number | null; year_built?: number | null; property_type?: string | null; tags?: string[] | null };
  engagement: { batch: string | null; audience: string | null; twilioStatus: string | null; phoneQuality: string | null; humanClicks: number | null; viewed: boolean | null; deepestStep: string | null; temperature: string | null; score: number | null; scheduledFor: string | null };
  events: Array<{ at: string; kind: string; title: string; text?: string }>;
}

export const STAGE_STYLE: Record<StageKey, { bar: string; chip: string; dot: string }> = {
  prospect: { bar: 'border-t-slate-400', chip: 'bg-slate-500/15 text-slate-600 dark:text-slate-300', dot: 'bg-slate-400' },
  queued: { bar: 'border-t-sky-400', chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', dot: 'bg-sky-400' },
  texted: { bar: 'border-t-blue-500', chip: 'bg-blue-500/15 text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  engaged: { bar: 'border-t-amber-400', chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', dot: 'bg-amber-400' },
  hot: { bar: 'border-t-orange-500', chip: 'bg-orange-500/15 text-orange-700 dark:text-orange-300', dot: 'bg-orange-500' },
  human: { bar: 'border-t-violet-500', chip: 'bg-violet-500/15 text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
  contract: { bar: 'border-t-green-500', chip: 'bg-green-500/15 text-green-700 dark:text-green-300', dot: 'bg-green-500' },
  live: { bar: 'border-t-emerald-500', chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  unreachable: { bar: 'border-t-red-400', chip: 'bg-red-500/15 text-red-700 dark:text-red-300', dot: 'bg-red-400' },
  closed: { bar: 'border-t-zinc-400', chip: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-300', dot: 'bg-zinc-400' },
};

export const MANUAL_MOVES: Array<{ to: 'human' | 'contract' | 'live' | 'closed' | 'auto'; label: string }> = [
  { to: 'human', label: 'Human Outreach' }, { to: 'contract', label: 'Under Contract' }, { to: 'live', label: 'Live' }, { to: 'closed', label: 'Closed Out' }, { to: 'auto', label: 'Return to automatic' },
];

export const money = (n: number | null | undefined) => (n == null ? '—' : `$${Math.round(n).toLocaleString()}`);
export const scoreTone = (s: number) => (s >= 80 ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/50' : s >= 60 ? 'text-amber-600 dark:text-amber-400 border-amber-500/50' : 'text-muted-foreground border-border');

export const STAGE_LABEL: Record<StageKey, string> = { prospect: 'Prospects', queued: 'Queued', texted: 'Texted', engaged: 'Engaged', hot: 'Hot', human: 'Human Outreach', contract: 'Under Contract', live: 'Live', unreachable: 'Unreachable', closed: 'Closed Out' };
export const STAGE_ORDER = Object.keys(STAGE_LABEL) as StageKey[];
export const STAGE_HEX: Record<StageKey, string> = { prospect: '#94a3b8', queued: '#38bdf8', texted: '#3b82f6', engaged: '#fbbf24', hot: '#f97316', human: '#8b5cf6', contract: '#22c55e', live: '#10b981', unreachable: '#f87171', closed: '#a1a1aa' };
