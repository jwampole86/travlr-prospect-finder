'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import TrustCard from '@/app/estimate/components/TrustCard';
import WhyTravlrCard from '@/app/estimate/components/WhyTravlrCard';
import ReportChat from '@/app/estimate/components/ReportChat';
import { trackEstimateEvent, getTrackingContext } from '@/lib/estimateTracking';
import ReportActions from '@/app/estimate/components/ReportActions';
import { type EquipmentKey } from '@/lib/homeownerReportContent';
import { MapPin, DollarSign, TrendingUp, Shield, ChevronRight, CheckCircle, Loader2, Phone, AlertCircle, ExternalLink } from 'lucide-react';
import { resolveBrand } from '@/lib/brands';
import { WEBSITE_URL, WEBSITE_LABEL, CONTACT_EMAIL, CONTACT_PHONE, telHref } from '@/lib/homeownerContact';
import toast from 'react-hot-toast';
import { Toaster } from 'react-hot-toast';
import HomeownerReportView from '@/app/estimate/components/HomeownerReport';
import QuickRequest from '@/app/estimate/components/QuickRequest';
import ContactRequestModal, { type ContactMode } from '@/app/estimate/components/ContactRequestModal';
import type { HomeownerEstimate } from '@/lib/homeownerEstimateTypes';
import { useForceLightTheme } from '@/lib/hooks/useForceLightTheme';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLanguage } from '@/contexts/LanguageContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddressSuggestion {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

type PropertyEstimate = HomeownerEstimate;

