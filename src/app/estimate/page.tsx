'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { MapPin, DollarSign, TrendingUp, Shield, ChevronRight, CheckCircle, Loader2, Phone, Home, Star, Building2, Calendar, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Toaster } from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddressSuggestion {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface PropertyEstimate {
  estimatedADR: number;
  estimatedOccupancy: number;
  grossMonthly: number;
  netMonthly: number;
  annualNet: number;
  regulationSummary: string;
  regulationStatus: 'permitted' | 'restricted' | 'unknown';
}

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

type Step = 'address' | 'estimate' | 'contact' | 'questionnaire' | 'success';

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
          placeholder="Start typing your property address…"
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
  const steps: Step[] = ['address', 'estimate', 'contact', 'questionnaire', 'success'];
  const currentIdx = steps.indexOf(step);
  const labels = ['Address', 'Estimate', 'Contact', 'Details', 'Done'];

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
          {i < 3 && (
            <div className={`flex-1 h-0.5 mb-4 transition-colors ${i < currentIdx ? 'bg-primary' : 'bg-border'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Main Landing Page ────────────────────────────────────────────────────────

function EstimateLandingContent() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>('address');
  const [addressInput, setAddressInput] = useState(searchParams.get('address') ?? '');
  const [selectedAddress, setSelectedAddress] = useState('');
  const [estimate, setEstimate] = useState<PropertyEstimate | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
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

  async function handleGenerateEstimate(addr?: string) {
    const address = addr ?? selectedAddress ?? addressInput;
    if (!address.trim()) { toast.error('Please select an address from the suggestions'); return; }
    setLoadingEstimate(true);
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
      // Fallback estimate
      setEstimate({
        estimatedADR: 185,
        estimatedOccupancy: 68,
        grossMonthly: 3774,
        netMonthly: 2850,
        annualNet: 34200,
        regulationSummary: 'Short-term rentals are generally permitted in this area with a local business license. Verify current regulations with your municipality.',
        regulationStatus: 'permitted',
      });
    } finally {
      setLoadingEstimate(false);
    }
  }

  function validateContact(): boolean {
    const errors: Partial<ContactForm> = {};
    if (!contact.firstName.trim()) errors.firstName = 'Required';
    if (!contact.lastName.trim()) errors.lastName = 'Required';
    if (!contact.phone.trim() || contact.phone.replace(/\D/g, '').length < 10) errors.phone = 'Valid phone required';
    if (!contact.email.trim() || !contact.email.includes('@')) errors.email = 'Valid email required';
    setContactErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmitContact() {
    if (!validateContact()) return;
    setStep('questionnaire');
  }

  async function handleFinalSubmit() {
    setSubmitting(true);
    try {
      await fetch('/api/estimate/submit-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: selectedAddress || addressInput,
          estimate,
          contact,
          qualification,
        }),
      });
      setStep('success');
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const displayAddress = selectedAddress || addressInput;

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" />

      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Home size={16} className="text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">TRAVLR Vacation Homes</p>
            <p className="text-[10px] text-muted-foreground">Free Instant Property Estimate</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Star size={11} className="text-amber-400 fill-amber-400" />
            <span className="font-medium">4.9 · 2,400+ homeowners</span>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Progress bar (hide on success) */}
        {step !== 'success' && <ProgressBar step={step} />}

        {/* ── Step: Address ── */}
        {step === 'address' && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold text-foreground">What could your home earn?</h1>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Get an instant, free estimate of your property's vacation rental potential — ADR, occupancy, and net monthly income.
              </p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm">
              <AddressAutocomplete
                value={addressInput}
                onChange={setAddressInput}
                onSelect={(addr) => setSelectedAddress(addr)}
              />
              {addressInput && !selectedAddress && (
                <p className="text-[11px] text-amber-600 flex items-center gap-1.5">
                  <AlertCircle size={11} />
                  Select an address from the dropdown for the most accurate estimate
                </p>
              )}
              <button
                onClick={() => handleGenerateEstimate()}
                disabled={!addressInput.trim()}
                className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
              >
                <TrendingUp size={15} />
                Get My Free Estimate
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Trust signals */}
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { icon: <CheckCircle size={16} className="text-emerald-500" />, label: 'No obligation' },
                { icon: <Shield size={16} className="text-blue-500" />, label: 'Private & secure' },
                { icon: <DollarSign size={16} className="text-primary" />, label: 'Instant results' },
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
              <h2 className="text-xl font-bold text-foreground">Your Estimate</h2>
            </div>

            {loadingEstimate ? (
              <div className="bg-card border border-border rounded-2xl p-12 flex flex-col items-center gap-4">
                <Loader2 size={28} className="text-primary animate-spin" />
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">Calculating your estimate…</p>
                  <p className="text-xs text-muted-foreground mt-1">Analyzing market data for your area</p>
                </div>
              </div>
            ) : estimate ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <EstimateCard label="Avg Daily Rate (ADR)" value={`$${estimate.estimatedADR}`} sub="per night" />
                  <EstimateCard label="Occupancy Rate" value={`${estimate.estimatedOccupancy}%`} sub="avg nights booked" />
                  <EstimateCard label="Gross Monthly" value={`$${estimate.grossMonthly.toLocaleString()}`} sub="before expenses" />
                  <EstimateCard label="Net Monthly" value={`$${estimate.netMonthly.toLocaleString()}`} sub="after mgmt & costs" highlight />
                </div>

                <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Estimated Annual Net</p>
                    <p className="text-2xl font-bold text-primary">${estimate.annualNet.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground">Based on {estimate.estimatedOccupancy}% occupancy</p>
                    <p className="text-[10px] text-muted-foreground">at ${estimate.estimatedADR}/night ADR</p>
                  </div>
                </div>

                {/* Regulation status */}
                <div className={`rounded-xl p-4 border flex items-start gap-3 ${
                  estimate.regulationStatus === 'permitted' ? 'bg-emerald-50 border-emerald-200' :
                  estimate.regulationStatus === 'restricted'? 'bg-amber-50 border-amber-200' : 'bg-muted border-border'
                }`}>
                  <Shield size={15} className={
                    estimate.regulationStatus === 'permitted' ? 'text-emerald-600 shrink-0 mt-0.5' :
                    estimate.regulationStatus === 'restricted'? 'text-amber-600 shrink-0 mt-0.5' : 'text-muted-foreground shrink-0 mt-0.5'
                  } />
                  <div>
                    <p className={`text-xs font-semibold mb-0.5 ${
                      estimate.regulationStatus === 'permitted' ? 'text-emerald-800' :
                      estimate.regulationStatus === 'restricted'? 'text-amber-800' : 'text-foreground'
                    }`}>
                      {estimate.regulationStatus === 'permitted' ? 'STR Generally Permitted' :
                       estimate.regulationStatus === 'restricted'? 'STR Restrictions Apply' : 'Regulations Vary'}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{estimate.regulationSummary}</p>
                  </div>
                </div>

                <button
                  onClick={() => setStep('contact')}
                  className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2"
                >
                  Claim This Estimate — It's Free
                  <ChevronRight size={14} />
                </button>
                <button onClick={() => { setStep('address'); setSelectedAddress(''); }} className="w-full text-xs text-muted-foreground hover:text-foreground text-center py-1 transition-colors">
                  ← Try a different address
                </button>
              </>
            ) : null}
          </div>
        )}

        {/* ── Step: Contact ── */}
        {step === 'contact' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-foreground">Where should we send your report?</h2>
              <p className="text-sm text-muted-foreground mt-1">We'll send a detailed breakdown to your inbox — no spam, ever.</p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">First Name *</label>
                  <input
                    value={contact.firstName}
                    onChange={e => { setContact(c => ({ ...c, firstName: e.target.value })); setContactErrors(er => ({ ...er, firstName: undefined })); }}
                    placeholder="Jane"
                    className={`w-full px-3 py-2.5 rounded-lg border text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all ${contactErrors.firstName ? 'border-red-400' : 'border-border'}`}
                  />
                  {contactErrors.firstName && <p className="text-[10px] text-red-500 mt-1">{contactErrors.firstName}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Last Name *</label>
                  <input
                    value={contact.lastName}
                    onChange={e => { setContact(c => ({ ...c, lastName: e.target.value })); setContactErrors(er => ({ ...er, lastName: undefined })); }}
                    placeholder="Smith"
                    className={`w-full px-3 py-2.5 rounded-lg border text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all ${contactErrors.lastName ? 'border-red-400' : 'border-border'}`}
                  />
                  {contactErrors.lastName && <p className="text-[10px] text-red-500 mt-1">{contactErrors.lastName}</p>}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Phone *</label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input
                    value={contact.phone}
                    onChange={e => { setContact(c => ({ ...c, phone: e.target.value })); setContactErrors(er => ({ ...er, phone: undefined })); }}
                    placeholder="(555) 000-0000"
                    type="tel"
                    className={`w-full pl-9 pr-3 py-2.5 rounded-lg border text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all ${contactErrors.phone ? 'border-red-400' : 'border-border'}`}
                  />
                </div>
                {contactErrors.phone && <p className="text-[10px] text-red-500 mt-1">{contactErrors.phone}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Email *</label>
                <input
                  value={contact.email}
                  onChange={e => { setContact(c => ({ ...c, email: e.target.value })); setContactErrors(er => ({ ...er, email: undefined })); }}
                  placeholder="jane@example.com"
                  type="email"
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all ${contactErrors.email ? 'border-red-400' : 'border-border'}`}
                />
                {contactErrors.email && <p className="text-[10px] text-red-500 mt-1">{contactErrors.email}</p>}
              </div>

              <button
                onClick={handleSubmitContact}
                className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2"
              >
                Continue
                <ChevronRight size={14} />
              </button>
              <p className="text-[10px] text-muted-foreground text-center">
                By continuing, you agree to be contacted by TRAVLR Vacation Homes. We respect your privacy.
              </p>
            </div>
          </div>
        )}

        {/* ── Step: Questionnaire ── */}
        {step === 'questionnaire' && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-foreground">A few quick questions</h2>
              <p className="text-sm text-muted-foreground mt-1">Help us personalize your estimate and match you with the right specialist.</p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Building2 size={12} />Property Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {['Single-Family Home', 'Condo / Townhome', 'Cabin / Chalet', 'Multi-Unit'].map(opt => (
                    <button
                      key={opt}
                      onClick={() => setQualification(q => ({ ...q, propertyType: opt }))}
                      className={`py-2.5 px-3 rounded-lg border text-xs font-medium transition-all text-left ${qualification.propertyType === opt ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border text-muted-foreground hover:border-primary/40'}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Home size={12} />Current Rental Status
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {['Owner-occupied', 'Long-term rental', 'Vacant', 'Already STR'].map(opt => (
                    <button
                      key={opt}
                      onClick={() => setQualification(q => ({ ...q, rentalStatus: opt }))}
                      className={`py-2.5 px-3 rounded-lg border text-xs font-medium transition-all text-left ${qualification.rentalStatus === opt ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border text-muted-foreground hover:border-primary/40'}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Calendar size={12} />Timeline Interest
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {['ASAP', 'Within 3 months', '3–6 months', 'Just exploring'].map(opt => (
                    <button
                      key={opt}
                      onClick={() => setQualification(q => ({ ...q, timelineInterest: opt }))}
                      className={`py-2.5 px-3 rounded-lg border text-xs font-medium transition-all text-left ${qualification.timelineInterest === opt ? 'bg-primary/10 border-primary text-primary' : 'bg-background border-border text-muted-foreground hover:border-primary/40'}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* SMS consent */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={qualification.smsConsent}
                  onChange={e => setQualification(q => ({ ...q, smsConsent: e.target.checked }))}
                  className="mt-0.5 w-4 h-4 rounded border-border text-primary focus:ring-primary/30"
                />
                <span className="text-[11px] text-muted-foreground leading-relaxed">
                  I agree to receive SMS updates from TRAVLR Vacation Homes. Message & data rates may apply. Reply STOP to opt out.
                </span>
              </label>

              <button
                onClick={handleFinalSubmit}
                disabled={submitting}
                className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {submitting ? <><Loader2 size={14} className="animate-spin" />Submitting…</> : <>Submit & Get My Report <ChevronRight size={14} /></>}
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Success ── */}
        {step === 'success' && (
          <div className="text-center space-y-6 py-8">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <CheckCircle size={32} className="text-emerald-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-foreground">You're all set, {contact.firstName}!</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                A TRAVLR specialist will reach out within 1 business day with your personalized property report.
              </p>
            </div>

            {estimate && (
              <div className="bg-card border border-border rounded-2xl p-5 text-left space-y-3 max-w-sm mx-auto">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your Estimate Summary</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Net Monthly</span>
                    <span className="font-bold text-primary">${estimate.netMonthly.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Annual Net</span>
                    <span className="font-semibold text-foreground">${estimate.annualNet.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">ADR</span>
                    <span className="font-semibold text-foreground">${estimate.estimatedADR}/night</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Occupancy</span>
                    <span className="font-semibold text-foreground">{estimate.estimatedOccupancy}%</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Star size={12} className="text-amber-400 fill-amber-400" />
              <span>Trusted by 2,400+ homeowners across the US</span>
            </div>
          </div>
        )}
      </main>
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
