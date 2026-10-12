'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BadgeCheck, Camera, CheckCircle2, ChevronDown, ClipboardCheck, Handshake, Home, LineChart, Loader2, MessageSquare, Rocket, Search, Sparkles, Star, TrendingUp, Wrench } from 'lucide-react';
import type { OfferData } from '@/lib/services/cohostOffer';
import TrustCard from '@/app/estimate/components/TrustCard';
import { CONTACT_EMAIL, CONTACT_PHONE, telHref } from '@/lib/homeownerContact';

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const compact = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : usd(n));

type ScenarioKey = 'conservative' | 'expected' | 'stretch';
type Service = 'co_host_only' | 'co_host_and_manager';

const SERVICES: Record<Service, { title: string; tag: string; blurb: string; we: string[]; you: string[] }> = {
  co_host_only: {
    title: 'Co-Host', tag: 'Keep running the home, let us lift the results',
    blurb: 'We work inside the listing you already have. You stay the owner and keep your on-site team.',
    we: ['Pricing, minimum stays and calendar strategy that follow demand', 'Listing rewrite, photo direction and amenity positioning', 'Reach across the major booking channels', 'Review and reputation management', 'Guest messaging support when you want it', 'A plain-English performance report each month'],
    you: ['Own the listing, the calendar and your payouts', 'Keep your cleaner, handyman and check-in routine', 'Approve changes before they go live'],
  },
  co_host_and_manager: {
    title: 'Co-Host + Manager', tag: 'Everything above, and we run the home day to day',
    blurb: 'Hands-off ownership with the same listing, run to the standard of our own luxury homes.',
    we: ['Everything in Co-Host', 'Guest screening, check-in and 24/7 guest support', 'Cleaning, turnover, linens and restocking', 'Maintenance coordination and trusted local vendors', 'Guidance on permits, lodging tax and local rules', 'Owner statements and a single point of contact'],
    you: ['Own the home and the listing', 'Review results and approve major spend', 'Stay as involved as you like'],
  },
};

const STEPS = [
  { icon: Search, title: 'Free listing audit', text: 'A short call. We review your listing, calendar, pricing and photos. No cost, no obligation.' },
  { icon: ClipboardCheck, title: 'A written plan', text: 'You get specific fixes, an earnings picture and our recommendation: Co-Host or Co-Host + Manager.' },
  { icon: Rocket, title: 'We get to work', text: 'You keep your listing. With your approval we are added as co-host or manager and start on the highest-impact changes first.' },
  { icon: LineChart, title: 'Monthly reporting', text: 'See what changed, what it earned and what we are testing next.' },
];

const FAQ = [
  ['How did you find my listing?', 'Your listing is publicly visible on booking sites such as Airbnb and Vrbo. This page uses only what is visible about the listing itself: its title, location, size, rating, pricing and booking activity. We have not shared anything about you with anyone.'],
  ['How accurate are these numbers?', 'They are estimates from public booking activity and market data, so they can differ from your real results. The audit replaces estimates with your actual numbers. Nothing here is a guarantee of future earnings.'],
  ['Will I lose my listing, reviews or calendar?', 'No. We work on the listing you already have. You stay the owner and approve changes.'],
  ['What does it cost?', 'We will go over exact terms after the free audit, once we know which service fits your home. There is no cost for the audit itself.'],
  ['What if I am not interested?', 'No problem. Use the link at the bottom of this page and we will not contact you again about this.'],
];

function useSid() {
  return useMemo(() => {
    try { const k = 'travlr_host_sid'; let s = sessionStorage.getItem(k); if (!s) { s = (crypto.randomUUID?.() ?? String(Date.now())); sessionStorage.setItem(k, s); } return s; } catch { return ''; }
  }, []);
}

