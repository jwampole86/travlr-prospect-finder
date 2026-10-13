'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Download, ExternalLink, Loader2, Newspaper, RefreshCw } from 'lucide-react';
import { Card, Chip, Notice, SectionTitle, Skeleton, cx, fmtDate } from './shared';
import { CONCERNS, COMFORT, HOME_INTERESTS, OP_INTERESTS, PAY, ROLES, SIZES, labelOf } from '@/lib/futureStrOptions';

interface Report {
  readiness: { publicPage: boolean; sendingFlag: boolean; missing: string[]; canSend: boolean };
  totals: { responses: number; homeowner: number; operator: number };
  subscribers: Record<'homeowner' | 'operator', { pending: number; confirmed: number; unsubscribed: number }>;
  homeowner: { comfort: Record<string, number>; concerns: Record<string, number>; interests: Record<string, number> };
  operator: { roles: Record<string, number>; sizes: Record<string, number>; pay: Record<string, number>; concerns: Record<string, number>; interests: Record<string, number> };
  responses: Array<{ id: string; at: string; audience: 'homeowner' | 'operator'; comfort: string | null; concerns: string[]; interests: string[]; role: string | null; size: string | null; pay: string | null; comment: string | null; email: string | null; name: string | null; status: string | null }>;
}

function Bars({ title, data, list, total }: { title: string; data: Record<string, number>; list: ReadonlyArray<{ id: string; label: string }>; total: number }) {
  const rows = list.map(o => [o.label, data[o.id] ?? 0] as const).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</p>
      <div className="space-y-1.5">{rows.map(([label, n]) => (
        <div key={label} className="flex items-center gap-3 text-xs">
          <span className="w-56 sm:w-72 shrink-0 truncate" title={label}>{label}</span>
          <div className="flex-1 h-4 rounded bg-muted overflow-hidden"><div className="h-full bg-primary/70" style={{ width: `${total ? (n / total) * 100 : 0}%` }} /></div>
          <span className="w-16 text-right tabular-nums">{n}{total ? <span className="text-muted-foreground"> ({Math.round((n / total) * 100)}%)</span> : null}</span>
        </div>
      ))}</div>
    </div>
  );
}

