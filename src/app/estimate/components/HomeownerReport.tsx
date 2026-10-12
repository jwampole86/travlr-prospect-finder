'use client';

import React from 'react';
import {
  Shield, ShieldCheck, ShieldAlert, Home, MessageSquare, Sparkles, CalendarCheck, SprayCan, Camera, Headphones,
  FileCheck2, BarChart3, Wallet, CheckCircle2, XCircle, Info, ExternalLink, Printer, Phone, ArrowRight, MapPin,
} from 'lucide-react';
import type { HomeownerReport, RegulationTone } from '@/lib/homeownerEstimateTypes';
import { CONTACT_EMAIL, CONTACT_PHONE, WEBSITE_URL, WEBSITE_LABEL, telHref } from '@/lib/homeownerContact';
import type { EquipmentKey } from '@/lib/homeownerReportContent';
import { PermitsSection, SafetySection, OwnerDashboardSection } from './ReportSections';
import TrustCard from './TrustCard';

// The report is a document: it keeps a fixed light palette so it reads the same on screen, in a saved PDF and in print.

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const compact = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M` : n >= 10_000 ? `$${Math.round(n / 1000)}K` : usd(n));
const dateLabel = (iso: string | null) => {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); } catch { return null; }
};

const TONE: Record<RegulationTone, { chip: string; panel: string; icon: React.ReactNode; label: string }> = {
  good: { chip: 'bg-emerald-100 text-emerald-800 border-emerald-200', panel: 'border-emerald-200 bg-emerald-50/60', icon: <ShieldCheck size={20} className="text-emerald-600" />, label: 'Favorable' },
  caution: { chip: 'bg-amber-100 text-amber-800 border-amber-200', panel: 'border-amber-200 bg-amber-50/60', icon: <ShieldAlert size={20} className="text-amber-600" />, label: 'Rules apply' },
  bad: { chip: 'bg-rose-100 text-rose-800 border-rose-200', panel: 'border-rose-200 bg-rose-50/60', icon: <ShieldAlert size={20} className="text-rose-600" />, label: 'Restricted' },
  unknown: { chip: 'bg-slate-100 text-slate-700 border-slate-200', panel: 'border-slate-200 bg-slate-50', icon: <Shield size={20} className="text-slate-500" />, label: 'Being confirmed' },
};

function SectionTitle({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mb-5 break-inside-avoid break-after-avoid">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-600">{eyebrow}</p>
      <h2 className="mt-1 text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{title}</h2>
      {sub && <p className="mt-1.5 text-sm text-slate-500 leading-relaxed max-w-2xl">{sub}</p>}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white/10 border border-white/15 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-indigo-100/80">{label}</p>
      <p className="mt-0.5 text-xl font-bold text-white">{value}</p>
      {sub && <p className="text-[11px] text-indigo-100/70">{sub}</p>}
    </div>
  );
}

const SERVICES = [
  { icon: <BarChart3 size={18} />, title: 'Dynamic pricing', body: 'Nightly rates adjust to demand, events and seasons, so you are not leaving money on the table in peak weeks.' },
  { icon: <Camera size={18} />, title: 'Listing creation & photography', body: 'We build and optimize your listing across the major booking platforms so your home stands out.' },
  { icon: <CalendarCheck size={18} />, title: 'Booking & guest screening', body: 'We manage inquiries, reservations and guest vetting, and handle house rules and damage protection.' },
  { icon: <SprayCan size={18} />, title: 'Cleaning & turnover', body: 'Professional turnovers between stays, inspected and restocked, so every guest arrives to a spotless home.' },
  { icon: <Headphones size={18} />, title: 'Guest support', body: 'We answer guests and neighbors so you do not take the calls, with a clear path for anything urgent.' },
  { icon: <FileCheck2 size={18} />, title: 'Permits, taxes & compliance', body: 'We walk you through the local permit, license and lodging-tax steps and keep your listing compliant.' },
  { icon: <Wallet size={18} />, title: 'Owner statements & payouts', body: 'Clear monthly statements showing every booking, fee and payout. You always see where the money goes.' },
  { icon: <Home size={18} />, title: 'Home care', body: 'Maintenance coordination and regular inspections protect your property and its value between stays.' },
];

const STEPS = [
  { n: 1, title: 'Walkthrough & review', body: 'A short call or visit to confirm your home\u2019s details and refine this estimate.' },
  { n: 2, title: 'Permits & setup', body: 'We guide the local permit and tax registration, then prepare, furnish-check and photograph the home.' },
  { n: 3, title: 'Go live', body: 'Your listing launches with optimized pricing, and bookings start coming in.' },
  { n: 4, title: 'Earn & monitor', body: 'We run day-to-day operations. You get monthly statements and an easy line to your manager.' },
];

export default function HomeownerReportView({
  report, variant = 'full', onPrint, onContact, equipment = null,
}: { report: HomeownerReport; variant?: 'preview' | 'full'; onPrint?: () => void; onContact?: (mode: 'call' | 'question') => void; equipment?: EquipmentKey[] | null }) {
  const [cons, exp, opt] = report.scenarios;
  const reg = report.regulation;
  const tone = TONE[reg.tone];
  const place = [report.city, report.state].filter(Boolean).join(', ');
  const verified = dateLabel(reg.lastVerified);
  const additionalItems = (reg.additional ?? '').split(/\s*\b\d{1,2}\)\s+/).map(x => x.trim()).filter(Boolean);
  const maxYear = Math.max(...report.fiveYear.map(y => Math.max(y.net, y.longTerm)));
  const gross = exp.grossMonthly;
  const winPct = report.longTermRent > 0 ? Math.round((exp.netMonthly / report.longTermRent - 1) * 100) : 0;

  return (
    <>
    <style>{`@media print { @page { size: letter portrait; margin: 10mm; } html, body { background: #fff !important; } .report-doc, .report-doc * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } .report-doc { width: 100% !important; max-width: none !important; } .report-doc h2 { break-after: avoid; page-break-after: avoid; } .report-doc li { break-inside: avoid; page-break-inside: avoid; } }`}</style>
    <article className="report-doc bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:border-0 print:rounded-none">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="relative bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-800 text-white px-6 sm:px-10 pt-8 pb-9">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center"><Home size={18} /></span>
            <div>
              <p className="text-sm font-bold leading-none">TRAVLR Vacation Homes</p>
              <p className="text-[11px] text-indigo-200/80 mt-1">Property Revenue Report &middot; <a href={WEBSITE_URL} target="_blank" rel="noopener noreferrer" className="underline decoration-indigo-300/60 underline-offset-2 hover:text-white">{WEBSITE_LABEL}</a></p>
            </div>
          </div>
          <p className="text-[11px] text-indigo-200/80 text-right">Prepared {dateLabel(report.generatedAt)}</p>
        </div>

        <div className="mt-8 flex items-start gap-2 text-indigo-100/90 text-sm">
          <MapPin size={15} className="mt-0.5 shrink-0" />
          <p className="font-medium">{report.street}{place ? `, ${place}` : ''}{report.zip ? ` ${report.zip}` : ''}</p>
        </div>
        <p className="mt-5 text-sm text-indigo-100/90">Your home could earn an estimated</p>
        <p className="mt-1 text-4xl sm:text-6xl font-extrabold tracking-tight">{usd(exp.annualNet)}<span className="text-xl sm:text-2xl font-semibold text-indigo-200"> / year</span></p>
        <p className="mt-2 text-sm text-indigo-100/90">
          Net to you after all operating costs. Realistic range <strong className="text-white">{compact(cons.annualNet)} to {compact(opt.annualNet)}</strong> a year.
        </p>
        <div className="mt-7 grid grid-cols-2 lg:grid-cols-4 print:grid-cols-4 gap-3">
          <Stat label="Net per month" value={usd(exp.netMonthly)} sub="to you" />
          <Stat label="Gross bookings" value={usd(exp.grossMonthly)} sub="per month" />
          <Stat label="Nightly rate" value={usd(exp.adr)} sub="average (ADR)" />
          <Stat label="Occupancy" value={`${exp.occupancy}%`} sub="nights booked" />
        </div>
        <p className="mt-5 text-[11px] text-indigo-200/80">{report.basisLabel}.</p>
      </header>

      <div className="px-6 sm:px-10 py-9 space-y-12">
        {/* ── Scenarios ───────────────────────────────────────── */}
        <section className="break-inside-avoid">
          <SectionTitle eyebrow="Revenue outlook" title="Three ways the year could go" sub="Occupancy and nightly rates move with the season, local events and how well a listing is managed. We plan around the expected case." />
          <div className="grid sm:grid-cols-3 print:grid-cols-3 gap-4">
            {report.scenarios.map(s => {
              const featured = s.key === 'expected';
              return (
                <div key={s.key} className={`rounded-2xl p-5 border ${featured ? 'border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-200' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-center justify-between">
                    <p className={`text-xs font-bold uppercase tracking-wider ${featured ? 'text-indigo-700' : 'text-slate-500'}`}>{s.label}</p>
                    {featured && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-600 text-white">Most likely</span>}
                  </div>
                  <p className="mt-3 text-3xl font-extrabold tracking-tight">{usd(s.annualNet)}</p>
                  <p className="text-xs text-slate-500">net per year</p>
                  <dl className="mt-4 space-y-1.5 text-sm">
                    <div className="flex justify-between"><dt className="text-slate-500">Net per month</dt><dd className="font-semibold">{usd(s.netMonthly)}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Nightly rate</dt><dd className="font-semibold">{usd(s.adr)}</dd></div>
                    <div className="flex justify-between"><dt className="text-slate-500">Occupancy</dt><dd className="font-semibold">{s.occupancy}%</dd></div>
                  </dl>
                </div>
              );
            })}
          </div>
        </section>

        {variant === 'full' && (
          <>
            {/* ── Where the money goes ─────────────────────────── */}
            <section className="break-inside-avoid">
              <SectionTitle eyebrow="Transparent economics" title="Where each month&rsquo;s revenue goes" sub={`On an expected ${usd(gross)} of monthly bookings, this is how revenue turns into the ${usd(exp.netMonthly)} you keep.`} />
              <div className="flex h-11 rounded-xl overflow-hidden border border-slate-200 text-[11px] font-semibold text-white">
                <div className="bg-emerald-600 flex items-center justify-center" style={{ width: '65%' }}>You keep 65%</div>
                {report.costs.map((c, i) => (
                  <div key={c.label} className={['bg-indigo-700', 'bg-indigo-500', 'bg-slate-500', 'bg-slate-400'][i] ?? 'bg-slate-400'} style={{ width: `${c.pct}%` }} title={`${c.label} ${c.pct}%`} />
                ))}
              </div>
              <ul className="mt-4 grid sm:grid-cols-2 print:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <li className="flex justify-between border-b border-slate-100 pb-2"><span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />Owner net income</span><strong>{usd(exp.netMonthly)}</strong></li>
                {report.costs.map((c, i) => (
                  <li key={c.label} className="flex justify-between border-b border-slate-100 pb-2">
                    <span className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${['bg-indigo-700', 'bg-indigo-500', 'bg-slate-500', 'bg-slate-400'][i] ?? 'bg-slate-400'}`} />{c.label} ({c.pct}%)</span>
                    <span className="text-slate-600">{usd(c.monthly)}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* ── Short-term vs long-term ──────────────────────── */}
            <section className="break-inside-avoid">
              <SectionTitle eyebrow="The advantage" title="Vacation rental vs. a traditional lease" sub="The same home, two strategies. Both figures are net of operating costs and use the same growth assumption (3% a year)." />
              <div className="grid lg:grid-cols-2 print:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-slate-200 p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Per month</p>
                  <div className="mt-4 space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1.5"><span className="font-medium">Vacation rental with TRAVLR</span><strong className="text-emerald-700">{usd(exp.netMonthly)}</strong></div>
                      <div className="h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-emerald-600" style={{ width: '100%' }} /></div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1.5"><span className="font-medium">Typical long-term lease</span><strong className="text-slate-700">{usd(report.longTermRent)}</strong></div>
                      <div className="h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-slate-400" style={{ width: `${Math.max(6, Math.round((report.longTermRent / Math.max(exp.netMonthly, 1)) * 100))}%` }} /></div>
                    </div>
                  </div>
                  <div className="mt-5 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                    <p className="text-sm text-emerald-900">
                      {report.advantageMonthly > 0
                        ? <>About <strong>{usd(report.advantageMonthly)} more per month</strong> ({winPct}% more) than a standard lease, or <strong>{usd(report.advantageAnnual)} a year</strong>.</>
                        : <>Comparable to a standard lease, with far more flexibility: you can still use the home yourself.</>}
                    </p>
                  </div>
                  <p className="mt-3 text-[11px] text-slate-500">Lease figure is an estimate of market rent for a home like yours.</p>
                </div>

                <div className="rounded-2xl border border-slate-200 p-5">
                  <div className="flex items-baseline justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Five-year view</p>
                    <p className="text-xs text-slate-500">Cumulative net: <strong className="text-emerald-700">{compact(report.fiveYearTotal)}</strong> vs {compact(report.fiveYearLongTermTotal)}</p>
                  </div>
                  <div className="mt-5 flex items-end justify-between gap-3 h-40">
                    {report.fiveYear.map(y => (
                      <div key={y.year} className="flex-1 flex flex-col items-center justify-end h-full">
                        <div className="w-full flex items-end justify-center gap-1 h-full">
                          <div className="w-1/2 rounded-t-md bg-emerald-600" style={{ height: `${Math.max(6, (y.net / maxYear) * 100)}%` }} title={`Year ${y.year} vacation rental ${usd(y.net)}`} />
                          <div className="w-1/2 rounded-t-md bg-slate-300" style={{ height: `${Math.max(6, (y.longTerm / maxYear) * 100)}%` }} title={`Year ${y.year} lease ${usd(y.longTerm)}`} />
                        </div>
                        <span className="mt-2 text-[11px] text-slate-500">Year {y.year}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-600" />Vacation rental</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-300" />Long-term lease</span>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Why partner ──────────────────────────────────── */}
            <section className="break-inside-avoid">
              <SectionTitle eyebrow="Why partner with TRAVLR" title="Hands-off for you. Fully managed by us." sub="You own a valuable asset. We turn it into a well-run vacation rental business, and handle the work that makes it profitable." />
              <div className="grid sm:grid-cols-2 print:grid-cols-2 gap-4">
                {SERVICES.map(s => (
                  <div key={s.title} className="break-inside-avoid flex gap-3.5 rounded-xl border border-slate-200 p-4">
                    <span className="w-9 h-9 shrink-0 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">{s.icon}</span>
                    <div>
                      <p className="text-sm font-semibold">{s.title}</p>
                      <p className="mt-0.5 text-[13px] text-slate-600 leading-relaxed">{s.body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 px-5 py-4 flex items-start gap-3">
                <Sparkles size={18} className="text-indigo-600 mt-0.5 shrink-0" />
                <p className="text-sm text-slate-600 leading-relaxed"><strong className="text-slate-900">Your interests and ours line up.</strong> Our fee is a share of what your home earns, so we only do well when you do. You stay in control of your home and can block dates for your own stays.</p>
              </div>
            </section>

            <OwnerDashboardSection />
          </>
        )}

        {/* ── Regulations ─────────────────────────────────────── */}
        <section>
          <SectionTitle eyebrow="Rules & permits" title={`Short-term rental rules${place ? ` in ${place}` : ' for your area'}`} sub="What your city or county requires before you can host, so there are no surprises." />
          <div className={`rounded-2xl border p-5 ${tone.panel}`}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5">{tone.icon}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-bold text-slate-900">{reg.headline}</p>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${tone.chip}`}>{tone.label}</span>
                </div>
                {reg.summary && <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{reg.summary}</p>}
                {reg.note && <p className="mt-2 text-[13px] text-slate-600 leading-relaxed border-l-2 border-slate-300 pl-3">{reg.note}</p>}
              </div>
            </div>
          </div>

          {reg.requirements.length > 0 && (
            <div className="mt-4 rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500">Requirements for {reg.jurisdiction}</div>
              <ul className="divide-y divide-slate-100">
                {reg.requirements.map(r => (
                  <li key={r.label} className="px-5 py-3 flex items-start gap-3 text-sm">
                    <span className="mt-0.5 shrink-0">
                      {r.required === true ? <CheckCircle2 size={16} className="text-indigo-600" /> : r.required === false ? <XCircle size={16} className="text-slate-400" /> : <Info size={16} className="text-slate-500" />}
                    </span>
                    <span className="w-28 sm:w-40 shrink-0 font-medium text-slate-800">{r.label}</span>
                    <span className={`min-w-0 break-words ${r.required === false ? 'text-slate-500' : 'text-slate-600'}`}>{r.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(reg.taxes || reg.additional) && (
            <div className="mt-4 grid sm:grid-cols-2 print:grid-cols-2 gap-4">
              {reg.taxes && (
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Taxes</p>
                  <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{reg.taxes}</p>
                </div>
              )}
              {reg.additional && (
                <div className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Also worth knowing</p>
                  {additionalItems.length > 1 ? (
                    <ul className="mt-2 space-y-1.5">
                      {additionalItems.map(item => (
                        <li key={item} className="flex gap-2 text-[13px] text-slate-600 leading-relaxed"><span className="mt-2 w-1 h-1 rounded-full bg-indigo-400 shrink-0" />{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{reg.additional}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {!reg.found && (
            <div className="mt-4 rounded-2xl border border-slate-200 p-5">
              <p className="text-sm font-semibold text-slate-900">What almost every market asks for</p>
              <ul className="mt-3 space-y-2">
                {reg.typicalChecklist.map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-slate-600"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-indigo-500" />{item}</li>
                ))}
              </ul>
            </div>
          )}

          {variant === 'full' && reg.found && (
            <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
              Compiled from public sources{reg.sourceName ? `, including ${reg.sourceName}` : ''}{verified ? `, last checked ${verified}` : ''}. Rules change, so your TRAVLR specialist confirms the current requirements for your exact address before anything is listed.{' '}
              {reg.sourceUrl && <a href={reg.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline inline-flex items-center gap-0.5">View the official source <ExternalLink size={10} /></a>}
            </p>
          )}
        </section>

        {variant === 'full' && (
          <>
            <PermitsSection report={report} />
            <SafetySection report={report} equipment={equipment} />

            {/* ── Next steps ─────────────────────────────────── */}
            <section className="break-inside-avoid">
              <SectionTitle eyebrow="Getting started" title="From estimate to first booking" />
              <ol className="grid sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4 gap-4">
                {STEPS.map(s => (
                  <li key={s.n} className="rounded-xl border border-slate-200 p-4">
                    <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">{s.n}</span>
                    <p className="mt-3 text-sm font-semibold">{s.title}</p>
                    <p className="mt-1 text-[13px] text-slate-600 leading-relaxed">{s.body}</p>
                  </li>
                ))}
              </ol>
            </section>

            <TrustCard />

            {/* ── CTA ─────────────────────────────────────────── */}
            <section className="break-inside-avoid rounded-2xl bg-gradient-to-br from-indigo-700 to-indigo-900 text-white px-6 sm:px-8 py-7">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                <div>
                  <p className="text-lg font-bold">Ready to see what your home can really earn?</p>
                  <p className="mt-1 text-sm text-indigo-100/90 max-w-lg">A TRAVLR specialist will contact you within one business day to refine these numbers with your home&rsquo;s details. No obligation.</p>
                </div>
                <div className="flex flex-col gap-2.5 shrink-0 text-sm">
                  {onContact && (
                    <>
                      <button onClick={() => onContact('call')} className="print:hidden inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-indigo-800 font-bold hover:bg-indigo-50 transition">
                        <CalendarCheck size={16} /> Schedule a call
                      </button>
                      <button onClick={() => onContact('question')} className="print:hidden inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-white/40 text-white font-semibold hover:bg-white/10 transition">
                        <MessageSquare size={16} /> Ask a question
                      </button>
                    </>
                  )}
                  <div className="flex flex-col gap-1.5 text-indigo-100/90">
                    <span className="inline-flex items-center gap-2 font-semibold text-white">Contact TRAVLR</span>
                    <a href={WEBSITE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:underline"><ExternalLink size={14} /> {WEBSITE_LABEL} (our official website)</a>
                    <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex items-center gap-2 hover:underline"><ArrowRight size={14} /> {CONTACT_EMAIL}</a>
                    {CONTACT_PHONE && <a href={telHref(CONTACT_PHONE)} className="inline-flex items-center gap-2 hover:underline"><Phone size={14} /> {CONTACT_PHONE}</a>}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        <footer className="text-[11px] leading-relaxed text-slate-500 border-t border-slate-100 pt-5">
          <p>
            This report is an estimate for planning purposes, not a guarantee of income. Projections are based on typical performance for homes like yours and local market data and will vary with seasonality, pricing, regulations, property condition and guest demand. Regulatory information is a summary of public sources and is not legal advice; please confirm requirements with your local authority. TRAVLR Vacation Homes is not responsible for decisions made solely on this estimate.
          </p>
          {onPrint && variant === 'full' && (
            <button onClick={onPrint} className="print:hidden mt-4 inline-flex items-center gap-2 text-xs font-semibold text-indigo-600 hover:underline"><Printer size={13} /> Print this report</button>
          )}
        </footer>
      </div>
      {onContact && variant === 'full' && (
        <div className="print:hidden fixed bottom-4 left-4 right-20 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 z-40 sm:w-72">
          <div className="p-2 rounded-2xl bg-slate-900/95 backdrop-blur shadow-2xl border border-white/10">
            <button onClick={() => onContact('call')} className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-bold transition">
              <CalendarCheck size={16} /> Schedule a call
            </button>
          </div>
        </div>
      )}
    </article>
    </>
  );
}
