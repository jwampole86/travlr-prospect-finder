'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card } from '@/app/campaigns/shared';
import { CHANNEL_FEE, channelFee, type FeeLine, type PartnerSummary } from '@/lib/stays/channelFee';
import { AIRBNB_COMPARISON, PARTNER_EXAMPLE, PARTNER_ONE_LINER, PARTNER_TERMS, PARTNER_TRACKING_STEPS } from '@/lib/stays/partnerContent';
import { api, inputCls, money, primaryBtnCls } from './ui';

type Home = { id: string; title: string; city: string | null; state: string | null; status: string; channel_partner: string | null; channel_live_date: string | null };
type Report = { month: string; homes: Home[]; partners: PartnerSummary[]; lines: FeeLine[] };

const cents = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function HomeRow({ home, onSaved }: { home: Home; onSaved: () => void }) {
  const [partner, setPartner] = useState(home.channel_partner ?? '');
  const [live, setLive] = useState(home.channel_live_date ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = partner.trim() !== (home.channel_partner ?? '') || live !== (home.channel_live_date ?? '');
  async function save() {
    setBusy(true); setError(null);
    try { await api(`/api/seller/channel-fees/listings/${home.id}`, { method: 'PATCH', body: { channel_partner: partner, channel_live_date: live } }); onSaved(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="grid gap-2 border-t border-border py-3 md:grid-cols-[1.2fr_1fr_160px_auto] md:items-center">
      <div><p className="text-sm font-medium">{home.title}</p><p className="text-xs text-muted-foreground">{[home.city, home.state].filter(Boolean).join(', ')} · {home.status}</p></div>
      <input className={inputCls} value={partner} onChange={(e) => setPartner(e.target.value)} placeholder="Partner (blank if not a partner home)" aria-label={`Partner for ${home.title}`} />
      <input className={inputCls} type="date" value={live} onChange={(e) => setLive(e.target.value)} aria-label={`Live date for ${home.title}`} />
      <div className="flex items-center gap-2">
        <button className={primaryBtnCls} disabled={!dirty || busy} onClick={save}>{busy ? <Loader2 size={14} className="animate-spin" /> : 'Save'}</button>
        {error && <span className="text-xs text-red-600" role="alert">{error}</span>}
      </div>
    </div>
  );
}

/** Co-listing manager terms, the monthly channel fee on NAVEO bookings, which homes belong to which partner, and the Airbnb comparison for outreach. */
export default function ChannelPartnersTab() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const load = useCallback(async () => {
    try { setReport(await api<Report>(`/api/seller/channel-fees?month=${month}`)); setError(null); } catch (e) { setError((e as Error).message); }
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const ex = PARTNER_EXAMPLE.total;
  const after = channelFee({ bookedOn: '2099-01-01', liveDate: '2000-01-01', total: ex, partnerHomes: 1 });

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">Co-listing terms for managers</h2>
        <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground space-y-1 max-w-3xl">{PARTNER_TERMS.map((t) => <li key={t}>{t}</li>)}</ul>
        <p className="mt-3 text-xs text-muted-foreground max-w-3xl">
          Example: a {PARTNER_EXAMPLE.nights}-night stay books on NAVEO for {money(ex)}. In the first {CHANNEL_FEE.freeDays} days the manager keeps {money(ex)}; after that NAVEO keeps {money(after.fee)} and the manager keeps {money(after.net)}.
        </p>
        <p className="mt-3 text-sm font-medium">How bookings are tracked</p>
        <ol className="mt-1 list-decimal pl-5 text-xs text-muted-foreground space-y-1 max-w-3xl">{PARTNER_TRACKING_STEPS.map((t) => <li key={t}>{t}</li>)}</ol>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold">Channel fees by month</h2>
          <input type="month" className={`${inputCls} !w-40`} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="Month" />
        </div>
        <p className="mt-1 text-xs text-muted-foreground max-w-3xl">Bookings made on NAVEO Stays that month for partner homes, excluding cancelled ones. A partner with no live date recorded is not charged.</p>
        <div className="mt-3 overflow-x-auto">
          {report === null ? <Loader2 className="animate-spin" size={16} /> : report.partners.length === 0 ? <p className="text-sm text-muted-foreground">No NAVEO bookings on partner homes this month.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 pr-3">Partner</th><th className="pr-3">Live homes</th><th className="pr-3">NAVEO bookings</th><th className="pr-3">In 0% period</th><th className="pr-3">Booked total</th><th>Channel fee</th></tr></thead>
              <tbody>{report.partners.map((p) => <tr key={p.partner} className="border-t border-border"><td className="py-1.5 pr-3 font-medium">{p.partner}</td><td className="pr-3">{p.homes}</td><td className="pr-3">{p.bookings}</td><td className="pr-3">{p.introBookings}</td><td className="pr-3">{cents(p.total)}</td><td className="font-medium">{cents(p.fee)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
        {report && report.lines.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium">Every booking ({report.lines.length})</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3">Reference</th><th className="pr-3">Partner</th><th className="pr-3">Home</th><th className="pr-3">Stay</th><th className="pr-3">Total</th><th className="pr-3">Rate</th><th>Fee</th></tr></thead>
                <tbody>{report.lines.map((l) => <tr key={l.reference} className="border-t border-border"><td className="py-1 pr-3">{l.reference}</td><td className="pr-3">{l.partner}</td><td className="pr-3">{l.title}</td><td className="pr-3">{l.check_in} → {l.check_out}</td><td className="pr-3">{cents(l.total)}</td><td className="pr-3">{l.intro ? '0% (intro)' : `${Math.round(l.rate * 100)}%`}</td><td>{cents(l.fee)}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Partner homes</h2>
        <p className="mt-1 text-xs text-muted-foreground max-w-3xl">Name the managing company and the day its homes went live. The 0% period runs {CHANNEL_FEE.freeDays} days from that date. Leave the partner blank for homes that are not co-listed.</p>
        <div className="mt-3">
          {report === null ? <Loader2 className="animate-spin" size={16} /> : report.homes.length === 0 ? <p className="text-sm text-muted-foreground">No NAVEO Stays homes yet.</p> : report.homes.map((h) => <HomeRow key={`${h.id}-${h.channel_partner}-${h.channel_live_date}`} home={h} onSaved={load} />)}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">NAVEO Stays vs Airbnb</h2>
        <p className="mt-1 text-xs text-muted-foreground">Confirm Airbnb&apos;s current fees before using this outside the company.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 pr-3">Area</th><th className="pr-3">Airbnb</th><th>NAVEO Stays</th></tr></thead>
            <tbody>{AIRBNB_COMPARISON.map(([a, b, c]) => <tr key={a} className="border-t border-border align-top"><td className="py-1.5 pr-3 font-medium">{a}</td><td className="pr-3">{b}</td><td>{c}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted-foreground max-w-2xl">{PARTNER_ONE_LINER}</p>
          <button className="h-8 rounded-lg border border-border px-3 text-xs hover:bg-muted" onClick={async () => { try { await navigator.clipboard.writeText(PARTNER_ONE_LINER); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ } }}>{copied ? 'Copied' : 'Copy one-liner'}</button>
        </div>
      </Card>
    </div>
  );
}
