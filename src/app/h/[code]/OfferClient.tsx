'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BadgeCheck, Camera, CheckCircle2, ChevronDown, ClipboardCheck, ExternalLink, Handshake, Home, LineChart, Loader2, MessageSquare, Monitor, Moon, Rocket, Search, Sparkles, Star, Sun, TrendingUp, Wrench } from 'lucide-react';
import type { OfferData } from '@/lib/services/cohostOffer';
import { TRUST_ITEMS, TRUST_AFFILIATIONS, TRUST_STORY, ABOUT_URL } from '@/lib/homeownerTrust';
import { CONTACT_EMAIL, CONTACT_PHONE, telHref } from '@/lib/homeownerContact';
import './offer.css';

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const compact = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : usd(n));

type ScenarioKey = 'conservative' | 'expected' | 'stretch';
type Service = 'co_host_only' | 'co_host_and_manager';
type Theme = 'system' | 'light' | 'dark';

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

const THEME_KEY = 'host_offer_theme';
const input = 'ho-input mt-1 w-full h-11 rounded-xl px-3';

function useSid() {
  return useMemo(() => {
    try { const k = 'travlr_host_sid'; let s = sessionStorage.getItem(k); if (!s) { s = (crypto.randomUUID?.() ?? String(Date.now())); sessionStorage.setItem(k, s); } return s; } catch { return ''; }
  }, []);
}