export default function OfferClient({ data }: { data: OfferData }) {
  const sid = useSid();
  const [scenario, setScenario] = useState<ScenarioKey>('expected');
  const [service, setService] = useState<Service>('co_host_only');
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const formRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '', service: 'not_sure' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [optedOut, setOptedOut] = useState(data.optedOut);
  const [confirmStop, setConfirmStop] = useState(false);
  const started = useRef(false);

  const track = (event: string, extra?: Record<string, string | number>) => {
    fetch('/api/host-offer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'event', code: data.code, sid, event, data: extra }), keepalive: true }).catch(() => {});
  };
  const toForm = (from: string) => { track('cta_click', { from }); formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };

  const sc = data.scenarios.find(s => s.key === scenario)!;
  const hasGap = data.gap >= 1000;
  const chartMax = Math.max(data.potential, sc.annual, data.current.revenue, 1);
  const [revVisible, setRevVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setRevVisible(true), 150); return () => clearTimeout(t); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setStatus('sending');
    try {
      const res = await fetch('/api/host-offer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'request', code: data.code, ...form }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
      setStatus('done'); setOptedOut(false);
    } catch (err) { setError((err as Error).message); setStatus('idle'); }
  }
  async function stopContact() {
    await fetch('/api/host-offer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'opt_out', code: data.code }) }).catch(() => {});
    setOptedOut(true); setConfirmStop(false);
  }

  const ratingLine = data.rating != null ? `${data.rating.toFixed(1)} stars${data.reviews ? ` from ${data.reviews} reviews` : ''}` : null;
  const facts = [data.bedrooms ? `${data.bedrooms} bedrooms` : null, data.bathrooms ? `${data.bathrooms} baths` : null, [data.city, data.state].filter(Boolean).join(', ') || null, ratingLine].filter(Boolean) as string[];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 antialiased">
      {/* Top bar */}
      <header className="bg-white/80 backdrop-blur border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="flex items-center gap-2 font-bold tracking-tight"><span className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-sm">T</span> TRAVLR <span className="hidden sm:inline text-slate-400 font-medium">Vacation Homes</span></span>
          <button onClick={() => toForm('header')} className="h-9 px-4 rounded-full bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">Free listing audit</button>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-b from-indigo-50 via-white to-slate-50">
        <div className="max-w-5xl mx-auto px-4 pt-12 pb-10 sm:pt-16 sm:pb-14">
          {optedOut && <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm px-4 py-3">We have noted that you do not want to be contacted about this. You can still look around, and you are welcome to request an audit below if you change your mind.</div>}
          <p className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 text-indigo-700 px-3 py-1 text-xs font-bold"><Sparkles size={13} /> A look at your listing</p>
          <h1 className="mt-4 text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] max-w-3xl">Your listing could be earning more.</h1>
          <p className="mt-4 text-base sm:text-lg text-slate-600 max-w-2xl leading-relaxed">We looked at <span className="font-semibold text-slate-900">&ldquo;{data.title}&rdquo;</span> using public booking data and put together what we noticed, what it could earn, and how we can help as your Co-Host or your Co-Host and Manager.</p>
          <div className="mt-4 flex flex-wrap gap-2">{facts.map(f => <span key={f} className="rounded-full bg-white border border-slate-200 px-3 py-1 text-xs text-slate-600">{f}</span>)}{data.luxury && <span className="rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-semibold text-amber-800">Luxury tier</span>}</div>
          <div className="mt-7 flex flex-wrap gap-3">
            <button onClick={() => toForm('hero')} className="h-12 px-6 rounded-full bg-indigo-600 text-white font-semibold inline-flex items-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-colors">Get my free audit <ArrowRight size={17} /></button>
            <a href="#earnings" className="h-12 px-6 rounded-full border border-slate-300 bg-white font-semibold inline-flex items-center hover:bg-slate-50 transition-colors">See my earnings picture</a>
          </div>
          <p className="mt-3 text-xs text-slate-500">Free and no obligation. Estimates are based on public data and are not a guarantee.</p>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 pb-16 space-y-12">
        {/* Earnings */}
        <section id="earnings" className="scroll-mt-20">
          <h2 className="text-2xl font-bold tracking-tight">Your earnings picture</h2>
          <p className="text-slate-600 mt-1 text-sm max-w-2xl">Estimated from public booking activity over the last 12 months, compared with what comparable demand in {data.city || 'your market'} supports.</p>

          <div className="mt-5 grid sm:grid-cols-3 gap-3">
            <div className="rounded-2xl bg-white border border-slate-200 p-5"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estimated earned</p><p className="mt-1.5 text-3xl font-extrabold tabular-nums">{usd(data.current.revenue)}</p><p className="text-xs text-slate-500 mt-1">last 12 months{data.current.occupancyPct != null ? `, ${Math.round(data.current.occupancyPct)}% booked` : ''}</p></div>
            <div className="rounded-2xl bg-white border border-slate-200 p-5"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estimated potential</p><p className="mt-1.5 text-3xl font-extrabold tabular-nums">{usd(data.potential)}</p><p className="text-xs text-slate-500 mt-1">what demand supports{data.current.adr ? `, at about ${usd(data.current.adr)} a night` : ''}</p></div>
            <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-5"><p className="text-xs font-semibold uppercase tracking-wide text-indigo-100">Possible upside</p><p className="mt-1.5 text-3xl font-extrabold tabular-nums">{hasGap ? usd(data.gap) : 'Targeted'}</p><p className="text-xs text-indigo-100 mt-1">{hasGap ? 'per year between earned and potential' : 'gains come from rating, photos and pricing'}</p></div>
          </div>

          {hasGap && (
            <div className="mt-4 rounded-2xl bg-white border border-slate-200 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold flex items-center gap-2"><TrendingUp size={17} className="text-indigo-600" /> What partnering could look like</p>
                <div role="tablist" className="inline-flex rounded-full bg-slate-100 p-1 text-sm">
                  {data.scenarios.map(s => <button key={s.key} role="tab" aria-selected={scenario === s.key} onClick={() => { setScenario(s.key); track('scenario', { key: s.key }); }} className={`px-3.5 py-1.5 rounded-full font-medium transition-all ${scenario === s.key ? 'bg-white shadow text-indigo-700' : 'text-slate-500 hover:text-slate-800'}`}>{s.label}</button>)}
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <div><div className="flex justify-between text-xs text-slate-500 mb-1"><span>Today (estimated)</span><span className="tabular-nums font-semibold text-slate-700">{usd(data.current.revenue)}</span></div>
                  <div className="h-4 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-slate-400 transition-all duration-700" style={{ width: revVisible ? `${(data.current.revenue / chartMax) * 100}%` : '0%' }} /></div></div>
                <div><div className="flex justify-between text-xs text-slate-500 mb-1"><span>With TRAVLR ({sc.label.toLowerCase()})</span><span className="tabular-nums font-bold text-indigo-700">{usd(sc.annual)}</span></div>
                  <div className="h-4 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-700" style={{ width: revVisible ? `${(sc.annual / chartMax) * 100}%` : '0%' }} /></div></div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xl sm:text-2xl font-extrabold text-emerald-700 tabular-nums">+{compact(sc.gain)}</p><p className="text-[11px] text-emerald-800">more per year{sc.gainPct != null ? ` (+${sc.gainPct}%)` : ''}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xl sm:text-2xl font-extrabold tabular-nums">{compact(sc.monthly)}</p><p className="text-[11px] text-slate-500">per month on average</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xl sm:text-2xl font-extrabold tabular-nums">{Math.round(sc.share * 100)}%</p><p className="text-[11px] text-slate-500">of the gap closed</p></div>
              </div>
              <p className="mt-4 text-[11px] leading-relaxed text-slate-500">Illustration only. It assumes we close {Math.round(sc.share * 100)}% of the gap between estimated earnings and estimated potential. These figures are before any fees and are not a promise of results. The free audit uses your real numbers.</p>
            </div>
          )}
        </section>

        {/* Findings */}
        <section>
          <h2 className="text-2xl font-bold tracking-tight">What we noticed</h2>
          <p className="text-slate-600 mt-1 text-sm">Specific, fixable things, and where we would start.</p>
          <div className="mt-5 grid md:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-white border border-slate-200 p-5">
              <p className="font-semibold flex items-center gap-2"><LineChart size={16} className="text-indigo-600" /> From the booking data</p>
              {data.findings.length ? <ul className="mt-3 space-y-2.5">{data.findings.map((f, i) => <li key={i} className="flex gap-2.5 text-sm text-slate-700"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-indigo-500" /><span className="first-letter:uppercase">{f}</span></li>)}</ul> : <p className="mt-3 text-sm text-slate-600">Your listing sits close to comparable homes. The upside is in the details: photos, copy, pricing and reviews.</p>}
            </div>
            <div className="rounded-2xl bg-white border border-slate-200 p-5">
              <p className="font-semibold flex items-center gap-2"><Camera size={16} className="text-indigo-600" /> From the listing photos{data.photo.score != null && <span className="ml-auto text-xs font-bold rounded-full bg-indigo-50 text-indigo-700 px-2 py-0.5">{data.photo.score}/100</span>}</p>
              {data.photo.fixes.length || data.photo.missingShots.length ? (
                <ul className="mt-3 space-y-2.5">
                  {data.photo.looksDated && <li className="flex gap-2.5 text-sm text-slate-700"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-indigo-500" /><span>The photos read as dated, which can cost clicks before guests ever see your home.</span></li>}
                  {data.photo.missingShots.length > 0 && <li className="flex gap-2.5 text-sm text-slate-700"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-indigo-500" /><span>Missing shots guests look for: {data.photo.missingShots.join(', ').toLowerCase()}.</span></li>}
                  {data.photo.fixes.slice(0, 2).map((f, i) => <li key={i} className="flex gap-2.5 text-sm text-slate-700"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-indigo-500" /><span>{f.length > 180 ? `${f.slice(0, 177)}...` : f}</span></li>)}
                </ul>
              ) : <p className="mt-3 text-sm text-slate-600">We will review your photos in the audit and point out the quickest wins.</p>}
            </div>
          </div>
        </section>

        {/* Services */}
        <section>
          <h2 className="text-2xl font-bold tracking-tight">Two ways to work with us</h2>
          <p className="text-slate-600 mt-1 text-sm">Start with what you need. You can move up later.</p>
          <div className="mt-5 inline-flex rounded-full bg-slate-200/70 p-1 text-sm">
            {(Object.keys(SERVICES) as Service[]).map(k => <button key={k} onClick={() => { setService(k); track('service', { key: k }); }} className={`px-4 py-2 rounded-full font-semibold transition-all ${service === k ? 'bg-white shadow text-indigo-700' : 'text-slate-600 hover:text-slate-900'}`}>{SERVICES[k].title}</button>)}
          </div>
          <div className="mt-4 rounded-2xl bg-white border border-slate-200 p-5 sm:p-6">
            <p className="text-lg font-bold flex items-center gap-2">{service === 'co_host_only' ? <Handshake size={19} className="text-indigo-600" /> : <Home size={19} className="text-indigo-600" />}{SERVICES[service].tag}</p>
            <p className="mt-1 text-sm text-slate-600">{SERVICES[service].blurb}</p>
            <div className="mt-5 grid md:grid-cols-2 gap-6">
              <div><p className="text-xs font-bold uppercase tracking-wide text-indigo-700 mb-2">What we do</p><ul className="space-y-2">{SERVICES[service].we.map(w => <li key={w} className="flex gap-2.5 text-sm"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" /><span>{w}</span></li>)}</ul></div>
              <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">What stays with you</p><ul className="space-y-2">{SERVICES[service].you.map(w => <li key={w} className="flex gap-2.5 text-sm text-slate-700"><Star size={15} className="mt-0.5 shrink-0 text-amber-500" /><span>{w}</span></li>)}</ul></div>
            </div>
            <button onClick={() => { setForm(f => ({ ...f, service })); toForm(`service_${service}`); }} className="mt-6 h-11 px-5 rounded-full bg-indigo-600 text-white text-sm font-semibold inline-flex items-center gap-2 hover:bg-indigo-700">Ask about {SERVICES[service].title} <ArrowRight size={15} /></button>
          </div>
        </section>

        {/* Steps */}
        <section>
          <h2 className="text-2xl font-bold tracking-tight">How it works</h2>
          <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map((s, i) => (
              <div key={s.title} className="rounded-2xl bg-white border border-slate-200 p-5 relative">
                <span className="absolute top-4 right-4 text-xs font-bold text-slate-300">0{i + 1}</span>
                <span className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center"><s.icon size={19} /></span>
                <p className="mt-3 font-semibold">{s.title}</p><p className="mt-1 text-[13px] leading-relaxed text-slate-600">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        <TrustCard />

        {/* Request form */}
        <section ref={formRef} id="audit" className="scroll-mt-24">
          <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-700 p-1">
            <div className="rounded-[22px] bg-white p-5 sm:p-8">
              {status === 'done' ? (
                <div className="text-center py-8"><span className="mx-auto w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center"><CheckCircle2 size={28} /></span>
                  <h2 className="mt-4 text-2xl font-bold">Thank you. We will be in touch.</h2><p className="mt-2 text-slate-600 text-sm max-w-md mx-auto">A member of our team will reach out soon to set up your free listing audit.</p></div>
              ) : (
                <>
                  <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2"><MessageSquare size={22} className="text-indigo-600" /> Get your free listing audit</h2>
                  <p className="mt-1 text-sm text-slate-600">Tell us how to reach you. No obligation, and no pressure.</p>
                  <form onSubmit={submit} className="mt-5 grid sm:grid-cols-2 gap-4" onFocus={() => { if (!started.current) { started.current = true; track('form_start'); } }}>
                    <label className="block text-sm font-medium">Your name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoComplete="name" className="mt-1 w-full h-11 rounded-xl border border-slate-300 px-3 outline-none focus:ring-2 focus:ring-indigo-400" /></label>
                    <label className="block text-sm font-medium">Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="email" className="mt-1 w-full h-11 rounded-xl border border-slate-300 px-3 outline-none focus:ring-2 focus:ring-indigo-400" /></label>
                    <label className="block text-sm font-medium">Phone (optional)<input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} autoComplete="tel" className="mt-1 w-full h-11 rounded-xl border border-slate-300 px-3 outline-none focus:ring-2 focus:ring-indigo-400" /></label>
                    <label className="block text-sm font-medium">What are you interested in?
                      <select value={form.service} onChange={e => setForm({ ...form, service: e.target.value })} className="mt-1 w-full h-11 rounded-xl border border-slate-300 px-3 bg-white outline-none focus:ring-2 focus:ring-indigo-400"><option value="not_sure">Not sure yet</option><option value="co_host_only">Co-Host</option><option value="co_host_and_manager">Co-Host + Manager</option></select></label>
                    <label className="block text-sm font-medium sm:col-span-2">Anything we should know? (optional)<textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} rows={3} maxLength={1000} className="mt-1 w-full rounded-xl border border-slate-300 p-3 outline-none focus:ring-2 focus:ring-indigo-400" /></label>
                    {error && <p className="sm:col-span-2 text-sm text-rose-600">{error}</p>}
                    <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                      <button disabled={status === 'sending'} className="h-12 px-7 rounded-full bg-indigo-600 text-white font-semibold inline-flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-60">{status === 'sending' ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />} Request my audit</button>
                      <p className="text-xs text-slate-500 max-w-sm">By submitting, you agree TRAVLR may contact you about this audit by email or phone.</p>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="text-2xl font-bold tracking-tight">Questions you might have</h2>
          <div className="mt-4 divide-y divide-slate-200 rounded-2xl bg-white border border-slate-200">
            {FAQ.map(([q, a], i) => (
              <div key={q}><button onClick={() => setFaqOpen(faqOpen === i ? null : i)} className="w-full flex items-center justify-between gap-3 text-left px-5 py-4 font-medium" aria-expanded={faqOpen === i}>{q}<ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${faqOpen === i ? 'rotate-180' : ''}`} /></button>
                {faqOpen === i && <p className="px-5 pb-4 text-sm text-slate-600 leading-relaxed">{a}</p>}</div>
            ))}
          </div>
        </section>
      </div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-8 text-sm text-slate-500 space-y-3">
          <p className="flex items-center gap-2 font-semibold text-slate-700"><BadgeCheck size={16} className="text-emerald-600" /> TRAVLR Vacation Homes</p>
          <p><Wrench size={13} className="inline mr-1.5 -mt-0.5" />Questions? <a className="text-indigo-700 font-medium hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{CONTACT_PHONE && <> &middot; <a className="text-indigo-700 font-medium hover:underline" href={telHref(CONTACT_PHONE)}>{CONTACT_PHONE}</a></>}</p>
          <p className="text-xs">Figures on this page are estimates from public booking and market data and are not guarantees of future earnings.</p>
          {optedOut ? <p className="text-xs text-emerald-700 font-medium">You will not be contacted about this.</p> : confirmStop ? (
            <p className="text-xs">Stop all contact about this listing? <button onClick={stopContact} className="font-semibold text-rose-600 hover:underline mr-3">Yes, stop</button><button onClick={() => setConfirmStop(false)} className="hover:underline">Cancel</button></p>
          ) : <button onClick={() => setConfirmStop(true)} className="text-xs underline hover:text-slate-800">Not interested? Do not contact me.</button>}
        </div>
      </footer>
    </main>
  );
}
