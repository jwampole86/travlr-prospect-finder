'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, Loader2, Scale, Search } from 'lucide-react';
import { Card, Chip, Notice, SectionTitle, Skeleton, cx, fmtDate } from './shared';

interface AuditRow { leadId: string; batch: string; address: string; sentRange: string | null; pageRange: string | null; textMatchesPage: boolean | null; shownMatchesNow: boolean | null; basis: string | null; assumedBeds: boolean | null; flags: string[]; clicked: boolean; viewed: boolean; timeOnPage: number | null; deepest: string | null; submitted: boolean; device: string | null; hadPageEvents: boolean }
interface Summary { checked: number; textChecked: number; legacyTexts: number; textMatchesPage: number; textMismatch: number; shownMismatch: number; shownBeforeCorrection: number; basis: Record<string, number>; assumedBeds: number; funnel: { texted: number; opened: number; viewedEstimate: number; startedForm: number; submitted: number }; openedWithoutPageEvents: number; medianSeconds: number | null; mobileShare: number | null }
interface Scenario { key: string; label: string; occupancy: number; adr: number; grossMonthly: number; netMonthly: number; annualNet: number }
interface Bench { error?: string; market?: string | null; submarket?: string | null; adr?: number | null; occupancyPct?: number | null; annualGross?: number | null; ours?: { adr: number; occupancyPct: number; annualGross: number }; grossRatio?: number | null }
interface Detail {
  leadId: string; address: string; liveUrl: string;
  lead: { beds: number | null; baths: number | null; type: string | null; price: number | null; priceType: string | null; rentAi: number | null; adr: number | null; occupancy: number | null; source: string | null; program: string | null };
  sent: { message: string | null; range: string | null; at: string | null; variant: string | null };
  report: { basis: string; basisLabel: string; property: { beds: number | null; baths: number | null; type: string | null; assumedBeds: boolean }; longTermRent: number; scenarios: Scenario[]; advantageMonthly: number; advantageAnnual: number; regulationHeadline: string; regulationFound: boolean; costs: Array<{ label: string; pct: number; monthly: number }> };
  checks: { pageLowK: number; pageHighK: number; textMatchesPage: boolean | null; shownMatchesNow: boolean | null; recordedNet: number | null; flags: string[] };
  engagement: { clicks: number; viewed: boolean; timeOnPage: number | null; deepest: string | null; chat: number; submitted: boolean; device: string | null; os: string | null; reply: string | null } | null;
  journey: Array<{ at: string; event: string; data: Record<string, unknown> | null }>;
  benchmark: Bench | null;
}

const usd = (n: number | null | undefined) => (n == null ? '-' : `$${Math.round(n).toLocaleString()}`);
const BASIS: Record<string, string> = { PROPERTY: 'Home\u2019s own details', MARKET: 'ZIP rent data', STATE: 'Regional average' };

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <Card className="p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
      <p className={cx('mt-1 text-2xl font-bold tabular-nums', tone === 'good' && 'text-emerald-600', tone === 'bad' && 'text-rose-600', tone === 'warn' && 'text-amber-600')}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}</Card>
  );
}

