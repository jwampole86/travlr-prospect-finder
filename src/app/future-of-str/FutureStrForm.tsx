'use client';

import React, { useState } from 'react';
import { CONCERNS, COMFORT, CONSENT_TEXT, HOME_INTERESTS, OP_INTERESTS, PAY, ROLES, SIZES, type Audience } from '@/lib/futureStrOptions';

const field = 'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200';

function Choice({ type, name, checked, onChange, label }: { type: 'radio' | 'checkbox'; name: string; checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-[15px] cursor-pointer transition-colors ${checked ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
      <input type={type} name={name} checked={checked} onChange={onChange} className="mt-1 h-4 w-4 accent-blue-600" />
      <span className="text-slate-800">{label}</span>
    </label>
  );
}

export default function FutureStrForm({ initialAudience, source }: { initialAudience: Audience; source: string }) {
  const [audience, setAudience] = useState<Audience>(initialAudience);
  const [comfort, setComfort] = useState('');
  const [concerns, setConcerns] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [role, setRole] = useState('');
  const [size, setSize] = useState('');
  const [pay, setPay] = useState('');
  const [comment, setComment] = useState('');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ subscribed: boolean } | null>(null);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  const switchAudience = (a: Audience) => { setAudience(a); setInterests([]); setError(null); };

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const res = await fetch('/api/future-str/respond', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        audience, comfort, concerns, interests, role, portfolioSize: size, payInterest: pay, comment, email, firstName, consent, source, website }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
      setDone({ subscribed: !!j.subscribed });
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  if (done) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-16">
        <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow-sm border border-slate-200 text-center">
          <p className="text-xs font-bold tracking-widest text-blue-600">AVYRO AI</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Thank you.</h1>
          <p className="mt-3 text-slate-600">Your answers will help shape how we approach the future of vacation rental operations.</p>
          {done.subscribed && <p className="mt-3 text-slate-600">We will send one short email to confirm your address before sending anything else. You can unsubscribe at any time.</p>}
        </div>
      </main>
    );
  }

  const interestList = audience === 'operator' ? OP_INTERESTS : HOME_INTERESTS;
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:py-14">
      <form onSubmit={submit} className="mx-auto max-w-2xl space-y-8">
        <header>
          <p className="text-xs font-bold tracking-widest text-blue-600">AVYRO AI &nbsp;/&nbsp; THE FUTURE OF PROPERTY TURNOVERS</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight text-slate-900">Help shape the future of vacation rental operations.</h1>
          <p className="mt-3 text-slate-600">We are researching how technology could make vacation rental turnovers more reliable: smarter coordination, inspections and supplies, and possibly, one day, supervised robotic assistance with selected tasks.</p>
          <p className="mt-3 rounded-xl border-l-4 border-blue-500 bg-blue-50 px-4 py-3 text-slate-800"><strong>This is research, not an announcement.</strong> No robotic service is available today. We want to hear from you before we build further. It takes about two minutes, and every question is optional.</p>
        </header>

        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-200/70 p-1">
          {([['homeowner', 'I own a vacation rental'], ['operator', 'I manage properties or run a cleaning company']] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => switchAudience(id)} className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${audience === id ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>
          ))}
        </div>

        {audience === 'homeowner' ? (
          <>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-lg font-semibold text-slate-900">Would you feel comfortable having a supervised robot assist with cleaning and preparing your vacation rental?</legend>
              {COMFORT.map(c => <Choice key={c.id} type="radio" name="comfort" checked={comfort === c.id} onChange={() => setComfort(c.id)} label={c.label} />)}
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-lg font-semibold text-slate-900">What concerns would you want addressed first? <span className="text-sm font-normal text-slate-500">Choose any.</span></legend>
              {CONCERNS.map(c => <Choice key={c.id} type="checkbox" name="concerns" checked={concerns.includes(c.id)} onChange={() => toggle(concerns, setConcerns, c.id)} label={c.label} />)}
            </fieldset>
          </>
        ) : (
          <>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-lg font-semibold text-slate-900">Which best describes you?</legend>
              {ROLES.map(c => <Choice key={c.id} type="radio" name="role" checked={role === c.id} onChange={() => setRole(c.id)} label={c.label} />)}
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-lg font-semibold text-slate-900">How many properties do you handle?</legend>
              {SIZES.map(c => <Choice key={c.id} type="radio" name="size" checked={size === c.id} onChange={() => setSize(c.id)} label={c.label} />)}
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-lg font-semibold text-slate-900">If software handled scheduling, checklists and inspection photos for your turnovers, would you pay for it?</legend>
              {PAY.map(c => <Choice key={c.id} type="radio" name="pay" checked={pay === c.id} onChange={() => setPay(c.id)} label={c.label} />)}
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-lg font-semibold text-slate-900">Would you feel comfortable with a supervised robot assisting your crews with selected tasks? What would worry you? <span className="text-sm font-normal text-slate-500">Choose any.</span></legend>
              {CONCERNS.map(c => <Choice key={c.id} type="checkbox" name="concerns" checked={concerns.includes(c.id)} onChange={() => toggle(concerns, setConcerns, c.id)} label={c.label} />)}
            </fieldset>
          </>
        )}

        <div>
          <label htmlFor="comment" className="mb-2 block text-lg font-semibold text-slate-900">{audience === 'operator' ? 'What is your biggest turnover headache today?' : 'Anything else you would like us to know?'} <span className="text-sm font-normal text-slate-500">Optional.</span></label>
          <textarea id="comment" value={comment} onChange={e => setComment(e.target.value.slice(0, 1000))} rows={4} className={field} />
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-lg font-semibold text-slate-900">Stay involved <span className="text-sm font-normal text-slate-500">Optional.</span></legend>
          {interestList.map(c => <Choice key={c.id} type="checkbox" name="interests" checked={interests.includes(c.id)} onChange={() => toggle(interests, setInterests, c.id)} label={c.label} />)}
        </fieldset>

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Your details <span className="text-sm font-normal text-slate-500">Only needed if you want updates or a conversation.</span></h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={firstName} onChange={e => setFirstName(e.target.value.slice(0, 60))} placeholder="First name" autoComplete="given-name" className={field} aria-label="First name" />
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" type="email" autoComplete="email" className={field} aria-label="Email address" />
          </div>
          {/* Hidden from people; bots tend to fill it in. */}
          <input value={website} onChange={e => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" name="website" />
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-blue-600" />
            <span>{CONSENT_TEXT}</span>
          </label>
        </section>

        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-xl bg-blue-600 px-6 py-3.5 text-base font-bold text-white hover:bg-blue-700 disabled:opacity-60">{busy ? 'Sending...' : 'Share my thoughts'}</button>
        <p className="text-center text-xs text-slate-500">Your answers are used for product research. We do not sell your information.</p>
      </form>
    </main>
  );
}
