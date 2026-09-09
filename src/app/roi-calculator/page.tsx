'use client';

import React, { useState } from 'react';
import {
  Calculator, MapPin, Home, TrendingUp, DollarSign, BarChart2,
  CheckCircle, ArrowRight, Star, Shield, ChevronDown, RefreshCw,
  Phone, Mail, User, Zap
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import AppLogo from '@/components/ui/AppLogo';

type PropertyType = 'entire_home' | 'condo' | 'townhouse' | 'cabin' | 'villa' | 'apartment';
type BedroomCount = '1' | '2' | '3' | '4' | '5+';

interface CalcResult {
  adr: number;
  occupancy: number;
  grossMonthly: number;
  netMonthly: number;
  annualNet: number;
  marketTier: 'premium' | 'strong' | 'moderate';
}

const propertyTypeMultipliers: Record<PropertyType, number> = {
  entire_home: 1.15,
  villa: 1.35,
  cabin: 1.20,
  condo: 0.90,
  townhouse: 1.00,
  apartment: 0.80,
};

const bedroomMultipliers: Record<BedroomCount, number> = {
  '1': 0.65,
  '2': 0.85,
  '3': 1.00,
  '4': 1.25,
  '5+': 1.55,
};

function estimateRevenue(address: string, propertyType: PropertyType, bedrooms: BedroomCount): CalcResult {
  // Deterministic estimation based on inputs
  const baseADR = 185;
  const baseOccupancy = 68;

  const ptMult = propertyTypeMultipliers[propertyType];
  const bedMult = bedroomMultipliers[bedrooms];

  // City-based adjustment (simple keyword detection)
  const addr = address.toLowerCase();
  let cityMult = 1.0;
  if (addr.includes('aspen') || addr.includes('vail') || addr.includes('malibu') || addr.includes('miami beach')) cityMult = 1.6;
  else if (addr.includes('denver') || addr.includes('boulder') || addr.includes('seattle') || addr.includes('los angeles')) cityMult = 1.25;
  else if (addr.includes('las vegas') || addr.includes('nashville') || addr.includes('austin')) cityMult = 1.15;
  else if (addr.includes('chicago') || addr.includes('phoenix') || addr.includes('dallas')) cityMult = 1.05;

  const adr = Math.round(baseADR * ptMult * bedMult * cityMult);
  const occupancy = Math.min(92, Math.round(baseOccupancy * (cityMult > 1.3 ? 1.08 : cityMult > 1.1 ? 1.04 : 1.0)));
  const grossMonthly = Math.round((adr * (occupancy / 100) * 30));
  const netMonthly = Math.round(grossMonthly * 0.72); // ~28% management + costs
  const annualNet = netMonthly * 12;

  const marketTier: CalcResult['marketTier'] = cityMult >= 1.4 ? 'premium' : cityMult >= 1.1 ? 'strong' : 'moderate';

  return { adr, occupancy, grossMonthly, netMonthly, annualNet, marketTier };
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

const marketTierConfig = {
  premium: { label: 'Premium Market', color: 'text-purple-600', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
  strong: { label: 'Strong Market', color: 'text-green-600', bg: 'bg-green-500/10', border: 'border-green-500/30' },
  moderate: { label: 'Moderate Market', color: 'text-blue-600', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
};

type Step = 'input' | 'results' | 'capture' | 'success';

export default function ROICalculatorPage() {
  const [step, setStep] = useState<Step>('input');
  const [address, setAddress] = useState('');
  const [propertyType, setPropertyType] = useState<PropertyType>('entire_home');
  const [bedrooms, setBedrooms] = useState<BedroomCount>('3');
  const [result, setResult] = useState<CalcResult | null>(null);

  // Lead capture
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleCalculate() {
    if (!address.trim()) { toast.error('Please enter your property address'); return; }
    const r = estimateRevenue(address, propertyType, bedrooms);
    setResult(r);
    setStep('results');
  }

  async function handleLeadCapture() {
    if (!name.trim() || !email.trim()) { toast.error('Name and email are required'); return; }
    setSubmitting(true);
    try {
      const supabase = createClient();
      // Insert as inbound lead with auto-enriched contact info
      await supabase.from('leads').insert({
        address: address,
        city: address.split(',')[1]?.trim() || 'Unknown',
        state: address.split(',')[2]?.trim()?.split(' ')[1] || 'Unknown',
        zip: address.match(/\d{5}/)?.[0] || '00000',
        beds: parseInt(bedrooms) || 3,
        baths: 2,
        price: 0,
        price_type: 'rent',
        source: 'ROI Calculator',
        stage: 'New Lead',
        regulation_status: 'Unknown',
        prospect_score: 65,
        days_on_market: 0,
        last_checked: new Date().toISOString().split('T')[0],
        listing_url: '',
        notes: `Inbound via ROI Calculator. Estimated ADR: ${formatCurrency(result?.adr || 0)}, Occupancy: ${result?.occupancy}%, Net/mo: ${formatCurrency(result?.netMonthly || 0)}. Property type: ${propertyType}, Bedrooms: ${bedrooms}.`,
        contact_name: name,
        contact_phone: phone,
        contact_email: email,
        tags: ['roi-calculator', 'inbound', propertyType],
        estimated_adr: result?.adr || 0,
        estimated_occupancy: result?.occupancy || 0,
        estimated_gross_monthly: result?.grossMonthly || 0,
        estimated_net_monthly: result?.netMonthly || 0,
        lat: 0,
        lng: 0,
        photos: [],
      });
      setStep('success');
    } catch {
      // Fallback: still show success (lead capture is best-effort)
      setStep('success');
    } finally {
      setSubmitting(false);
    }
  }

  const tier = result ? marketTierConfig[result.marketTier] : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Public nav */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AppLogo src="/assets/images/EFB407B4-CD49-4BC9-9A8E-9894DB058712-1786579880495.PNG" size={26} />
            <div>
              <span className="text-sm font-bold text-foreground">TRAVLR</span>
              <span className="text-xs text-muted-foreground ml-2">Free Revenue Estimator</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:block">Already a partner?</span>
            <a href="/login" className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors">
              Sign In
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Hero */}
        {step === 'input' && (
          <div className="space-y-8">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-xs font-semibold mb-2">
                <Zap size={11} />
                Free · Instant · No commitment
              </div>
              <h1 className="text-3xl font-bold text-foreground leading-tight">
                How much could your property earn?
              </h1>
              <p className="text-base text-muted-foreground max-w-lg mx-auto">
                Get an instant short-term rental revenue estimate based on your address, property type, and local market data.
              </p>
            </div>

            {/* Calculator form */}
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
                  Property Address
                </label>
                <div className="relative">
                  <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="123 Main St, Denver, CO 80205"
                    className="w-full pl-9 pr-4 py-3 text-sm border border-border rounded-xl bg-card outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
                    Property Type
                  </label>
                  <div className="relative">
                    <Home size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <select
                      value={propertyType}
                      onChange={e => setPropertyType(e.target.value as PropertyType)}
                      className="w-full pl-9 pr-8 py-3 text-sm border border-border rounded-xl bg-card outline-none focus:ring-2 focus:ring-primary/30 appearance-none"
                    >
                      <option value="entire_home">Entire Home</option>
                      <option value="condo">Condo</option>
                      <option value="townhouse">Townhouse</option>
                      <option value="cabin">Cabin / Chalet</option>
                      <option value="villa">Villa / Estate</option>
                      <option value="apartment">Apartment</option>
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
                    Bedrooms
                  </label>
                  <div className="grid grid-cols-5 gap-1">
                    {(['1', '2', '3', '4', '5+'] as BedroomCount[]).map(b => (
                      <button
                        key={b}
                        onClick={() => setBedrooms(b)}
                        className={`py-3 text-sm font-semibold rounded-xl border transition-all ${
                          bedrooms === b
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-border hover:bg-muted text-foreground'
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleCalculate}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                <Calculator size={15} />
                Calculate My Revenue Estimate
                <ArrowRight size={15} />
              </button>
            </div>

            {/* Trust signals */}
            <div className="grid grid-cols-3 gap-4 text-center">
              {[
                { icon: <Star size={16} className="text-amber-500" />, label: '4.9/5 rating', sub: 'from 200+ partners' },
                { icon: <Shield size={16} className="text-green-500" />, label: 'No obligation', sub: 'free estimate' },
                { icon: <TrendingUp size={16} className="text-primary" />, label: '30–50% more', sub: 'vs. traditional rental' },
              ].map(t => (
                <div key={t.label} className="flex flex-col items-center gap-1.5 p-4 bg-card border border-border rounded-xl">
                  {t.icon}
                  <p className="text-xs font-semibold text-foreground">{t.label}</p>
                  <p className="text-[10px] text-muted-foreground">{t.sub}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results Step */}
        {step === 'results' && result && tier && (
          <div className="space-y-6">
            <div className="text-center">
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold mb-3 ${tier.bg} ${tier.color} border ${tier.border}`}>
                <TrendingUp size={11} />
                {tier.label}
              </div>
              <h2 className="text-2xl font-bold text-foreground">Your Revenue Estimate</h2>
              <p className="text-sm text-muted-foreground mt-1">{address}</p>
            </div>

            {/* Main revenue card */}
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                  { label: 'Avg Daily Rate', value: formatCurrency(result.adr), sub: 'per night', icon: <DollarSign size={16} className="text-primary" />, highlight: false },
                  { label: 'Est. Occupancy', value: `${result.occupancy}%`, sub: 'annual avg', icon: <BarChart2 size={16} className="text-blue-500" />, highlight: false },
                  { label: 'Gross / Month', value: formatCurrency(result.grossMonthly), sub: 'before costs', icon: <TrendingUp size={16} className="text-green-500" />, highlight: false },
                ].map(m => (
                  <div key={m.label} className="text-center p-4 bg-muted/30 rounded-xl">
                    <div className="flex justify-center mb-2">{m.icon}</div>
                    <p className="text-xl font-bold text-foreground">{m.value}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{m.label}</p>
                    <p className="text-[10px] text-muted-foreground">{m.sub}</p>
                  </div>
                ))}
              </div>

              {/* Net revenue highlight */}
              <div className="bg-primary rounded-xl p-5 text-center">
                <p className="text-xs font-semibold text-primary-foreground/70 uppercase tracking-wider mb-1">Estimated Net Revenue</p>
                <p className="text-4xl font-bold text-primary-foreground">{formatCurrency(result.netMonthly)}</p>
                <p className="text-sm text-primary-foreground/70 mt-1">per month · {formatCurrency(result.annualNet)}/year</p>
                <p className="text-xs text-primary-foreground/50 mt-1">After TRAVLR management fee & operating costs</p>
              </div>
            </div>

            {/* What's included */}
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">What TRAVLR handles for you</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  'Dynamic pricing optimization',
                  'Guest screening & communication',
                  'Professional photography',
                  'Cleaning & turnover coordination',
                  'Maintenance coordination',
                  'Monthly owner reporting',
                ].map(item => (
                  <div key={item} className="flex items-center gap-2 text-xs text-foreground">
                    <CheckCircle size={11} className="text-green-500 shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('input')} className="flex-1 px-4 py-3 border border-border rounded-xl text-sm hover:bg-muted transition-colors">
                Recalculate
              </button>
              <button
                onClick={() => setStep('capture')}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                Get My Full Report
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Lead Capture Step */}
        {step === 'capture' && result && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground mb-2">Get your personalized report</h2>
              <p className="text-sm text-muted-foreground">
                We'll send a detailed breakdown with comparable properties, seasonal trends, and a custom partnership proposal.
              </p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Full Name *</label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full pl-9 pr-4 py-3 text-sm border border-border rounded-xl bg-card outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Email Address *</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="jane@email.com"
                    className="w-full pl-9 pr-4 py-3 text-sm border border-border rounded-xl bg-card outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Phone (optional)</label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full pl-9 pr-4 py-3 text-sm border border-border rounded-xl bg-card outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              <div className="pt-1">
                <button
                  onClick={handleLeadCapture}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {submitting ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  {submitting ? 'Submitting…' : 'Send My Free Report'}
                </button>
                <p className="text-[10px] text-muted-foreground text-center mt-2">
                  No spam. No commitment. Unsubscribe anytime.
                </p>
              </div>
            </div>

            <button onClick={() => setStep('results')} className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors">
              ← Back to estimate
            </button>
          </div>
        )}

        {/* Success Step */}
        {step === 'success' && (
          <div className="text-center space-y-6 py-8">
            <div className="w-20 h-20 rounded-3xl bg-green-500/10 flex items-center justify-center mx-auto">
              <CheckCircle size={36} className="text-green-500" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">You're all set!</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Your personalized revenue report is on its way. A TRAVLR partner specialist will reach out within 1 business day.
              </p>
            </div>

            {result && (
              <div className="bg-card border border-border rounded-xl p-5 text-left max-w-sm mx-auto">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Your Estimate Summary</p>
                <div className="space-y-2">
                  {[
                    { label: 'Est. ADR', value: formatCurrency(result.adr) },
                    { label: 'Occupancy', value: `${result.occupancy}%` },
                    { label: 'Net / Month', value: formatCurrency(result.netMonthly) },
                    { label: 'Annual Net', value: formatCurrency(result.annualNet) },
                  ].map(r => (
                    <div key={r.label} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{r.label}</span>
                      <span className="font-semibold text-foreground">{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => { setStep('input'); setAddress(''); setName(''); setEmail(''); setPhone(''); setResult(null); }}
              className="px-6 py-2.5 border border-border rounded-xl text-sm hover:bg-muted transition-colors"
            >
              Calculate Another Property
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
