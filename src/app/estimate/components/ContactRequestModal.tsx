'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Phone, MessageSquare, CalendarClock, CheckCircle2, Loader2, Mail, ExternalLink } from 'lucide-react';
import { BOOKING_URL, CONTACT_EMAIL, CONTACT_PHONE, telHref } from '@/lib/homeownerContact';

export type ContactMode = 'call' | 'question';

export interface ContactPrefill { firstName?: string; lastName?: string; email?: string; phone?: string }

const WINDOWS = [
  { value: '', label: 'No preference' },
  { value: 'morning', label: 'Morning (9am to 12pm)' },
  { value: 'afternoon', label: 'Afternoon (12pm to 5pm)' },
  { value: 'evening', label: 'Evening (5pm to 8pm)' },
];

const field = 'w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition';

function isoDate(offsetDays: number) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ContactRequestModal({
  open, onClose, address, initialMode = 'call', prefill,
}: { open: boolean; onClose: () => void; address: string; initialMode?: ContactMode; prefill?: ContactPrefill }) {
  const [mode, setMode] = useState<ContactMode>(initialMode);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', preferredDate: '', preferredWindow: '', message: '', smsConsent: false, website: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [serverError, setServerError] = useState('');
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [emailKept, setEmailKept] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setStatus('idle');
    setServerError('');
    setErrors({});
    setSuggestion(null);
    setEmailKept(false);
    setForm(f => ({
      ...f,
      firstName: f.firstName || prefill?.firstName || '',
      lastName: f.lastName || prefill?.lastName || '',
      email: f.email || prefill?.email || '',
      phone: f.phone || prefill?.phone || '',
    }));
    const t = setTimeout(() => firstRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open, initialMode, prefill?.firstName, prefill?.lastName, prefill?.email, prefill?.phone]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  const timezone = useMemo(() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } }, []);
  const set = (k: keyof typeof form, v: string | boolean) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })); if (k === 'email') { setSuggestion(null); setEmailKept(false); } };

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = 'Please enter your first name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = 'Please enter a valid email';
    const digits = form.phone.replace(/\D/g, '');
    if (mode === 'call' && digits.length < 10) e.phone = 'Please enter a phone number we can call';
    if (mode === 'question' && form.phone && digits.length < 10) e.phone = 'Please enter a valid phone number';
    if (mode === 'question' && form.message.trim().length < 5) e.message = 'Please type your question';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (status === 'sending' || !validate()) return;
    setStatus('sending');
    setServerError('');
    try {
      const res = await fetch('/api/estimate/contact-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address, type: mode, timezone,
          firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone,
          preferredDate: mode === 'call' ? form.preferredDate : '', preferredWindow: mode === 'call' ? form.preferredWindow : '',
          message: form.message, smsConsent: form.smsConsent, website: form.website, emailConfirmed: emailKept,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) { setStatus('done'); return; }
      if (data.fields) setErrors(data.fields);
      setSuggestion(data.suggestion ?? null);
      setServerError(data.error || 'Something went wrong. Please try again or email us.');
      setStatus('error');
    } catch {
      setServerError('We could not reach the server. Please check your connection and try again.');
      setStatus('error');
    }
  }

  if (!open) return null;

  const err = (k: string) => (errors[k] ? <p className="mt-1 text-xs text-rose-600">{errors[k]}</p> : null);
  const bad = (k: string) => (errors[k] ? 'border-rose-300' : 'border-slate-200');

  return (
    <div className="print:hidden fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Contact TRAVLR">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[94vh] overflow-y-auto bg-white text-slate-900 rounded-t-3xl sm:rounded-2xl shadow-2xl">
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur px-6 pt-5 pb-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{status === 'done' ? 'Request received' : 'Talk to a TRAVLR specialist'}</h2>
            {status !== 'done' && <p className="text-xs text-slate-500 mt-0.5">We reply within one business day. No obligation.</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 -mr-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"><X size={18} /></button>
        </div>

        {status === 'done' ? (
          <div className="px-6 py-10 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 flex items-center justify-center"><CheckCircle2 size={28} className="text-emerald-600" /></div>
            <p className="text-lg font-bold">{mode === 'call' ? 'Your call request is in' : 'We got your question'}</p>
            <p className="text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
              {mode === 'call'
                ? 'A TRAVLR specialist will contact you within one business day and will aim for your preferred time.'
                : 'A TRAVLR specialist will reply within one business day.'} We sent a confirmation to <strong>{form.email}</strong>.
            </p>
            <button onClick={onClose} className="mt-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition">Back to my report</button>
          </div>
        ) : (
          <form onSubmit={submit} className="px-6 py-5 space-y-4" noValidate>
            {BOOKING_URL && (
              <a href={BOOKING_URL} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 hover:bg-indigo-100 transition">
                <span className="flex items-center gap-3"><CalendarClock size={18} className="text-indigo-600" /><span><span className="block text-sm font-semibold text-indigo-900">Pick a time that works for you</span><span className="block text-xs text-indigo-700/80">Book instantly on our calendar</span></span></span>
                <ExternalLink size={15} className="text-indigo-500" />
              </a>
            )}

            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100" role="tablist">
              {([['call', 'Schedule a call', <Phone key="p" size={14} />], ['question', 'Ask a question', <MessageSquare key="m" size={14} />]] as const).map(([m, label, icon]) => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setErrors({}); setServerError(''); }}
                  className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition ${mode === m ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {icon}{label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">First name *</label>
                <input ref={firstRef} className={`${field} ${bad('firstName')}`} value={form.firstName} onChange={e => set('firstName', e.target.value)} autoComplete="given-name" />
                {err('firstName')}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Last name</label>
                <input className={`${field} border-slate-200`} value={form.lastName} onChange={e => set('lastName', e.target.value)} autoComplete="family-name" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email *</label>
              <input type="email" className={`${field} ${bad('email')}`} value={form.email} onChange={e => set('email', e.target.value)} autoComplete="email" />
              {err('email')}
              {suggestion && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <button type="button" onClick={() => { setForm(f => ({ ...f, email: suggestion })); setSuggestion(null); setErrors(e => ({ ...e, email: '' })); }} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold">Use {suggestion}</button>
                  <button type="button" onClick={() => { setEmailKept(true); setSuggestion(null); setErrors(e => ({ ...e, email: '' })); }} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Keep what I typed</button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Phone {mode === 'call' ? '*' : '(optional)'}</label>
              <input type="tel" className={`${field} ${bad('phone')}`} value={form.phone} onChange={e => set('phone', e.target.value)} autoComplete="tel" placeholder="(555) 123-4567" />
              {err('phone')}
            </div>

            {mode === 'call' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Preferred day</label>
                  <input type="date" className={`${field} border-slate-200`} min={isoDate(0)} max={isoDate(60)} value={form.preferredDate} onChange={e => set('preferredDate', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Best time{timezone ? ` (${timezone.split('/').pop()?.replace('_', ' ')})` : ''}</label>
                  <select className={`${field} border-slate-200`} value={form.preferredWindow} onChange={e => set('preferredWindow', e.target.value)}>
                    {WINDOWS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">{mode === 'question' ? 'Your question *' : 'Anything we should know? (optional)'}</label>
              <textarea rows={mode === 'question' ? 4 : 3} maxLength={2000} className={`${field} ${bad('message')} resize-none`} value={form.message} onChange={e => set('message', e.target.value)}
                placeholder={mode === 'question' ? 'e.g. How do permits work in my city?' : 'e.g. I plan to list in the spring'} />
              {err('message')}
            </div>

            {/* Honeypot: real visitors never see or fill this */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={e => set('website', e.target.value)} /></label>
            </div>

            <label className="flex items-start gap-2.5 text-[11px] text-slate-500 leading-snug cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={form.smsConsent} onChange={e => set('smsConsent', e.target.checked)} />
              <span>I agree to receive text updates from TRAVLR Vacation Homes. Message &amp; data rates may apply. Reply STOP to opt out. (Optional)</span>
            </label>

            {serverError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{serverError}</div>}

            <button type="submit" disabled={status === 'sending'} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 transition">
              {status === 'sending' ? <><Loader2 size={15} className="animate-spin" /> Sending…</> : mode === 'call' ? 'Request my call' : 'Send my question'}
            </button>

            <div className="pt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-slate-500">
              <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Question about my estimate: ' + address)}`} className="inline-flex items-center gap-1.5 hover:text-indigo-600"><Mail size={13} />{CONTACT_EMAIL}</a>
              {CONTACT_PHONE && <a href={telHref(CONTACT_PHONE)} className="inline-flex items-center gap-1.5 hover:text-indigo-600"><Phone size={13} />{CONTACT_PHONE}</a>}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