function DetailView({ leadId, onBack }: { leadId: string; onBack: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [bench, setBench] = useState<'idle' | 'loading'>('idle');
  const load = useCallback(async (benchmark: boolean) => {
    if (benchmark) setBench('loading');
    try {
      const res = await fetch(`/api/campaigns/estimate-audit?leadId=${encodeURIComponent(leadId)}${benchmark ? '&benchmark=1' : ''}`, { cache: 'no-store' });
      const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Could not load'); setD(j); setErr(null);
    } catch (e) { setErr((e as Error).message); } finally { setBench('idle'); }
  }, [leadId]);
  useEffect(() => { load(false); }, [load]);

  if (err) return <Notice tone="red"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {err}</Notice>;
  if (!d) return <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-72" /></div>;
  const exp = d.report.scenarios.find(s => s.key === 'expected')!;
  const b = d.benchmark;
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><ArrowLeft size={14} /> All homeowners</button>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="font-semibold">{d.address}</h3><p className="text-xs text-muted-foreground mt-0.5">Basis: {BASIS[d.report.basis] ?? d.report.basis}. {d.report.basisLabel}.</p></div>
          <a href={d.liveUrl} target="_blank" rel="noopener noreferrer" className="h-9 inline-flex items-center gap-1.5 px-3 rounded-xl border border-border text-sm hover:bg-muted"><ExternalLink size={14} /> Open the page they see</a>
        </div>
        {d.checks.flags.length > 0 && <ul className="mt-3 space-y-1">{d.checks.flags.map(f => <li key={f} className="text-xs text-amber-700 dark:text-amber-300 flex gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{f}</li>)}</ul>}
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5">
          <SectionTitle title="1. The text we sent" />
          {d.sent.message ? <pre className="text-xs whitespace-pre-wrap font-sans bg-muted/60 rounded-xl p-3">{d.sent.message}</pre> : <p className="text-sm text-muted-foreground">No message found.</p>}
          <p className="text-xs text-muted-foreground mt-2">Range in the text: <b className="text-foreground">{d.sent.range ?? '-'}</b>{d.sent.at ? ` \u00b7 ${fmtDate(d.sent.at)}` : ''}</p>
        </Card>
        <Card className="p-5">
          <SectionTitle title="2. What the page shows today" hint="Net per year to the owner, after all costs." />
          <div className="space-y-2">{d.report.scenarios.map(s => (
            <div key={s.key} className={cx('rounded-xl border p-3 text-sm', s.key === 'expected' ? 'border-primary/40 bg-primary/5' : 'border-border')}>
              <div className="flex justify-between"><span className="font-medium">{s.label}</span><b className="tabular-nums">{usd(s.annualNet)}</b></div>
              <p className="text-[11px] text-muted-foreground mt-0.5">${s.adr}/night at {s.occupancy}% occupancy = {usd(s.grossMonthly * 12)} gross a year</p></div>))}</div>
          <p className="text-xs mt-3 flex items-center gap-1.5">{d.checks.textMatchesPage === true ? <><CheckCircle2 size={13} className="text-emerald-600" /> Text range matches the page</> : d.checks.textMatchesPage === false ? <><AlertTriangle size={13} className="text-amber-600" /> Text said {d.sent.range}, page says ${d.checks.pageLowK}K-${d.checks.pageHighK}K</> : 'No text range to compare'}</p>
          {d.checks.recordedNet != null && <p className="text-xs mt-1 flex items-center gap-1.5">{d.checks.shownMatchesNow ? <CheckCircle2 size={13} className="text-emerald-600" /> : <AlertTriangle size={13} className="text-amber-600" />} They saw {usd(d.checks.recordedNet)} expected net{d.checks.shownMatchesNow ? ', same as today' : ', which differs from today'}</p>}
        </Card>
        <Card className="p-5">
          <SectionTitle title="3. What we hold on the home" />
          <dl className="text-sm space-y-1.5">
            {([['Bedrooms', d.lead.beds ?? 'not on file (page assumes 3)'], ['Bathrooms', d.lead.baths ?? 'not on file'], ['Property type', d.lead.type ?? '-'], ['Price on file', d.lead.price ? `${usd(d.lead.price)} (${d.lead.priceType ?? '?'})` : 'none'], ['Our rent estimate', d.lead.rentAi ? `${usd(d.lead.rentAi)}/mo` : 'none'], ['Long-term rent used', `${usd(d.report.longTermRent)}/mo`], ['Nightly rate on file', d.lead.adr ? usd(d.lead.adr) : 'none (bedroom model)'], ['Occupancy on file', d.lead.occupancy ? `${d.lead.occupancy}%` : 'none (bedroom model)'], ['Source', d.lead.source ?? '-'], ['Local rules', d.report.regulationHeadline]] as Array<[string, React.ReactNode]>).map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
          </dl>
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle icon={<Scale size={15} className="text-primary" />} title="Independent check" hint="Compares this estimate with AirDNA's own estimate for the same address and bedrooms. It uses one call of the AirDNA allowance."
          right={<button onClick={() => load(true)} disabled={bench === 'loading'} className="h-8 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">{bench === 'loading' ? <Loader2 size={13} className="animate-spin" /> : <Scale size={13} />} {b ? 'Run again' : 'Compare with AirDNA'}</button>} />
        {!b && <p className="text-sm text-muted-foreground">Not run yet.</p>}
        {b?.error && <Notice tone="amber">{b.error}</Notice>}
        {b && !b.error && b.ours && (
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl bg-muted/60 p-3"><p className="text-[11px] uppercase text-muted-foreground">Our page (expected)</p><p className="font-bold mt-1">{usd(b.ours.annualGross)} gross</p><p className="text-xs text-muted-foreground">${b.ours.adr}/night, {b.ours.occupancyPct}% occupied</p></div>
            <div className="rounded-xl bg-muted/60 p-3"><p className="text-[11px] uppercase text-muted-foreground">AirDNA{b.submarket ? ` (${b.submarket})` : b.market ? ` (${b.market})` : ''}</p><p className="font-bold mt-1">{usd(b.annualGross)} gross</p><p className="text-xs text-muted-foreground">${b.adr}/night, {b.occupancyPct}% occupied</p></div>
            <div className={cx('rounded-xl p-3', (b.grossRatio ?? 1) > 1.3 || (b.grossRatio ?? 1) < 0.75 ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-emerald-50 dark:bg-emerald-500/10')}>
              <p className="text-[11px] uppercase text-muted-foreground">Ours compared with AirDNA</p><p className="font-bold mt-1 text-lg">{b.grossRatio}x</p><p className="text-xs text-muted-foreground">{(b.grossRatio ?? 1) > 1.3 ? 'Our page is higher than the independent estimate' : (b.grossRatio ?? 1) < 0.75 ? 'Our page is lower than the independent estimate' : 'Within about 30%'}</p></div>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <SectionTitle title="What they did" />
        {d.engagement ? <p className="text-sm">{d.engagement.clicks} link open(s) on {d.engagement.device ?? 'unknown device'}{d.engagement.os ? ` (${d.engagement.os})` : ''}, {d.engagement.timeOnPage != null ? `${d.engagement.timeOnPage}s on the page, ` : ''}furthest step: {d.engagement.deepest ?? 'none'}{d.engagement.chat ? `, ${d.engagement.chat} chat question(s)` : ''}{d.engagement.submitted ? ', submitted the form' : ', did not submit the form'}{d.engagement.reply ? `, replied ${d.engagement.reply}` : ''}.</p> : <p className="text-sm text-muted-foreground">No engagement data.</p>}
        {d.journey.length > 0 && <ol className="mt-3 space-y-1">{d.journey.map((j, i) => <li key={i} className="text-xs text-muted-foreground"><span className="tabular-nums">{fmtDate(j.at)}</span> &middot; <span className="text-foreground">{j.event.replace(/_/g, ' ')}</span>{j.data && Object.keys(j.data).length ? ` ${JSON.stringify(j.data)}` : ''}</li>)}</ol>}
      </Card>
    </div>
  );
}

export default function EstimateCheckTab({ batch }: { batch: string }) {
  const [scope, setScope] = useState<'engaged' | 'all'>('engaged');
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  useEffect(() => {
    let live = true; setRows(null); setErr(null);
    fetch(`/api/campaigns/estimate-audit?batch=${encodeURIComponent(batch)}&scope=${scope}`, { cache: 'no-store' })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Could not load'); if (live) { setRows(j.rows); setSummary(j.summary); } })
      .catch(e => live && setErr((e as Error).message));
    return () => { live = false; };
  }, [batch, scope]);

  if (open) return <DetailView leadId={open} onBack={() => setOpen(null)} />;
  const shown = (rows ?? []).filter(r => (!q || r.address.toLowerCase().includes(q.toLowerCase())) && (!onlyFlagged || r.flags.length > 0));
  const f = summary?.funnel;

  return (
    <div className="space-y-5">
      <Notice tone="blue"><Scale size={15} className="mt-0.5 shrink-0" /><span>This checks every texted homeowner&apos;s estimate three ways: the range in the text we sent, the range the estimate page calculates now, and the property facts we hold. Open a homeowner to see exactly what they saw and to compare it with AirDNA&apos;s independent estimate.</span></Notice>
      {err && <Notice tone="red"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {err}</Notice>}
      {!rows && !err && <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>}

      {summary && f && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Texted" value={f.texted} />
            <Stat label="Opened the link" value={f.opened} sub={`${f.texted ? Math.round((f.opened / f.texted) * 1000) / 10 : 0}% of texted`} />
            <Stat label="Saw the estimate" value={f.viewedEstimate} sub={summary.medianSeconds != null ? `median ${summary.medianSeconds}s on page` : undefined} />
            <Stat label="Started the form" value={f.startedForm} tone={f.viewedEstimate > 0 && f.startedForm === 0 ? 'warn' : undefined} />
            <Stat label="Submitted" value={f.submitted} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Text matches page" value={summary.textChecked ? `${summary.textMatchesPage} of ${summary.textChecked}` : 'None yet'} tone={summary.textChecked === 0 ? undefined : summary.textMismatch === 0 ? 'good' : 'warn'} sub={summary.textChecked === 0 ? 'only counts texts written after the correction' : summary.textMismatch ? `${summary.textMismatch} differ` : 'every range agrees'} />
            <Stat label="Recorded vs today" value={summary.shownMismatch === 0 ? 'All agree' : `${summary.shownMismatch} differ`} tone={summary.shownMismatch === 0 ? 'good' : 'warn'} sub={summary.shownBeforeCorrection ? `${summary.shownBeforeCorrection} seen before the correction not counted` : 'what the page logged when shown'} />
            <Stat label="Built from" value={`${summary.basis.PROPERTY} home details`} sub={`${summary.basis.MARKET} ZIP rent, ${summary.basis.STATE} regional`} />
            <Stat label="Bedrooms assumed" value={summary.assumedBeds} tone={summary.assumedBeds ? 'warn' : 'good'} sub="not on file, page assumes 3" />
          </div>
          {summary.legacyTexts > 0 && <Notice tone="blue"><Scale size={15} className="mt-0.5 shrink-0" /><span>{summary.legacyTexts} of these texts were written before the estimate was corrected on Oct 13, so they quoted about twice what the page shows now. They are left out of the match count above; texts written since then use the same numbers as the page.</span></Notice>}
          {summary.openedWithoutPageEvents > 0 && <Notice tone="amber"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>{summary.openedWithoutPageEvents} homeowners opened the link but the estimate page never reported back. They may have left before it loaded, or their browser blocked tracking. Link scanners that look like people are screened out automatically, so these are likely real.</span></Notice>}
        </>
      )}

      <Card className="p-5">
        <SectionTitle title="Homeowners" right={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-border p-0.5 text-xs">{([['engaged', 'Opened the link'], ['all', 'Everyone texted']] as const).map(([k, l]) => <button key={k} onClick={() => setScope(k)} className={cx('px-3 py-1 rounded-lg', scope === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>{l}</button>)}</div>
            <button onClick={() => setOnlyFlagged(v => !v)} aria-pressed={onlyFlagged} className={cx('px-3 py-1 rounded-xl border text-xs', onlyFlagged ? 'bg-amber-500 border-amber-500 text-white' : 'border-border text-muted-foreground hover:text-foreground')}>Has warnings</button>
            <div className="relative"><Search size={13} className="absolute left-2.5 top-2.5 text-muted-foreground" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search address" className="h-8 w-40 rounded-xl border border-border bg-background pl-7 pr-2 text-xs" /></div>
          </div>} />
        {!rows ? <Skeleton className="h-40" /> : shown.length === 0 ? <p className="text-sm text-muted-foreground">Nothing matches.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-3">Home</th><th className="pr-3">Text said</th><th className="pr-3">Page says</th><th className="pr-3">Built from</th><th className="pr-3">What they did</th><th>Warnings</th></tr></thead>
            <tbody>{shown.slice(0, 200).map(r => (
              <tr key={r.leadId} onClick={() => setOpen(r.leadId)} className="border-t border-border align-top hover:bg-muted/40 cursor-pointer">
                <td className="py-2.5 pr-3 font-medium text-primary max-w-xs truncate">{r.address}</td>
                <td className="pr-3 tabular-nums whitespace-nowrap">{r.sentRange ?? '-'}</td>
                <td className="pr-3 tabular-nums whitespace-nowrap">{r.pageRange ?? '-'} {r.textMatchesPage === false && <AlertTriangle size={12} className="inline text-amber-600" />}</td>
                <td className="pr-3 text-xs text-muted-foreground">{r.basis ? BASIS[r.basis] : '-'}{r.assumedBeds ? ', beds assumed' : ''}</td>
                <td className="pr-3 text-xs">{r.submitted ? <Chip tone="green">Submitted</Chip> : r.viewed ? <Chip tone="blue">Saw estimate{r.timeOnPage ? `, ${r.timeOnPage}s` : ''}</Chip> : r.clicked ? <Chip tone="amber">Opened only</Chip> : <span className="text-muted-foreground">No open</span>}</td>
                <td className="text-xs text-muted-foreground max-w-xs">{r.flags.length ? `${r.flags.length}: ${r.flags[0]}` : ''}</td>
              </tr>))}</tbody></table></div>)}
      </Card>
    </div>
  );
}