interface ContactForm {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

interface QualificationForm {
  propertyType: string;
  rentalStatus: string;
  timelineInterest: string;
  smsConsent: boolean;
}

type Step = 'address' | 'estimate' | 'contact' | 'success';

// ─── Address Autocomplete ─────────────────────────────────────────────────────

function AddressAutocomplete({
  value,
  onChange,
  onSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (address: string, placeId: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value || value.length < 4) { setSuggestions([]); setOpen(false); return; }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value)}&format=json&addressdetails=1&limit=6&countrycodes=us`,
          { headers: { 'Accept-Language': 'en', 'User-Agent': 'TRAVLR-Estimate/1.0' } }
        );
        const data = await res.json();
        const mapped: AddressSuggestion[] = (data ?? [])
          .filter((item: any) => item.address?.house_number || item.address?.road)
          .map((item: any) => {
            const houseNum = item.address?.house_number || '';
            const road = item.address?.road || '';
            const mainText = houseNum ? `${houseNum} ${road}`.trim() : road || item.display_name.split(',')[0];
            const city = item.address?.city || item.address?.town || item.address?.village || '';
            const state = item.address?.state || '';
            const zip = item.address?.postcode || '';
            return {
              place_id: String(item.place_id),
              description: item.display_name,
              structured_formatting: {
                main_text: mainText,
                secondary_text: [city, state, zip].filter(Boolean).join(', '),
              },
            };
          });
        setSuggestions(mapped);
        setOpen(mapped.length > 0);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          value={value}
          onChange={e => { onChange(e.target.value); }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={t('estimate.addressPlaceholder')}
          className="w-full pl-10 pr-10 py-3.5 text-sm bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {loading && <Loader2 size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />}
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1.5 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          {suggestions.map(s => (
            <button
              key={s.place_id}
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                const fullAddress = `${s.structured_formatting.main_text}, ${s.structured_formatting.secondary_text}`;
                onChange(fullAddress);
                onSelect(fullAddress, s.place_id);
                setOpen(false);
                setSuggestions([]);
              }}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left border-b border-border/50 last:border-0"
            >
              <MapPin size={13} className="text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{s.structured_formatting.main_text}</p>
                <p className="text-xs text-muted-foreground truncate">{s.structured_formatting.secondary_text}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Estimate Card ────────────────────────────────────────────────────────────

function EstimateCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-4 border ${highlight ? 'bg-primary/5 border-primary/30' : 'bg-card border-border'}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Progress Steps ───────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: Step }) {
  const steps: Step[] = ['address', 'estimate', 'contact', 'success'];
  const currentIdx = steps.indexOf(step);
  const { t } = useLanguage();
  const labels = [t('estimate.step.address'), t('estimate.step.estimate'), t('estimate.step.contact'), t('estimate.step.done')];

  return (
    <div className="flex items-center gap-1 mb-6">
      {steps.slice(0, -1).map((s, i) => (
        <React.Fragment key={s}>
          <div className="flex flex-col items-center gap-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
              i < currentIdx ? 'bg-primary text-primary-foreground' :
              i === currentIdx ? 'bg-primary/20 text-primary border-2 border-primary': 'bg-muted text-muted-foreground'
            }`}>
              {i < currentIdx ? <CheckCircle size={13} /> : i + 1}
            </div>
            <span className={`text-[9px] font-medium ${i <= currentIdx ? 'text-primary' : 'text-muted-foreground'}`}>{labels[i]}</span>
          </div>
          {i < 2 && (
            <div className={`flex-1 h-0.5 mb-4 transition-colors ${i < currentIdx ? 'bg-primary' : 'bg-border'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Main Landing Page ────────────────────────────────────────────────────────

function EstimateLandingContent() {
  useForceLightTheme();
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const brand = resolveBrand(searchParams.get('brand')).key;
  const [step, setStep] = useState<Step>('address');
  const [addressInput, setAddressInput] = useState(searchParams.get('address') ?? '');
  const [selectedAddress, setSelectedAddress] = useState('');
  const [estimate, setEstimate] = useState<PropertyEstimate | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [estimateError, setEstimateError] = useState(false);
  const [emailed, setEmailed] = useState(false);
  const [equipment] = useState<EquipmentKey[] | null>(null);
  const [validating, setValidating] = useState(false);
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);
  const [emailKept, setEmailKept] = useState(false);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [contactOpen, setContactOpen] = useState(false);
  const [contactMode, setContactMode] = useState<ContactMode>('call');
  const openContact = (mode: ContactMode) => { setContactMode(mode); setContactOpen(true); trackEstimateEvent(mode === 'call' ? 'call_requested' : 'question_requested'); };
  const [contact, setContact] = useState<ContactForm>({ firstName: '', lastName: '', phone: '', email: '' });
  const [qualification, setQualification] = useState<QualificationForm>({
    propertyType: '',
    rentalStatus: '',
    timelineInterest: '',
    smsConsent: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [contactErrors, setContactErrors] = useState<Partial<ContactForm>>({});

  // Auto-trigger estimate if address param provided
  useEffect(() => {
    const addr = searchParams.get('address');
    if (addr) {
      setAddressInput(addr);
      setSelectedAddress(addr);
      handleGenerateEstimate(addr);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Journey tracking for visitors who arrived from a text link (?c=code). Does nothing for anyone else.
  useEffect(() => {
    if (!getTrackingContext()) return;
    trackEstimateEvent('page_view', { w: window.innerWidth, h: window.innerHeight, lang: navigator.language?.slice(0, 12) ?? '' });
    let maxScroll = 0; let visibleMs = 0; let since = document.visibilityState === 'visible' ? Date.now() : 0;
    const onScroll = () => { const el = document.documentElement; const pct = Math.round(((window.scrollY + window.innerHeight) / Math.max(el.scrollHeight, 1)) * 100); if (pct > maxScroll) maxScroll = pct; };
    const flush = () => {
      if (since) { visibleMs += Date.now() - since; since = 0; }
      trackEstimateEvent('time_on_page', { seconds: Math.round(visibleMs / 1000) });
      trackEstimateEvent('scroll_depth', { pct: Math.min(100, maxScroll) });
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); else since = Date.now(); };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute('href') ?? '';
      if (href.startsWith('tel:')) trackEstimateEvent('phone_clicked');
      else if (href.startsWith('mailto:')) trackEstimateEvent('email_clicked');
      else if (a.href.startsWith(WEBSITE_URL)) trackEstimateEvent('website_clicked');
      else if (/airbnb\.com|vrbo\.com|wsj\.com|palmspringslife\.com/.test(a.hostname)) trackEstimateEvent('credential_clicked', { site: a.hostname.replace(/^www\./, '') });
    };
    const onPrint = () => trackEstimateEvent('report_printed');
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    document.addEventListener('click', onClick);
    window.addEventListener('beforeprint', onPrint);
    return () => {
      window.removeEventListener('scroll', onScroll); document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush); document.removeEventListener('click', onClick); window.removeEventListener('beforeprint', onPrint);
    };
  }, []);

  useEffect(() => { if (estimate) trackEstimateEvent('estimate_shown', { net: Math.round(estimate.annualNet) }); }, [estimate]);
  useEffect(() => {
    if (step === 'contact') trackEstimateEvent('contact_started');
    else if (step === 'success') trackEstimateEvent('submitted');
  }, [step]);

  async function handleGenerateEstimate(addr?: string) {
    const address = addr ?? selectedAddress ?? addressInput;
    if (!address.trim()) { toast.error(t('estimate.pickAddress')); return; }
    setLoadingEstimate(true);
    setEstimateError(false);
    setEstimate(null);
    setStep('estimate');
    try {
      const res = await fetch('/api/estimate/property', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (data.estimate) {
        setEstimate(data.estimate);
      } else {
        throw new Error('No estimate returned');
      }
    } catch {
      setEstimateError(true);
    } finally {
      setLoadingEstimate(false);
    }
  }

  function validateContact(): boolean {
    const errors: Partial<ContactForm> = {};
    if (!contact.firstName.trim()) errors.firstName = t('estimate.required');
    if (!contact.phone.trim() || contact.phone.replace(/\D/g, '').length < 10) errors.phone = t('estimate.validPhone');
    if (!contact.email.trim() || !contact.email.includes('@')) errors.email = t('estimate.validEmail');
    setContactErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function checkContactOnServer(): Promise<boolean> {
    try {
      const res = await fetch('/api/estimate/validate-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: contact.email, phone: contact.phone, phoneRequired: true, keepEmail: emailKept }),
      });
      if (!res.ok) return true; // never block a homeowner because our checker is unavailable; the server re-checks on submit
      const data = await res.json();
      setEmailSuggestion(data.email?.suggestion ?? null);
      if (!data.ok) {
        setContactErrors(prev => ({ ...prev, email: data.errors?.email, phone: data.errors?.phone }));
        return false;
      }
      if (data.phone?.formatted) setContact(c => ({ ...c, phone: data.phone.formatted }));
      return true;
    } catch {
      return true;
    }
  }

  async function handleSubmitContact() {
    if (validating || !validateContact()) return;
    setValidating(true);
    const ok = await checkContactOnServer();
    setValidating(false);
    if (ok) await handleFinalSubmit();
  }

  async function checkEmailOnBlur() {
    if (!contact.email.includes('@')) return;
    try {
      const res = await fetch('/api/estimate/validate-contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: contact.email, keepEmail: emailKept }) });
      if (!res.ok) return;
      const data = await res.json();
      setEmailSuggestion(data.email?.suggestion ?? null);
      if (data.errors?.email) setContactErrors(prev => ({ ...prev, email: data.errors.email }));
    } catch { /* checked again on continue */ }
  }

  async function resendReport() {
    if (resendState === 'sending') return;
    setResendState('sending');
    try {
      const res = await fetch('/api/estimate/resend-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: selectedAddress || addressInput, email: contact.email, equipment: equipment ?? undefined }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.emailed) { setEmailed(true); setResendState('sent'); }
      else { setResendState('error'); toast.error(data.error || t('estimate.resendError')); }
    } catch {
      setResendState('error');
    }
  }

  async function handleFinalSubmit() {
    setSubmitting(true);
    // One name field: the first word is the first name, the rest the last name.
    const [firstName, ...rest] = contact.firstName.trim().split(/\s+/);
    const named = { ...contact, firstName, lastName: rest.join(' ') };
    setContact(named);
    try {
      const submitRes = await fetch('/api/estimate/submit-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: selectedAddress || addressInput,
          brand,
          estimate,
          contact: { ...named, emailConfirmed: emailKept },
          qualification: { ...qualification, equipment: equipment ?? undefined },
        }),
      });
      const submitData = await submitRes.json().catch(() => ({}));
      if (submitRes.status === 422 && submitData?.fields) {
        setContactErrors(prev => ({ ...prev, email: submitData.fields.email, phone: submitData.fields.phone }));
        setEmailSuggestion(submitData.suggestion ?? null);
        toast.error(submitData.error || t('estimate.checkDetails'));
        setStep('contact');
        return;
      }
      if (!submitRes.ok || !submitData?.success) {
        toast.error(submitData?.error || t('estimate.wentWrong'));
        return;
      }
      setEmailed(submitData.emailed === true);
      setStep('success');
    } catch {
      toast.error(t('estimate.wentWrong'));
    } finally {
      setSubmitting(false);
    }
  }

  const displayAddress = selectedAddress || addressInput;

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" />

      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-40 print:hidden">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/travlr-badge.png" alt="TRAVLR" width={36} height={36} className="w-9 h-9 object-contain" />
          <div>
            <p className="text-sm font-bold text-foreground">TRAVLR Vacation Homes</p>
            <p className="text-[10px] text-muted-foreground">{t('estimate.subtitle')}</p>
          </div>
          <a href={WEBSITE_URL} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:underline" aria-label={t('estimate.visitSite', { site: WEBSITE_LABEL })}>
            <Shield size={12} className="text-emerald-600" />
            <span>{WEBSITE_LABEL}</span>
            <ExternalLink size={10} />
          </a>
          <LanguageSwitcher compact />
        </div>
      </header>

      <main className={`${step === 'success' ? 'max-w-4xl' : 'max-w-2xl'} mx-auto px-4 py-8 space-y-6 print:max-w-none print:p-0`}>

        {/* Progress bar (hide on success) */}
        {step !== 'success' && <ProgressBar step={step} />}

        {/* ── Step: Address ── */}
        {step === 'address' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold text-foreground">{t('estimate.addressTitle')}</h1>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {t('estimate.addressIntro')}
              </p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm">
              <AddressAutocomplete
                value={addressInput}
                onChange={setAddressInput}
                onSelect={(addr) => setSelectedAddress(addr)}
              />
              {addressInput && !selectedAddress && (
                <p className="text-[11px] text-amber-800 flex items-center gap-1.5">
                  <AlertCircle size={11} />
                  {t('estimate.selectHint')}
                </p>
              )}
              <button
                onClick={() => handleGenerateEstimate()}
                disabled={!addressInput.trim()}
                className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
              >
                <TrendingUp size={15} />
                {t('estimate.getEstimate')}
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Trust signals */}
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { icon: <CheckCircle size={16} className="text-emerald-500" />, label: t('estimate.noObligation') },
                { icon: <Shield size={16} className="text-blue-500" />, label: t('estimate.privateSecure') },
                { icon: <DollarSign size={16} className="text-primary" />, label: t('estimate.instantResults') },
              ].map(({ icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-1.5 py-3 bg-card border border-border rounded-xl">
                  {icon}
                  <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Step: Estimate ── */}
        {step === 'estimate' && (
          <div className="space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <MapPin size={13} className="text-primary" />
                <p className="text-xs text-muted-foreground truncate">{displayAddress}</p>
              </div>
              <h2 className="text-xl font-bold text-foreground">{t('estimate.yourEstimate')}</h2>
            </div>

            {loadingEstimate ? (
              <div className="bg-card border border-border rounded-2xl p-12 flex flex-col items-center gap-4">
                <Loader2 size={28} className="text-primary animate-spin" />
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">{t('estimate.calculating')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('estimate.analyzing')}</p>
                </div>
              </div>
            ) : estimate ? (
              <>
                <button
                  onClick={() => setStep('contact')}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2"
                >
                  {t('estimate.emailFull')}
                  <ChevronRight size={14} />
                </button>
                <HomeownerReportView report={estimate.report} variant="preview" afterEstimate={<QuickRequest />} />
                <div className="rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground leading-relaxed">
                  {t('estimate.fullReportAdds')}
                </div>

                <button
                  onClick={() => setStep('contact')}
                  className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2"
                >
                  {t('estimate.getFullReport')}
                  <ChevronRight size={14} />
                </button>
                <button onClick={() => openContact('question')} className="w-full text-sm font-semibold text-primary hover:underline text-center py-1">
                  {t('estimate.haveQuestion')}
                </button>
                <button onClick={() => { setStep('address'); setSelectedAddress(''); }} className="w-full text-xs text-muted-foreground hover:text-foreground text-center py-1 transition-colors">
                  ← Try a different address
                </button>
              </>
            ) : (
              <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-3">
                <AlertCircle size={22} className="text-amber-500 mx-auto" />
                <p className="text-sm font-semibold text-foreground">{t('estimate.couldntBuild')}</p>
                <p className="text-xs text-muted-foreground">{t('estimate.checkAddress')}</p>
                <button onClick={() => handleGenerateEstimate(displayAddress)} className="text-xs font-semibold text-primary hover:underline">{t('estimate.tryAgain')}</button>
                <button onClick={() => { setStep('address'); setSelectedAddress(''); }} className="block w-full text-xs text-muted-foreground hover:text-foreground">{t('estimate.tryDifferent')}</button>
              </div>
            )}
          </div>
        )}

        {/* ── Step: Contact ── */}
        {step === 'contact' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-foreground">{t('estimate.whereSend')}</h2>
              <p className="text-sm text-muted-foreground mt-1">{t('estimate.sendDetailed')}</p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">{t('estimate.name')} *</label>
                <input
                  value={contact.firstName}
                  onChange={e => { setContact(c => ({ ...c, firstName: e.target.value })); setContactErrors(er => ({ ...er, firstName: undefined })); }}
                  placeholder="Jane Smith"
                  autoComplete="name"
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all ${contactErrors.firstName ? 'border-red-400' : 'border-border'}`}
                />
                {contactErrors.firstName && <p className="text-[10px] text-red-500 mt-1">{contactErrors.firstName}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">{t('estimate.phone')} *</label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input
                    value={contact.phone}
                    onChange={e => { setContact(c => ({ ...c, phone: e.target.value })); setContactErrors(er => ({ ...er, phone: undefined })); }}
                    placeholder="(555) 000-0000"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    className={`w-full pl-9 pr-3 py-2.5 rounded-lg border text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all ${contactErrors.phone ? 'border-red-400' : 'border-border'}`}
                  />
                </div>
                {contactErrors.phone && <p className="text-[10px] text-red-500 mt-1">{contactErrors.phone}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">{t('estimate.email')} *</label>
                <input
                  value={contact.email}
                  onChange={e => { setContact(c => ({ ...c, email: e.target.value })); setContactErrors(er => ({ ...er, email: undefined })); setEmailSuggestion(null); setEmailKept(false); }}
                  onBlur={checkEmailOnBlur}
                  placeholder="jane@example.com"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all ${contactErrors.email ? 'border-red-400' : 'border-border'}`}
                />
                {contactErrors.email && <p className="text-[11px] text-red-500 mt-1">{contactErrors.email}</p>}
                {emailSuggestion && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <button type="button" onClick={() => { setContact(c => ({ ...c, email: emailSuggestion })); setEmailSuggestion(null); setContactErrors(er => ({ ...er, email: undefined })); }}
                      className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-semibold">{t('estimate.useEmail', { email: emailSuggestion })}</button>
                    <button type="button" onClick={() => { setEmailKept(true); setEmailSuggestion(null); setContactErrors(er => ({ ...er, email: undefined })); }}
                      className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted">{t('estimate.keepTyped')}</button>
                  </div>
                )}
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={qualification.smsConsent}
                  onChange={e => setQualification(q => ({ ...q, smsConsent: e.target.checked }))}
                  className="mt-0.5 w-4 h-4 rounded border-border text-primary focus:ring-primary/30"
                />
                <span className="text-[11px] text-muted-foreground leading-relaxed">
                  {t('estimate.smsConsent')}
                </span>
              </label>

              <button
                onClick={handleSubmitContact}
                disabled={validating || submitting}
                className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-70 transition-all flex items-center justify-center gap-2"
              >
                {validating || submitting ? <><Loader2 size={14} className="animate-spin" /> {submitting ? t('estimate.sending') : t('estimate.checking')}</> : <>{t('estimate.sendReport')}<ChevronRight size={14} /></>}
              </button>
              <p className="text-[10px] text-muted-foreground text-center">
                {t('estimate.agree', { brand: 'TRAVLR Vacation Homes' })}
              </p>
            </div>
          </div>
        )}

        {/* ── Step: Success ── */}
        {step === 'success' && (
          <div className="space-y-6">
            <div className="text-center space-y-2 print:hidden">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle size={28} className="text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">{t('estimate.reportReady', { name: contact.firstName })}</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {emailed ? t('estimate.emailedCopy', { email: contact.email }) : t('estimate.emailFailed')} {t('estimate.specialist', { brand: 'TRAVLR' })}
              </p>
              <p className="text-xs text-muted-foreground">
                {resendState === 'sent' ? t('estimate.resendSent') : emailed ? t('estimate.checkSpam') : ''}
                {resendState !== 'sent' && (
                  <button onClick={resendReport} disabled={resendState === 'sending'} className="text-primary font-semibold hover:underline disabled:opacity-60">
                    {resendState === 'sending' ? t('estimate.resendSending') : emailed ? t('estimate.resendAgain') : t('estimate.resendRetry')}
                  </button>
                )}
              </p>
              <div className="pt-2"><ReportActions address={displayAddress} equipment={equipment} onSchedule={() => openContact('call')} align="center" /></div>
            </div>
            {estimate && <HomeownerReportView report={estimate.report} variant="full" equipment={equipment} onContact={openContact} onPrint={() => window.print()} />}
          </div>
        )}

        {step !== 'success' && (
          <>
            <WhyTravlrCard className="print:hidden" />
            <TrustCard className="print:hidden" />
          </>
        )}
      </main>
      {estimate && (step === 'estimate' || step === 'success') && (
        <ReportChat address={displayAddress} equipment={equipment} onTalkToPerson={() => openContact('question')} />
      )}
      <ContactRequestModal open={contactOpen} onClose={() => setContactOpen(false)} address={displayAddress} initialMode={contactMode} prefill={contact} />
    </div>
  );
}

export default function EstimatePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 size={24} className="text-primary animate-spin" />
      </div>
    }>
      <EstimateLandingContent />
    </Suspense>
  );
}