export default function OfferClient({ data }: { data: OfferData }) {
  const sid = useSid();
  const [theme, setTheme] = useState<Theme>('system');
  useEffect(() => { try { const t = localStorage.getItem(THEME_KEY); if (t === 'light' || t === 'dark') setTheme(t); } catch { /* storage unavailable */ } }, []);
  const cycleTheme = () => setTheme(t => { const n: Theme = t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system'; try { if (n === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, n); } catch { /* storage unavailable */ } return n; });
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

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
    <main className="ho min-h-screen antialiased" data-theme={theme === 'system' ? undefined : theme}>
      {/* Top bar */}
      <header className="ho-header border-b sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <span className="ho-tx flex items-center gap-2 font-bold tracking-tight"><span className="ho-logo w-7 h-7 rounded-lg flex items-center justify-center text-sm">T</span> TRAVLR <span className="ho-mu hidden sm:inline font-medium">Vacation Homes</span></span>
          <div className="flex items-center gap-2">
            <button onClick={cycleTheme} aria-label={`Color theme: ${theme}. Click to change.`} title={`Theme: ${theme}`} className="ho-btn-outline h-9 w-9 rounded-full inline-flex items-center justify-center"><ThemeIcon size={16} /></button>
            <button onClick={() => toForm('header')} className="ho-btn h-9 px-4 rounded-full text-sm font-semibold transition-colors">Free listing audit</button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="ho-hero">
        <div className="max-w-5xl mx-auto px-4 pt-12 pb-10 sm:pt-16 sm:pb-14">
          {optedOut && <div className="ho-banner-good mb-6 rounded-xl text-sm px-4 py-3">We have noted that you do not want to be contacted about this. You can still look around, and you are welcome to request an audit below if you change your mind.</div>}
          <p className="ho-pill-ac inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"><Sparkles size={13} /> A look at your listing</p>
          <h1 className="ho-tx mt-4 text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] max-w-3xl">Your listing could be earning more.</h1>
          <p className="ho-tx-2 mt-4 text-base sm:text-lg max-w-2xl leading-relaxed">We looked at <span className="ho-tx font-semibold">&ldquo;{data.title}&rdquo;</span> using public booking data and put together what we noticed, what it could earn, and how we can help as your Co-Host or your Co-Host and Manager.</p>
          <div className="mt-4 flex flex-wrap gap-2">{facts.map(f => <span key={f} className="ho-pill rounded-full px-3 py-1 text-xs">{f}</span>)}{data.luxury && <span className="ho-pill-warn rounded-full px-3 py-1 text-xs font-semibold">Luxury tier</span>}</div>
          <div className="mt-7 flex flex-wrap gap-3">
            <button onClick={() => toForm('hero')} className="ho-btn h-12 px-6 rounded-full font-semibold inline-flex items-center gap-2 shadow-lg transition-colors">Get my free audit <ArrowRight size={17} /></button>
            <a href="#earnings" className="ho-btn-outline h-12 px-6 rounded-full font-semibold inline-flex items-center transition-colors">See my earnings picture</a>
          </div>
          <p className="ho-mu mt-3 text-xs">Free and no obligation. Estimates are based on public data and are not a guarantee.</p>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 pb-16 space-y-12">
        {/* Earnings */}
        <section id="earnings" className="scroll-mt-20">
          <h2 className="ho-tx text-2xl font-bold tracking-tight">Your earnings picture</h2>
          <p className="ho-mu mt-1 text-sm max-w-2xl">Estimated from public booking activity over the last 12 months, compared with what comparable demand in {data.city || 'your market'} supports.</p>

          <div className="mt-5 grid sm:grid-cols-3 gap-3">
            <div className="ho-card rounded-2xl p-5"><p className="ho-mu text-xs font-semibold uppercase tracking-wide">Estimated earned</p><p className="mt-1.5 text-3xl font-extrabold tabular-nums">{usd(data.current.revenue)}</p><p className="ho-mu text-xs mt-1">last 12 months{data.current.occupancyPct != null ? `, ${Math.round(data.current.occupancyPct)}% booked` : ''}</p></div>
            <div className="ho-card rounded-2xl p-5"><p className="ho-mu text-xs font-semibold uppercase tracking-wide">Estimated potential</p><p className="mt-1.5 text-3xl font-extrabold tabular-nums">{usd(data.potential)}</p><p className="ho-mu text-xs mt-1">what demand supports{data.current.adr ? `, at about ${usd(data.current.adr)} a night` : ''}</p></div>
            <div className="ho-grad rounded-2xl p-5"><p className="ho-on-grad-mu text-xs font-semibold uppercase tracking-wide">Possible upside</p><p className="mt-1.5 text-3xl font-extrabold tabular-nums">{hasGap ? usd(data.gap) : 'Targeted'}</p><p className="ho-on-grad-mu text-xs mt-1">{hasGap ? 'per year between earned and potential' : 'gains come from rating, photos and pricing'}</p></div>
          </div>

          {hasGap && (
            <div className="ho-card mt-4 rounded-2xl p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold flex items-center gap-2"><TrendingUp size={17} className="ho-ac" /> What partnering could look like</p>
                <div role="tablist" className="ho-tabs inline-flex rounded-full p-1 text-sm">
                  {data.scenarios.map(s => <button key={s.key} role="tab" aria-selected={scenario === s.key} onClick={() => { setScenario(s.key); track('scenario', { key: s.key }); }} className={`ho-tab px-3.5 py-1.5 rounded-full font-medium transition-all ${scenario === s.key ? 'ho-tab-on' : ''}`}>{s.label}</button>)}
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <div><div className="ho-mu flex justify-between text-xs mb-1"><span>Today (estimated)</span><span className="ho-tx-2 tabular-nums font-semibold">{usd(data.current.revenue)}</span></div>
                  <div className="ho-track h-4 rounded-full overflow-hidden"><div className="ho-bar-now h-full rounded-full transition-all duration-700" style={{ width: revVisible ? `${(data.current.revenue / chartMax) * 100}%` : '0%' }} /></div></div>
                <div><div className="ho-mu flex justify-between text-xs mb-1"><span>With TRAVLR ({sc.label.toLowerCase()})</span><span className="ho-ac tabular-nums font-bold">{usd(sc.annual)}</span></div>
                  <div className="ho-track h-4 rounded-full overflow-hidden"><div className="ho-bar-with h-full rounded-full transition-all duration-700" style={{ width: revVisible ? `${(sc.annual / chartMax) * 100}%` : '0%' }} /></div></div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                <div className="ho-tile-good rounded-xl p-3"><p className="text-xl sm:text-2xl font-extrabold tabular-nums">+{compact(sc.gain)}</p><p className="text-[11px]">more per year{sc.gainPct != null ? ` (+${sc.gainPct}%)` : ''}</p></div>
                <div className="ho-tile rounded-xl p-3"><p className="text-xl sm:text-2xl font-extrabold tabular-nums">{compact(sc.monthly)}</p><p className="ho-mu text-[11px]">per month on average</p></div>
                <div className="ho-tile rounded-xl p-3"><p className="text-xl sm:text-2xl font-extrabold tabular-nums">{Math.round(sc.share * 100)}%</p><p className="ho-mu text-[11px]">of the gap closed</p></div>
              </div>
              <p className="ho-mu mt-4 text-[11px] leading-relaxed">Illustration only. It assumes we close {Math.round(sc.share * 100)}% of the gap between estimated earnings and estimated potential. These figures are before any fees and are not a promise of results. The free audit uses your real numbers.</p>
            </div>
          )}
        </section>

        {/* Findings */}
        <section>
          <h2 className="ho-tx text-2xl font-bold tracking-tight">What we noticed</h2>
          <p className="ho-mu mt-1 text-sm">Specific, fixable things, and where we would start.</p>
          <div className="mt-5 grid md:grid-cols-2 gap-4">
            <div className="ho-card rounded-2xl p-5">
              <p className="font-semibold flex items-center gap-2"><LineChart size={16} className="ho-ac" /> From the booking data</p>
              {data.findings.length ? <ul className="mt-3 space-y-2.5">{data.findings.map((f, i) => <li key={i} className="ho-tx-2 flex gap-2.5 text-sm"><CheckCircle2 size={16} className="ho-ac mt-0.5 shrink-0" /><span className="first-letter:uppercase">{f}</span></li>)}</ul> : <p className="ho-mu mt-3 text-sm">Your listing sits close to comparable homes. The upside is in the details: photos, copy, pricing and reviews.</p>}
            </div>
            <div className="ho-card rounded-2xl p-5">
              <p className="font-semibold flex items-center gap-2"><Camera size={16} className="ho-ac" /> From the listing photos{data.photo.score != null && <span className="ho-pill-ac ml-auto text-xs font-bold rounded-full px-2 py-0.5">{data.photo.score}/100</span>}</p>
              {data.photo.fixes.length || data.photo.missingShots.length ? (
                <ul className="mt-3 space-y-2.5">
                  {data.photo.looksDated && <li className="ho-tx-2 flex gap-2.5 text-sm"><CheckCircle2 size={16} className="ho-ac mt-0.5 shrink-0" /><span>The photos read as dated, which can cost clicks before guests ever see your home.</span></li>}
                  {data.photo.missingShots.length > 0 && <li className="ho-tx-2 flex gap-2.5 text-sm"><CheckCircle2 size={16} className="ho-ac mt-0.5 shrink-0" /><span>Missing shots guests look for: {data.photo.missingShots.join(', ').toLowerCase()}.</span></li>}
                  {data.photo.fixes.slice(0, 2).map((f, i) => <li key={i} className="ho-tx-2 flex gap-2.5 text-sm"><CheckCircle2 size={16} className="ho-ac mt-0.5 shrink-0" /><span>{f.length > 180 ? `${f.slice(0, 177)}...` : f}</span></li>)}
                </ul>
              ) : <p className="ho-mu mt-3 text-sm">We will review your photos in the audit and point out the quickest wins.</p>}
            </div>
          </div>
        </section>

        {/* Services */}
        <section>
          <h2 className="ho-tx text-2xl font-bold tracking-tight">Two ways to work with us</h2>
          <p className="ho-mu mt-1 text-sm">Start with what you need. You can move up later.</p>
          <div className="ho-tabs mt-5 inline-flex rounded-full p-1 text-sm">
            {(Object.keys(SERVICES) as Service[]).map(k => <button key={k} onClick={() => { setService(k); track('service', { key: k }); }} className={`ho-tab px-4 py-2 rounded-full font-semibold transition-all ${service === k ? 'ho-tab-on' : ''}`}>{SERVICES[k].title}</button>)}
          </div>
          <div className="ho-card mt-4 rounded-2xl p-5 sm:p-6">
            <p className="text-lg font-bold flex items-center gap-2">{service === 'co_host_only' ? <Handshake size={19} className="ho-ac" /> : <Home size={19} className="ho-ac" />}{SERVICES[service].tag}</p>
            <p className="ho-mu mt-1 text-sm">{SERVICES[service].blurb}</p>
            <div className="mt-5 grid md:grid-cols-2 gap-6">
              <div><p className="ho-ac text-xs font-bold uppercase tracking-wide mb-2">What we do</p><ul className="space-y-2">{SERVICES[service].we.map(w => <li key={w} className="flex gap-2.5 text-sm"><CheckCircle2 size={16} className="ho-good-tx mt-0.5 shrink-0" /><span>{w}</span></li>)}</ul></div>
              <div><p className="ho-mu text-xs font-bold uppercase tracking-wide mb-2">What stays with you</p><ul className="space-y-2">{SERVICES[service].you.map(w => <li key={w} className="ho-tx-2 flex gap-2.5 text-sm"><Star size={15} className="ho-ac mt-0.5 shrink-0" /><span>{w}</span></li>)}</ul></div>
            </div>
            <button onClick={() => { setForm(f => ({ ...f, service })); toForm(`service_${service}`); }} className="ho-btn mt-6 h-11 px-5 rounded-full text-sm font-semibold inline-flex items-center gap-2">Ask about {SERVICES[service].title} <ArrowRight size={15} /></button>
          </div>
        </section>

        {/* Steps */}
        <section>
          <h2 className="ho-tx text-2xl font-bold tracking-tight">How it works</h2>
          <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map((s, i) => (
              <div key={s.title} className="ho-card rounded-2xl p-5 relative">
                <span className="ho-mu absolute top-4 right-4 text-xs font-bold">0{i + 1}</span>
                <span className="ho-soft w-10 h-10 rounded-xl flex items-center justify-center"><s.icon size={19} /></span>
                <p className="mt-3 font-semibold">{s.title}</p><p className="ho-mu mt-1 text-[13px] leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Trust */}
        <aside className="ho-card rounded-2xl p-5">
          <p className="flex items-center gap-2 text-sm font-bold"><BadgeCheck size={16} className="ho-good-tx" /> Why owners trust TRAVLR</p>
          <p className="ho-mu mt-1.5 text-[13px] leading-relaxed">{TRUST_STORY} Every item below links to its public source.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {TRUST_ITEMS.map(i => (
              <li key={i.key}><a href={i.href} target="_blank" rel="noopener noreferrer" className="ho-bd ho-surface-2 flex items-start justify-between gap-2 rounded-xl border px-3 py-2.5 hover:opacity-90"><span><span className="ho-tx block text-[13px] font-semibold">{i.title}</span><span className="ho-mu block text-[11px]">{i.note}</span></span><ExternalLink size={12} className="ho-mu mt-1 shrink-0" /></a></li>
            ))}
          </ul>
          <p className="ho-mu mt-3 text-[12px] leading-relaxed">Affiliations shown on our website: {TRUST_AFFILIATIONS}. <a href={ABOUT_URL} target="_blank" rel="noopener noreferrer" className="ho-link font-semibold hover:underline">Our story</a></p>
        </aside>

        {/* Request form */}
        <section ref={formRef} id="audit" className="scroll-mt-24">
          <div className="ho-cta-ring rounded-3xl p-1">
            <div className="ho-surface ho-tx rounded-[22px] p-5 sm:p-8">
              {status === 'done' ? (
                <div className="text-center py-8"><span className="ho-pill-good mx-auto w-14 h-14 rounded-full flex items-center justify-center"><CheckCircle2 size={28} /></span>
                  <h2 className="mt-4 text-2xl font-bold">Thank you. We will be in touch.</h2><p className="ho-mu mt-2 text-sm max-w-md mx-auto">A member of our team will reach out soon to set up your free listing audit.</p></div>
              ) : (
                <>
                  <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2"><MessageSquare size={22} className="ho-ac" /> Get your free listing audit</h2>
                  <p className="ho-mu mt-1 text-sm">Tell us how to reach you. No obligation, and no pressure.</p>
                  <form onSubmit={submit} className="mt-5 grid sm:grid-cols-2 gap-4" onFocus={() => { if (!started.current) { started.current = true; track('form_start'); } }}>
                    <label className="ho-tx block text-sm font-medium">Your name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoComplete="name" className={input} /></label>
                    <label className="ho-tx block text-sm font-medium">Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="email" className={input} /></label>
                    <label className="ho-tx block text-sm font-medium">Phone (optional)<input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} autoComplete="tel" className={input} /></label>
                    <label className="ho-tx block text-sm font-medium">What are you interested in?
                      <select value={form.service} onChange={e => setForm({ ...form, service: e.target.value })} className={input}><option value="not_sure">Not sure yet</option><option value="co_host_only">Co-Host</option><option value="co_host_and_manager">Co-Host + Manager</option></select></label>
                    <label className="ho-tx block text-sm font-medium sm:col-span-2">Anything we should know? (optional)<textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} rows={3} maxLength={1000} className="ho-input mt-1 w-full rounded-xl p-3" /></label>
                    {error && <p className="ho-bad-tx sm:col-span-2 text-sm font-medium">{error}</p>}
                    <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                      <button disabled={status === 'sending'} className="ho-btn h-12 px-7 rounded-full font-semibold inline-flex items-center gap-2 disabled:opacity-60">{status === 'sending' ? <Loader2 size={17} className="animate-spin" /> : <ArrowRight size={17} />} Request my audit</button>
                      <p className="ho-mu text-xs max-w-sm">By submitting, you agree TRAVLR may contact you about this audit by email, phone or text message. Reply STOP to any text to opt out.</p>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="ho-tx text-2xl font-bold tracking-tight">Questions you might have</h2>
          <div className="ho-card ho-divide mt-4 rounded-2xl">
            {FAQ.map(([q, a], i) => (
              <div key={q}><button onClick={() => setFaqOpen(faqOpen === i ? null : i)} className="ho-tx w-full flex items-center justify-between gap-3 text-left px-5 py-4 font-medium" aria-expanded={faqOpen === i}>{q}<ChevronDown size={18} className={`ho-mu shrink-0 transition-transform ${faqOpen === i ? 'rotate-180' : ''}`} /></button>
                {faqOpen === i && <p className="ho-mu px-5 pb-4 text-sm leading-relaxed">{a}</p>}</div>
            ))}
          </div>
        </section>
      </div>

      <footer className="ho-surface ho-bd border-t">
        <div className="max-w-5xl mx-auto px-4 py-8 text-sm space-y-3">
          <p className="ho-tx flex items-center gap-2 font-semibold"><BadgeCheck size={16} className="ho-good-tx" /> TRAVLR Vacation Homes</p>
          <p className="ho-mu"><Wrench size={13} className="inline mr-1.5 -mt-0.5" />Questions? <a className="ho-link font-medium hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{CONTACT_PHONE && <> &middot; <a className="ho-link font-medium hover:underline" href={telHref(CONTACT_PHONE)}>{CONTACT_PHONE}</a></>}</p>
          <p className="ho-mu text-xs">Figures on this page are estimates from public booking and market data and are not guarantees of future earnings.</p>
          {optedOut ? <p className="ho-good-tx text-xs font-medium">You will not be contacted about this.</p> : confirmStop ? (
            <p className="ho-mu text-xs">Stop all contact about this listing? <button onClick={stopContact} className="ho-bad-tx font-semibold hover:underline mr-3">Yes, stop</button><button onClick={() => setConfirmStop(false)} className="ho-muted-link">Cancel</button></p>
          ) : <button onClick={() => setConfirmStop(true)} className="ho-muted-link text-xs">Not interested? Do not contact me.</button>}
        </div>
      </footer>
    </main>
  );
}
