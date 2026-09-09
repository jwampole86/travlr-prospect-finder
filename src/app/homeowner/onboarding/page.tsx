'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  CheckCircle2, CreditCard, Calendar, DollarSign, Home, ChevronRight,
  ChevronLeft, Loader2, Plus, Trash2, AlertCircle, Zap, Shield
} from 'lucide-react';

interface BlackoutDate {
  id: string;
  start: string;
  end: string;
  label: string;
}

interface OnboardingData {
  bankAccountName: string;
  bankRoutingNumber: string;
  bankAccountNumberLast4: string;
  bankAccountType: 'checking' | 'savings';
  payoutFrequency: 'monthly' | 'biweekly';
  blackoutDates: BlackoutDate[];
}

const STEPS = [
  { id: 1, label: 'Bank Details', icon: CreditCard, description: 'Confirm your payout account' },
  { id: 2, label: 'Blackout Dates', icon: Calendar, description: 'Set personal-use dates' },
  { id: 3, label: 'Payout Frequency', icon: DollarSign, description: 'Choose payout schedule' },
  { id: 4, label: 'Activate Listing', icon: Home, description: 'Go live on TRAVLR' },
];

function HomeownerOnboardingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

  const leadId = searchParams.get('leadId') ?? '';
  const stripeReturn = searchParams.get('stripe');

  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [onboardingId, setOnboardingId] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [stripeStatus, setStripeStatus] = useState<string>('not_started');

  const [data, setData] = useState<OnboardingData>({
    bankAccountName: '',
    bankRoutingNumber: '',
    bankAccountNumberLast4: '',
    bankAccountType: 'checking',
    payoutFrequency: 'monthly',
    blackoutDates: [],
  });

  const [newBlackout, setNewBlackout] = useState({ start: '', end: '', label: '' });
  const [addingBlackout, setAddingBlackout] = useState(false);

  const loadExisting = useCallback(async () => {
    if (!leadId) { setLoading(false); return; }
    try {
      const { data: existing } = await supabase
        .from('homeowner_onboarding')
        .select('*')
        .eq('lead_id', leadId)
        .maybeSingle();

      if (existing) {
        setOnboardingId(existing.id);
        setStripeAccountId(existing.stripe_connect_account_id ?? null);
        setStripeStatus(existing.stripe_connect_status ?? 'not_started');
        setActivated(existing.listing_activated ?? false);
        setData({
          bankAccountName: existing.bank_account_name ?? '',
          bankRoutingNumber: existing.bank_routing_number ?? '',
          bankAccountNumberLast4: existing.bank_account_number_last4 ?? '',
          bankAccountType: (existing.bank_account_type as 'checking' | 'savings') ?? 'checking',
          payoutFrequency: (existing.payout_frequency as 'monthly' | 'biweekly') ?? 'monthly',
          blackoutDates: (existing.blackout_dates as BlackoutDate[]) ?? [],
        });

        // Determine which step to resume at
        if (existing.step_listing_activated) setCurrentStep(4);
        else if (existing.step_payout_selected) setCurrentStep(4);
        else if (existing.step_blackout_set) setCurrentStep(3);
        else if (existing.step_bank_confirmed) setCurrentStep(2);
      }
    } finally {
      setLoading(false);
    }
  }, [leadId, supabase]);

  useEffect(() => {
    loadExisting();
  }, [loadExisting]);

  // Handle Stripe Connect return
  useEffect(() => {
    if (stripeReturn === 'return' && stripeAccountId) {
      // Refresh Stripe status
      fetch('/api/stripe/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_status', accountId: stripeAccountId }),
      })
        .then(r => r.json())
        .then((d: { status?: string }) => {
          if (d.status) {
            setStripeStatus(d.status);
            if (onboardingId) {
              supabase
                .from('homeowner_onboarding')
                .update({ stripe_connect_status: d.status })
                .eq('id', onboardingId)
                .then(() => {});
            }
          }
        })
        .catch(() => {});
    }
  }, [stripeReturn, stripeAccountId, onboardingId, supabase]);

  async function upsertOnboarding(updates: Record<string, unknown>) {
    if (onboardingId) {
      await supabase.from('homeowner_onboarding').update(updates).eq('id', onboardingId);
    } else {
      const { data: created } = await supabase
        .from('homeowner_onboarding')
        .insert({ lead_id: leadId, ...updates })
        .select('id')
        .single();
      if (created) setOnboardingId(created.id);
    }
  }

  async function handleStepBank() {
    if (!data.bankAccountName.trim()) return;
    setSaving(true);
    try {
      await upsertOnboarding({
        bank_account_name: data.bankAccountName,
        bank_routing_number: data.bankRoutingNumber,
        bank_account_number_last4: data.bankAccountNumberLast4,
        bank_account_type: data.bankAccountType,
        step_bank_confirmed: true,
      });

      // Update lead onboarding status to in_progress
      await supabase
        .from('leads')
        .update({ onboarding_status: 'in_progress' })
        .eq('id', leadId);

      setCurrentStep(2);
    } finally {
      setSaving(false);
    }
  }

  async function handleStepBlackout() {
    setSaving(true);
    try {
      await upsertOnboarding({
        blackout_dates: data.blackoutDates,
        step_blackout_set: true,
      });
      setCurrentStep(3);
    } finally {
      setSaving(false);
    }
  }

  async function handleStepPayout() {
    setSaving(true);
    try {
      await upsertOnboarding({
        payout_frequency: data.payoutFrequency,
        step_payout_selected: true,
      });
      setCurrentStep(4);
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate() {
    setSaving(true);
    try {
      await upsertOnboarding({
        listing_activated: true,
        listing_activated_at: new Date().toISOString(),
        step_listing_activated: true,
      });

      await supabase
        .from('leads')
        .update({ listing_active: true, onboarding_status: 'complete' })
        .eq('id', leadId);

      setActivated(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleStripeConnect() {
    setSaving(true);
    try {
      // Create Stripe Connect account (placeholder)
      const createRes = await fetch('/api/stripe/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_account',
          email: 'homeowner@example.com',
          name: data.bankAccountName || 'Homeowner',
          leadId,
        }),
      });
      const createData = await createRes.json() as { accountId?: string; error?: string };
      if (createData.error || !createData.accountId) {
        console.warn('[StripeConnect] Account creation error:', createData.error);
        return;
      }

      const accountId = createData.accountId;
      setStripeAccountId(accountId);

      await upsertOnboarding({
        stripe_connect_account_id: accountId,
        stripe_connect_status: 'pending',
      });

      // Get onboarding link
      const linkRes = await fetch('/api/stripe/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_link', accountId, leadId }),
      });
      const linkData = await linkRes.json() as { url?: string; error?: string };

      if (linkData.url && linkData.url !== '#stripe-connect-placeholder') {
        window.location.href = linkData.url;
      } else {
        // Placeholder mode — simulate pending
        setStripeStatus('pending');
        await upsertOnboarding({ stripe_connect_status: 'pending' });
        await supabase.from('leads').update({ payout_account_verified: false }).eq('id', leadId);
      }
    } finally {
      setSaving(false);
    }
  }

  function addBlackoutDate() {
    if (!newBlackout.start || !newBlackout.end) return;
    const entry: BlackoutDate = {
      id: Math.random().toString(36).slice(2),
      start: newBlackout.start,
      end: newBlackout.end,
      label: newBlackout.label || 'Personal use',
    };
    setData(prev => ({ ...prev, blackoutDates: [...prev.blackoutDates, entry] }));
    setNewBlackout({ start: '', end: '', label: '' });
    setAddingBlackout(false);
  }

  function removeBlackoutDate(id: string) {
    setData(prev => ({ ...prev, blackoutDates: prev.blackoutDates.filter(d => d.id !== id) }));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (activated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center mx-auto">
            <CheckCircle2 size={36} className="text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">You're Live!</h1>
            <p className="text-muted-foreground mt-2">
              Your property listing has been activated on TRAVLR. Bookings will start flowing in shortly.
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-left space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What happens next</p>
            {[
              'Your property is now visible to TRAVLR guests',
              'Payouts will be processed on your selected schedule',
              'You can manage blackout dates anytime from your dashboard',
              'Your TRAVLR team will reach out within 24 hours',
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle2 size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                <span className="text-sm text-foreground">{item}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => router.push('/homeowner')}
            className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-all"
          >
            Go to My Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap size={15} className="text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-foreground">Property Onboarding</h1>
              <p className="text-xs text-muted-foreground">TRAVLR Partnership Setup</p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">Step {currentStep} of {STEPS.length}</span>
        </div>
      </div>

      {/* Step indicators */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-2xl mx-auto px-6 py-3">
          <div className="flex items-center gap-2 overflow-x-auto">
            {STEPS.map((step, idx) => {
              const StepIcon = step.icon;
              const isComplete = currentStep > step.id;
              const isActive = currentStep === step.id;
              return (
                <React.Fragment key={step.id}>
                  <div className={`flex items-center gap-2 shrink-0 ${isActive ? 'opacity-100' : isComplete ? 'opacity-100' : 'opacity-40'}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isComplete ? 'bg-emerald-500 text-white' : isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                      {isComplete ? <CheckCircle2 size={13} /> : <StepIcon size={13} />}
                    </div>
                    <span className={`text-xs font-medium whitespace-nowrap ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {step.label}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={`flex-1 h-px min-w-[16px] ${isComplete ? 'bg-emerald-500/40' : 'bg-border'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

        {/* ── STEP 1: Bank Details ── */}
        {currentStep === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-foreground">Confirm Bank Details</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Your payout account details for TRAVLR rental income. All information is encrypted and secure.
              </p>
            </div>

            {/* Stripe Connect CTA */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#635BFF]/10 flex items-center justify-center">
                  <Shield size={18} className="text-[#635BFF]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Secure Payout Verification</p>
                  <p className="text-xs text-muted-foreground">Powered by Stripe Connect</p>
                </div>
                <span className={`ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  stripeStatus === 'verified' ? 'bg-emerald-500/10 text-emerald-600' :
                  stripeStatus === 'pending'? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'
                }`}>
                  {stripeStatus === 'verified' ? 'Verified' : stripeStatus === 'pending' ? 'Pending' : 'Not Started'}
                </span>
              </div>

              {stripeStatus === 'not_started' && (
                <button
                  onClick={handleStripeConnect}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-[#635BFF] text-white rounded-xl font-semibold text-sm hover:bg-[#635BFF]/90 disabled:opacity-60 transition-all"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
                  {saving ? 'Connecting…' : 'Connect Bank Account via Stripe'}
                </button>
              )}

              {stripeStatus === 'pending' && (
                <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                  <AlertCircle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    Your Stripe account is pending verification. This usually takes 1–2 business days.
                    {!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_') && (
                      <span className="block mt-1 text-amber-600/70">
                        (Stripe credentials not yet configured — verification will complete once credentials are added)
                      </span>
                    )}
                  </p>
                </div>
              )}

              {stripeStatus === 'verified' && (
                <div className="flex items-center gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                  <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                  <p className="text-xs text-emerald-700">Bank account verified and ready for payouts.</p>
                </div>
              )}
            </div>

            {/* Manual bank details (fallback) */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Or enter bank details manually</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">Account Holder Name</label>
                  <input
                    value={data.bankAccountName}
                    onChange={e => setData(prev => ({ ...prev, bankAccountName: e.target.value }))}
                    placeholder="Full legal name on account"
                    className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">Routing Number</label>
                    <input
                      value={data.bankRoutingNumber}
                      onChange={e => setData(prev => ({ ...prev, bankRoutingNumber: e.target.value }))}
                      placeholder="9 digits"
                      maxLength={9}
                      className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1.5">Last 4 of Account #</label>
                    <input
                      value={data.bankAccountNumberLast4}
                      onChange={e => setData(prev => ({ ...prev, bankAccountNumberLast4: e.target.value }))}
                      placeholder="XXXX"
                      maxLength={4}
                      className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">Account Type</label>
                  <div className="flex gap-2">
                    {(['checking', 'savings'] as const).map(type => (
                      <button
                        key={type}
                        onClick={() => setData(prev => ({ ...prev, bankAccountType: type }))}
                        className={`flex-1 py-2.5 text-sm font-medium rounded-lg border transition-all capitalize ${
                          data.bankAccountType === type
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-muted-foreground border-border hover:border-primary/40'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleStepBank}
              disabled={saving || !data.bankAccountName.trim()}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 disabled:opacity-60 transition-all"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : null}
              {saving ? 'Saving…' : 'Confirm Bank Details'}
              {!saving && <ChevronRight size={15} />}
            </button>
          </div>
        )}

        {/* ── STEP 2: Blackout Dates ── */}
        {currentStep === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-foreground">Personal-Use Blackout Dates</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Block dates when you'll be using the property personally. Guests won't be able to book these dates.
              </p>
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {data.blackoutDates.length === 0 ? (
                <div className="py-10 text-center">
                  <Calendar size={28} className="mx-auto mb-2 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No blackout dates set</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">You can add them now or update later from your dashboard</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {data.blackoutDates.map(bd => (
                    <div key={bd.id} className="flex items-center gap-3 px-4 py-3">
                      <Calendar size={14} className="text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{bd.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(bd.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
                          {new Date(bd.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <button
                        onClick={() => removeBlackoutDate(bd.id)}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-danger transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add blackout date */}
              {addingBlackout ? (
                <div className="border-t border-border p-4 space-y-3 bg-muted/20">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">New Blackout Period</p>
                  <input
                    value={newBlackout.label}
                    onChange={e => setNewBlackout(prev => ({ ...prev, label: e.target.value }))}
                    placeholder="Label (e.g. Family vacation)"
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Start Date</label>
                      <input
                        type="date"
                        value={newBlackout.start}
                        onChange={e => setNewBlackout(prev => ({ ...prev, start: e.target.value }))}
                        className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">End Date</label>
                      <input
                        type="date"
                        value={newBlackout.end}
                        onChange={e => setNewBlackout(prev => ({ ...prev, end: e.target.value }))}
                        className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={addBlackoutDate}
                      disabled={!newBlackout.start || !newBlackout.end}
                      className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-60 transition-all"
                    >
                      Add Date
                    </button>
                    <button
                      onClick={() => setAddingBlackout(false)}
                      className="px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border-t border-border p-3">
                  <button
                    onClick={() => setAddingBlackout(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
                  >
                    <Plus size={14} />
                    Add Blackout Period
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setCurrentStep(1)}
                className="flex items-center gap-1.5 px-4 py-3 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition-all"
              >
                <ChevronLeft size={15} />Back
              </button>
              <button
                onClick={handleStepBlackout}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 disabled:opacity-60 transition-all"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                {saving ? 'Saving…' : data.blackoutDates.length === 0 ? 'Skip for Now' : 'Save Blackout Dates'}
                {!saving && <ChevronRight size={15} />}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Payout Frequency ── */}
        {currentStep === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-foreground">Payout Frequency</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Choose how often you'd like to receive your rental income payouts.
              </p>
            </div>

            <div className="space-y-3">
              {[
                {
                  value: 'monthly' as const,
                  label: 'Monthly',
                  description: 'Receive one consolidated payout at the end of each month',
                  detail: 'Processed on the 1st of each month',
                },
                {
                  value: 'biweekly' as const,
                  label: 'Bi-Weekly',
                  description: 'Receive payouts every two weeks for faster access to earnings',
                  detail: 'Processed every other Friday',
                },
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => setData(prev => ({ ...prev, payoutFrequency: option.value }))}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    data.payoutFrequency === option.value
                      ? 'border-primary bg-primary/5' :'border-border bg-card hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                      data.payoutFrequency === option.value ? 'border-primary bg-primary' : 'border-border'
                    }`}>
                      {data.payoutFrequency === option.value && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{option.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{option.description}</p>
                      <p className="text-[11px] text-muted-foreground/70 mt-1">{option.detail}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setCurrentStep(2)}
                className="flex items-center gap-1.5 px-4 py-3 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition-all"
              >
                <ChevronLeft size={15} />Back
              </button>
              <button
                onClick={handleStepPayout}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 disabled:opacity-60 transition-all"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                {saving ? 'Saving…' : 'Confirm Payout Schedule'}
                {!saving && <ChevronRight size={15} />}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Activate Listing ── */}
        {currentStep === 4 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-foreground">Activate Your Listing</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Everything is set. Activate your property listing to start accepting bookings through TRAVLR.
              </p>
            </div>

            {/* Summary */}
            <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard size={14} className="text-muted-foreground" />
                  <span className="text-sm text-foreground">Bank Account</span>
                </div>
                <span className="text-sm font-medium text-foreground">
                  {data.bankAccountName || '—'} {data.bankAccountNumberLast4 ? `····${data.bankAccountNumberLast4}` : ''}
                </span>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-muted-foreground" />
                  <span className="text-sm text-foreground">Blackout Dates</span>
                </div>
                <span className="text-sm font-medium text-foreground">
                  {data.blackoutDates.length === 0 ? 'None set' : `${data.blackoutDates.length} period${data.blackoutDates.length !== 1 ? 's' : ''}`}
                </span>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign size={14} className="text-muted-foreground" />
                  <span className="text-sm text-foreground">Payout Frequency</span>
                </div>
                <span className="text-sm font-medium text-foreground capitalize">{data.payoutFrequency}</span>
              </div>
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield size={14} className="text-muted-foreground" />
                  <span className="text-sm text-foreground">Payout Verification</span>
                </div>
                <span className={`text-sm font-medium capitalize ${
                  stripeStatus === 'verified' ? 'text-emerald-600' :
                  stripeStatus === 'pending'? 'text-amber-600' : 'text-muted-foreground'
                }`}>
                  {stripeStatus === 'not_started' ? 'Not started' : stripeStatus}
                </span>
              </div>
            </div>

            {stripeStatus !== 'verified' && (
              <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-700">Payout account not yet verified</p>
                  <p className="text-xs text-amber-600/80 mt-0.5">
                    You can still activate your listing. Payouts will begin once your Stripe account is verified.
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setCurrentStep(3)}
                className="flex items-center gap-1.5 px-4 py-3 border border-border rounded-xl text-sm text-muted-foreground hover:bg-muted transition-all"
              >
                <ChevronLeft size={15} />Back
              </button>
              <button
                onClick={handleActivate}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90 disabled:opacity-60 transition-all active:scale-[0.98]"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                {saving ? 'Activating…' : 'Activate My Property Listing'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HomeownerOnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    }>
      <HomeownerOnboardingContent />
    </Suspense>
  );
}
