'use client';

import React from 'react';

export interface BatchStats { delivered: number; undelivered: number; errors: Record<string, number>; cancelReasons: Record<string, number>; replies: number; yes: number; no: number; stop: number; other: number }
export interface BatchInfo { batch: string; texts: number; firstSend: string; lastSend: string; audience: string | null; pending: number; canceled: number; stats?: BatchStats }
export interface Bucket { texts: number; delivered: number; clicked: number; viewed: number; submitted: number; replied: number; yes: number; optOut: number; hot: number; cost: number; deliveredPct: number; clickPct: number; viewPct: number; submitPct: number; replyPct: number; optOutPct: number; hotPct: number }
export interface Hot { leadId: string; batch: string; temperature: string; score: number; address: string; owner: string | null; stage: string | null; phone: string | null; why: string; lastActivityAt: string | null; lastActivity: string | null }
export interface Overview {
  empty?: boolean; updatedAt?: string; final?: boolean; totals: Bucket;
  funnel: { texts: number; sent: number; delivered: number; clicked: number; viewed: number; contactStarted: number; submitted: number; replied: number; optedIn: number; optedOut: number };
  daily?: Array<{ date: string; sent: number; delivered: number; clicked: number; replied: number }>;
  statuses: Record<string, number>; deliveryErrors: Record<string, number>; replyIntents: Record<string, number>;
  by: Record<string, Record<string, Bucket>>; hotLeads: Hot[]; replies: Array<{ leadId: string; batch: string; at: string; intent: string; text: string }>; chatQuestions: string[];
  skipTrace: Array<{ audience: string; texts: number; sent: number; delivered: number; deliveredPct: number; unreachable: number; wrongPerson: number; engaged: number; engagedPct: number; likelyReachedPct: number; screenedLeads: number | null; prefilterLandline: number | null; prefilterInvalid: number | null; landlinePct: number | null }>;
  cost: { totalUsd: number; pricedTexts: number; perClick: number | null; perSubmission: number | null; perHotLead: number | null }; botClicksFiltered: number;
}
export interface Insights { headline: string; whatWorked: string[]; whatDidNot: string[]; objections: string[]; nextCampaign: { audience: string; copyTests: string[]; sendTiming: string; followUp: string[] }; crmActions: string[]; dataGaps: string[]; confidence: string; _createdAt?: string }

export interface AudienceInfo { id: string; label: string; blurb: string; size: number; avgScore: number; points: Array<[string, number]>; topStates: Array<{ state: string; count: number }> }
export interface CampaignOption {
  id: string; title: string; goalFit: string;
  audience: { id: string; label: string; states: string[]; minScore: number; size: number };
  whyThisAudience: string; strategy: string[]; tone: 'friendly' | 'direct' | 'mix';
  sendTiming: string; startAt: string; spreadHours: 0 | 1 | 2 | 4; suggestedName: string; suggestedMaxTexts: number;
  expectedOutcome: string; successMetric: string; risks: string[];
}
export interface AssistantResult { summary: string; options: CampaignOption[]; otherChannels: string[]; dataNote: string; basedOn: { campaigns: number; texts: number } }
export interface BuilderForm { name: string; audience: string; states: string[]; minScore: number; maxTexts: number; tone: 'friendly' | 'direct' | 'mix'; startAt: string; spreadHours: 0 | 1 | 2 | 4 }

export const fmtDate = (s: string) => new Date(s).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export function timeAgo(s: string) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(s)) / 60_000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}
export const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

export async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
  return j as T;
}

export function Card({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx('rounded-2xl border border-border bg-card shadow-sm', className)}>{children}</div>;
}

export function Chip({ children, tone = 'muted', className }: { children: React.ReactNode; tone?: 'muted' | 'primary' | 'green' | 'amber' | 'red' | 'blue'; className?: string }) {
  const tones = {
    muted: 'bg-muted text-muted-foreground', primary: 'bg-primary/10 text-primary',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    red: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300', blue: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

export function Notice({ tone, children }: { tone: 'red' | 'blue' | 'amber' | 'green'; children: React.ReactNode }) {
  const t = {
    red: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200', blue: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200',
    amber: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200', green: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
  };
  return <div className={cx('rounded-xl border px-4 py-3 text-sm flex items-start gap-2.5', t[tone])}>{children}</div>;
}

export function SectionTitle({ icon, title, hint, right }: { icon?: React.ReactNode; title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
      <div><h2 className="text-sm font-semibold flex items-center gap-2">{icon}{title}</h2>{hint && <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">{hint}</p>}</div>
      {right}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-muted', className)} />;
}

/** Local `YYYY-MM-DDTHH:mm` for a datetime-local input from an ISO instant, and back. */
export const toLocalInput = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
export const fromLocalInput = (v: string) => new Date(v).toISOString();

export const TONES: Array<{ id: BuilderForm['tone']; title: string; blurb: string }> = [
  { id: 'mix', title: 'Mix (recommended)', blurb: 'Alternates warm and direct so this campaign also shows which tone works better.' },
  { id: 'friendly', title: 'Friendly', blurb: 'Warm and neighborly, low pressure.' },
  { id: 'direct', title: 'Direct', blurb: 'Brief and businesslike.' },
];

export const ERROR_MEANING: Record<string, [string, string]> = {
  '30003': ['phone off or unreachable', 'The handset was switched off, out of coverage or otherwise unreachable, so the carrier could not deliver the text.'],
  '30004': ['blocked by carrier', 'The carrier or the recipient blocked the message.'],
  '30005': ['number not in service', 'The number does not exist or is no longer active (disconnected or inactive line).'],
  '30006': ['landline or carrier cannot receive texts', 'The number is a landline or the carrier cannot receive texts, so it will never be delivered.'],
  '30007': ['filtered as spam', 'The carrier filtered the message as spam or a policy violation.'],
  '30008': ['carrier gave no reason', 'The carrier rejected the message without saying why. Often temporary or a number that cannot receive texts.'],
  '21211': ['invalid phone number', 'The number is not a valid phone number.'],
  '21610': ['recipient opted out', 'The recipient replied STOP, so no more texts can be sent to this number.'],
  '21614': ['not a mobile number', 'The number cannot receive texts because it is not a mobile line.'],
};


export const TEMP_STYLE: Record<string, string> = {
  wrong_contact: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300', hot: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300', warm: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  cold: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300', unreachable: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300', opted_out: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  declined: 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300', untouched: 'bg-slate-100 text-slate-500 dark:bg-slate-500/10 dark:text-slate-400', pending: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
};

/** What a number on the Results tab opens: the texts behind it, optionally narrowed to one segment, optionally straight to one text. */
export interface DrillSpec { title: string; metric: string; group?: string; value?: string; batch?: string; openLead?: { leadId: string; batch: string } }