export default function FutureStrTab() {
  const [r, setR] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [aud, setAud] = useState<'all' | 'homeowner' | 'operator'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/campaigns/future-str', { cache: 'no-store' }); const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Could not load'); setR(j); setError(null);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rd = r?.readiness;
  const shown = (r?.responses ?? []).filter(x => aud === 'all' || x.audience === aud);
  const interviews = (r?.responses ?? []).filter(x => x.interests.some(i => ['interview', 'design_partner', 'pilot_property'].includes(i)));

  return (
    <div className="space-y-6">
      <Notice tone="blue"><Newspaper size={15} className="mt-0.5 shrink-0" /> <span><b>The Future of Property Turnovers</b> is a VAYO-only research newsletter. It is prepared but dormant: nothing is emailed, and the public survey page stays hidden, until you switch them on. Homeowner interest shows whether people accept new technology in a property. It does not show whether managers will buy turnover software; that needs separate conversations.</span></Notice>
      {error && <Notice tone="red"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}</Notice>}
      {loading && !r && <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>}

      {r && rd && (
        <>
          <Card className="p-5">
            <SectionTitle title="Readiness" right={<button onClick={load} className="h-8 inline-flex items-center gap-1.5 px-3 rounded-xl border border-border text-xs hover:bg-muted">{loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh</button>} />
            <div className="flex flex-wrap gap-2 mb-3">
              <Chip tone={rd.publicPage ? 'green' : 'muted'}>Public survey page: {rd.publicPage ? 'on' : 'off (hidden)'}</Chip>
              <Chip tone={rd.sendingFlag ? 'amber' : 'muted'}>Sending: {rd.sendingFlag ? 'switched on' : 'off'}</Chip>
              <Chip tone={rd.missing.length ? 'amber' : 'green'}>{rd.missing.length ? `${rd.missing.length} setting${rd.missing.length === 1 ? '' : 's'} still needed` : 'All sending settings present'}</Chip>
            </div>
            {rd.missing.length > 0 && <p className="text-xs text-muted-foreground mb-3">Needed before any email can go out: {rd.missing.join(', ')}. Also set FUTURE_STR_ENABLED=true to show the survey page and FUTURE_STR_SENDING_ENABLED=true to allow sending.</p>}
            <div className="flex flex-wrap gap-2">
              {(['homeowner', 'operator'] as const).map(a => (
                <a key={a} href={`/api/campaigns/future-str?preview=${a}`} target="_blank" rel="noreferrer" className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl border border-border bg-card text-sm hover:bg-muted"><ExternalLink size={14} /> Preview Issue 1 ({a === 'homeowner' ? 'homeowners' : 'managers and cleaners'})</a>
              ))}
              <a href="/api/campaigns/future-str?format=csv" className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl border border-border bg-card text-sm hover:bg-muted"><Download size={14} /> Export answers (CSV)</a>
            </div>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[['Survey answers', r.totals.responses, `${r.totals.homeowner} homeowners, ${r.totals.operator} managers and cleaners`],
              ['Homeowner list', r.subscribers.homeowner.confirmed, `${r.subscribers.homeowner.pending} waiting to confirm`],
              ['Manager and cleaner list', r.subscribers.operator.confirmed, `${r.subscribers.operator.pending} waiting to confirm`],
              ['Open to a conversation', interviews.length, 'interview, design partner or pilot']].map(([label, v, sub]) => (
              <div key={String(label)} className="rounded-2xl border border-border bg-card p-4"><span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span><p className="mt-2 text-2xl font-bold tabular-nums">{v}</p><p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p></div>
            ))}
          </div>

          <Card className="p-5 space-y-6">
            <SectionTitle title="Homeowners: comfort and concerns" hint="Whether trust, safety and privacy are barriers. Small numbers swing a lot." />
            {r.totals.homeowner === 0 ? <p className="text-sm text-muted-foreground">No homeowner answers yet.</p> : (
              <>
                <Bars title="Comfortable with a supervised robot assisting?" data={r.homeowner.comfort} list={COMFORT} total={r.totals.homeowner} />
                <Bars title="Concerns to address first" data={r.homeowner.concerns} list={CONCERNS} total={r.totals.homeowner} />
                <Bars title="Staying involved" data={r.homeowner.interests} list={HOME_INTERESTS} total={r.totals.homeowner} />
              </>
            )}
          </Card>

          <Card className="p-5 space-y-6">
            <SectionTitle title="Managers and cleaning companies" hint="Stated willingness to pay is a weak signal. Treat it as a reason to have the conversation, not as demand." />
            {r.totals.operator === 0 ? <p className="text-sm text-muted-foreground">No manager or cleaner answers yet.</p> : (
              <>
                <Bars title="Who answered" data={r.operator.roles} list={ROLES} total={r.totals.operator} />
                <Bars title="Portfolio size" data={r.operator.sizes} list={SIZES} total={r.totals.operator} />
                <Bars title="Would pay for scheduling, checklists and inspection photos?" data={r.operator.pay} list={PAY} total={r.totals.operator} />
                <Bars title="Concerns about robotic assistance" data={r.operator.concerns} list={CONCERNS} total={r.totals.operator} />
                <Bars title="Staying involved" data={r.operator.interests} list={OP_INTERESTS} total={r.totals.operator} />
              </>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="p-5 pb-3"><SectionTitle title="Every answer" right={<div className="inline-flex gap-1 text-xs">{(['all', 'homeowner', 'operator'] as const).map(a => <button key={a} onClick={() => setAud(a)} className={cx('px-2.5 py-1 rounded-lg border', aud === a ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')}>{a === 'all' ? 'All' : a === 'homeowner' ? 'Homeowners' : 'Managers and cleaners'}</button>)}</div>} /></div>
            {shown.length === 0 ? <p className="px-5 pb-6 text-sm text-muted-foreground">No answers yet. They appear here once the survey page is switched on and people respond.</p> : (
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40"><th className="py-2 pl-5 pr-3">When</th><th className="pr-3">Who</th><th className="pr-3">Answers</th><th className="pr-5">Contact</th></tr></thead>
                <tbody>{shown.map(x => (
                  <tr key={x.id} className="border-t border-border align-top">
                    <td className="py-2.5 pl-5 pr-3 whitespace-nowrap text-xs text-muted-foreground">{fmtDate(x.at)}</td>
                    <td className="pr-3"><Chip tone={x.audience === 'homeowner' ? 'blue' : 'primary'}>{x.audience === 'homeowner' ? 'Homeowner' : labelOf(ROLES, x.role) || 'Manager or cleaner'}</Chip>{x.size && <p className="text-[11px] text-muted-foreground mt-1">{labelOf(SIZES, x.size)}</p>}</td>
                    <td className="pr-3 text-xs max-w-md">{x.comfort && <p><b>Comfort:</b> {labelOf(COMFORT, x.comfort)}</p>}{x.pay && <p><b>Would pay:</b> {labelOf(PAY, x.pay)}</p>}{x.concerns.length > 0 && <p><b>Concerns:</b> {x.concerns.map(c => labelOf(CONCERNS, c)).join('; ')}</p>}{x.interests.length > 0 && <p><b>Interested in:</b> {x.interests.join(', ').replace(/_/g, ' ')}</p>}{x.comment && <p className="text-muted-foreground mt-1">&ldquo;{x.comment}&rdquo;</p>}</td>
                    <td className="pr-5 text-xs">{x.email ? <><p>{x.name ?? ''}</p><p className="text-muted-foreground">{x.email}</p><p className="text-[11px] text-muted-foreground">{x.status}</p></> : <span className="text-muted-foreground">Anonymous</span>}</td>
                  </tr>))}</tbody></table></div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
