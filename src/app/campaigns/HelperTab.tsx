'use client';

import React, { useEffect, useState } from 'react';
import { Sparkles, Loader2, ArrowRight, Target, Users, Clock, TrendingUp, ShieldAlert, Phone, ChevronDown, Wand2, ListChecks } from 'lucide-react';
import { AssistantResult, CampaignOption, Card, Chip, Notice, cx, fmtDate, post } from './shared';

const STARTERS = [
  'Get the most homeowner replies from my best leads',
  'Test a new market with a small, low-cost batch',
  'Reach luxury homeowners with the strongest estimates',
  'Lowest cost per submitted estimate form',
  'Only text people whose phone numbers are most likely correct',
];
const STEPS = ['Reading your campaign results', 'Checking who is still available to text', 'Comparing audiences and timing', 'Writing your options'];

function OptionCard({ o, rank, onUse }: { o: CampaignOption; rank: number; onUse: (o: CampaignOption) => void }) {
  const [open, setOpen] = useState(rank === 0);
  const filters = [o.audience.states.length ? o.audience.states.join(', ') : 'All states', o.audience.minScore ? `score ${o.audience.minScore}+` : null].filter(Boolean).join(' · ');
  return (
    <Card className={cx('overflow-hidden transition-shadow hover:shadow-md', rank === 0 && 'ring-1 ring-primary/40')}>
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {rank === 0 ? <Chip tone="primary"><Sparkles size={11} /> Best fit</Chip> : <Chip>Option {rank + 1}</Chip>}
              <Chip tone="blue"><Users size={11} /> {o.audience.size} homeowners</Chip>
              <Chip>{o.audience.label}</Chip>
            </div>
            <h3 className="text-base font-semibold text-foreground">{o.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{o.goalFit}</p>
          </div>
          <button onClick={() => onUse(o)} className="h-9 inline-flex items-center gap-1.5 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 shrink-0">
            Use this plan <ArrowRight size={15} />
          </button>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          <div className="rounded-xl bg-muted/60 p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Users size={11} /> Audience</p><p className="text-sm mt-1">{filters}</p><p className="text-xs text-muted-foreground mt-0.5">Start with up to {o.suggestedMaxTexts} texts</p></div>
          <div className="rounded-xl bg-muted/60 p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Clock size={11} /> When</p><p className="text-sm mt-1">{fmtDate(o.startAt)}</p><p className="text-xs text-muted-foreground mt-0.5 capitalize">{o.tone} tone{o.spreadHours ? ` · spread over ${o.spreadHours}h` : ''}</p></div>
          <div className="rounded-xl bg-muted/60 p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Target size={11} /> Success looks like</p><p className="text-sm mt-1">{o.successMetric}</p></div>
        </div>

        <button onClick={() => setOpen(v => !v)} className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary">
          {open ? 'Hide' : 'Show'} strategy and reasoning <ChevronDown size={14} className={cx('transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          <div className="mt-3 grid md:grid-cols-2 gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1"><ListChecks size={12} /> Strategy</p>
              <ol className="space-y-2">{o.strategy.map((s, i) => <li key={i} className="flex gap-2.5 text-sm"><span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span><span>{s}</span></li>)}</ol>
            </div>
            <div className="space-y-4">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Why these leads</p><p className="text-sm">{o.whyThisAudience}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Timing</p><p className="text-sm">{o.sendTiming}</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><TrendingUp size={12} /> What to expect</p><p className="text-sm">{o.expectedOutcome}</p></div>
              {o.risks.length > 0 && <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><ShieldAlert size={12} /> Watch out for</p><ul className="space-y-1">{o.risks.map((r, i) => <li key={i} className="text-sm text-muted-foreground">&bull; {r}</li>)}</ul></div>}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function HelperTab({ goal, setGoal, result, setResult, onUse }: {
  goal: string; setGoal: (g: string) => void; result: AssistantResult | null; setResult: (r: AssistantResult | null) => void; onUse: (o: CampaignOption) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) return;
    setStep(0);
    const t = setInterval(() => setStep(s => Math.min(s + 1, STEPS.length - 1)), 4500);
    return () => clearInterval(t);
  }, [loading]);

  async function ask() {
    setLoading(true); setError(null); setResult(null);
    try { setResult(await post<AssistantResult>('/api/campaigns/assistant', { goal })); }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6 bg-gradient-to-br from-primary/10 via-card to-card">
        <div className="flex items-center gap-2 mb-1"><span className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center"><Wand2 size={16} /></span><h2 className="text-lg font-semibold">What do you want this campaign to achieve?</h2></div>
        <p className="text-sm text-muted-foreground mb-4 max-w-3xl">Describe the result you are after in plain words. The helper reads your campaign results and the homeowners still available, then gives you ranked options with the audience, timing and strategy for each.</p>
        <textarea value={goal} onChange={e => setGoal(e.target.value)} rows={3} maxLength={1200} placeholder="For example: I want more homeowners to submit the estimate form from our highest-value leads, without spending much."
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
          <div className="flex flex-wrap gap-1.5">{STARTERS.map(s => <button key={s} onClick={() => setGoal(s)} className="px-3 py-1.5 rounded-full text-xs border border-border bg-background hover:border-primary/50 hover:text-primary transition-colors">{s}</button>)}</div>
          <button onClick={ask} disabled={loading || goal.trim().length < 8} className="h-10 inline-flex items-center gap-2 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:opacity-90">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {result ? 'Get new options' : 'Get strategies'}
          </button>
        </div>
      </Card>

      {error && <Notice tone="red">{error}</Notice>}

      {loading && (
        <Card className="p-6">
          <ul className="space-y-3">{STEPS.map((s, i) => (
            <li key={s} className={cx('flex items-center gap-3 text-sm transition-opacity', i > step && 'opacity-30')}>
              {i < step ? <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[11px] flex items-center justify-center">&#10003;</span> : i === step ? <Loader2 size={18} className="animate-spin text-primary" /> : <span className="w-5 h-5 rounded-full border border-border" />}{s}
            </li>))}</ul>
        </Card>
      )}

      {result && !loading && (
        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-sm leading-relaxed">{result.summary}</p>
            <p className="text-[11px] text-muted-foreground mt-2">Based on {result.basedOn.texts} texts across {result.basedOn.campaigns} campaign{result.basedOn.campaigns === 1 ? '' : 's'} and the homeowners not yet texted.{result.dataNote ? ` ${result.dataNote}` : ''}</p>
          </Card>
          {result.options.map((o, i) => <OptionCard key={o.id} o={o} rank={i} onUse={onUse} />)}
          {result.otherChannels.length > 0 && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><Phone size={15} className="text-primary" /> Better done outside text campaigns</h3>
              <p className="text-xs text-muted-foreground mb-3">People we have already texted cannot be texted again here. These follow-ups work better by call, email or in the CRM.</p>
              <ul className="space-y-2">{result.otherChannels.map((s, i) => <li key={i} className="text-sm">&bull; {s}</li>)}</ul>
            </Card>
          )}
          <Notice tone="blue"><Sparkles size={15} className="mt-0.5 shrink-0" /><span>These are recommendations from limited data, not guarantees. Pick one, review the exact messages in the next step, and nothing is sent until you confirm.</span></Notice>
        </div>
      )}
    </div>
  );
}
