'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  CheckCircle2, Clock, AlertCircle, CreditCard, Home, Zap,
  ChevronRight, Loader2, RefreshCw, ExternalLink, ClipboardList,
  Search, Shield, Camera, Settings, FileText, CheckSquare, ChevronDown
} from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


interface DealClosedSectionProps {
  leadId: string;
  leadAddress: string;
  leadEmail?: string;
  leadName?: string;
}

interface OnboardingRecord {
  id: string;
  lead_id: string;
  stripe_connect_account_id?: string;
  stripe_connect_status: string;
  step_bank_confirmed: boolean;
  step_blackout_set: boolean;
  step_payout_selected: boolean;
  step_listing_activated: boolean;
  listing_activated: boolean;
  listing_activated_at?: string;
  payout_frequency?: string;
}

interface LeadOnboardingState {
  onboarding_status: 'incomplete' | 'in_progress' | 'complete';
  payout_account_verified: boolean;
  listing_active: boolean;
}

const STATUS_CONFIG = {
  incomplete: {
    label: 'Incomplete',
    color: 'text-muted-foreground',
    bg: 'bg-muted',
    icon: <Clock size={12} />,
  },
  in_progress: {
    label: 'In Progress',
    color: 'text-amber-600',
    bg: 'bg-amber-500/10',
    icon: <AlertCircle size={12} />,
  },
  complete: {
    label: 'Complete',
    color: 'text-emerald-600',
    bg: 'bg-emerald-500/10',
    icon: <CheckCircle2 size={12} />,
  },
};

const PAYOUT_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  not_started: { label: 'Not Started', color: 'text-muted-foreground', bg: 'bg-muted' },
  pending: { label: 'Pending Verification', color: 'text-amber-600', bg: 'bg-amber-500/10' },
  verified: { label: 'Verified', color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
  failed: { label: 'Verification Failed', color: 'text-red-500', bg: 'bg-red-500/10' },
};

// ─── Property Onboarding Checklist ────────────────────────────────────────────

const ONBOARDING_CHECKLIST = [
  {
    step: 1,
    title: 'Assessment & Prep',
    subtitle: 'Week 1',
    icon: Search,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    items: [
      'Walkthrough/inspection — document condition, amenities, needed repairs or upgrades',
      'Safety compliance check (smoke/CO detectors, fire extinguisher, first aid kit, lockboxes)',
      'Identify furnishing/staging gaps against brand standard',
    ],
  },
  {
    step: 2,
    title: 'Legal & Compliance',
    subtitle: 'Runs in parallel',
    icon: Shield,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    items: [
      'Verify STR permit/license status with city/county (critical in Coachella Valley — Palm Desert, Indio, etc.)',
      'Confirm TOT (Transient Occupancy Tax) registration',
      'HOA approval if applicable',
    ],
  },
  {
    step: 3,
    title: 'Photography & Content',
    subtitle: 'After staging',
    icon: Camera,
    color: 'text-pink-600',
    bg: 'bg-pink-50',
    border: 'border-pink-200',
    items: [
      'Schedule professional photography once staging is complete',
      'Capture video/drone footage for premium listings',
      'Gather property specs (sq ft, bed/bath count, amenities list, house rules)',
    ],
  },
  {
    step: 4,
    title: 'Operations Setup',
    subtitle: 'Tech & vendors',
    icon: Settings,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    items: [
      'Add property to OwnerRez (PMS/channel manager)',
      'Log lead and property details in TRAVLR Prospect Finder',
      'Set up cleaning/turnover vendor and supply stocking',
      'Install smart locks (Yale or August), noise monitors (Layla), thermostats (Nest)',
      'Set up guest communication templates and check-in instructions',
    ],
  },
  {
    step: 5,
    title: 'Listing Creation',
    subtitle: 'Go-to-market',
    icon: FileText,
    color: 'text-teal-600',
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    items: [
      'Draft listing copy, pricing strategy (comp analysis), and calendar/minimum stay rules',
      'Set up STR and other channel listings, sync calendars',
      'Soft-launch pricing to build initial reviews, then adjust',
    ],
  },
  {
    step: 6,
    title: 'Pre-Launch QA',
    subtitle: 'Final check',
    icon: CheckSquare,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    items: [
      'Final walkthrough against listing photos/description for accuracy',
      'Test guest journey — booking confirmation, check-in instructions, Wi-Fi, etc.',
    ],
  },
];

function PropertyOnboardingChecklist() {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-4 py-3 border-b border-border flex items-center justify-between hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center">
            <ClipboardList size={13} className="text-indigo-600" />
          </div>
          <div className="text-left">
            <span className="text-sm font-semibold text-foreground block">Property Onboarding Checklist</span>
            <span className="text-[10px] text-muted-foreground">Signed Partnership Agreement → STR-Ready Listing</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600">
            6 Steps
          </span>
          <ChevronDown
            size={14}
            className={`text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="p-4">
          {/* Coordinator note */}
          <div className="flex items-start gap-2 mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
            <Zap size={13} className="text-indigo-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-indigo-700">
              <span className="font-semibold">TRAVLR Onboarding / Operations Coordinator</span> manages this entire process from signed agreement to STR-ready listing.
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-3">
            {ONBOARDING_CHECKLIST.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.step} className={`rounded-xl border ${step.border} overflow-hidden`}>
                  <div className={`flex items-center gap-2.5 px-3 py-2.5 ${step.bg}`}>
                    <div className={`w-6 h-6 rounded-lg bg-white/70 flex items-center justify-center flex-shrink-0`}>
                      <Icon size={12} className={step.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${step.color}`}>Step {step.step}</span>
                        <span className="text-xs font-semibold text-foreground">{step.title}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{step.subtitle}</span>
                    </div>
                  </div>
                  <div className="px-3 py-2 bg-card space-y-1.5">
                    {step.items.map((item, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 mt-1.5 flex-shrink-0" />
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DealClosedSection({ leadId, leadAddress, leadEmail, leadName }: DealClosedSectionProps) {
  const supabase = createClient();
  const [leadState, setLeadState] = useState<LeadOnboardingState | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [leadRes, onboardingRes] = await Promise.all([
        supabase
          .from('leads')
          .select('onboarding_status, payout_account_verified, listing_active')
          .eq('id', leadId)
          .maybeSingle(),
        supabase
          .from('homeowner_onboarding')
          .select('*')
          .eq('lead_id', leadId)
          .maybeSingle(),
      ]);

      if (leadRes.data) setLeadState(leadRes.data as LeadOnboardingState);
      if (onboardingRes.data) setOnboarding(onboardingRes.data as OnboardingRecord);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [leadId, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleActivateListing() {
    setActivating(true);
    try {
      await supabase
        .from('leads')
        .update({ listing_active: true, onboarding_status: 'complete' })
        .eq('id', leadId);

      if (onboarding) {
        await supabase
          .from('homeowner_onboarding')
          .update({
            listing_activated: true,
            listing_activated_at: new Date().toISOString(),
            step_listing_activated: true,
          })
          .eq('id', onboarding.id);
      }

      setLeadState(prev => prev ? { ...prev, listing_active: true, onboarding_status: 'complete' } : prev);
      setOnboarding(prev => prev ? { ...prev, listing_activated: true, step_listing_activated: true } : prev);
    } finally {
      setActivating(false);
    }
  }

  async function handleRefreshStripeStatus() {
    if (!onboarding?.stripe_connect_account_id) return;
    setRefreshing(true);
    try {
      const res = await fetch('/api/stripe/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_status', accountId: onboarding.stripe_connect_account_id }),
      });
      const data = await res.json() as { status?: string };
      if (data.status) {
        await supabase
          .from('homeowner_onboarding')
          .update({ stripe_connect_status: data.status })
          .eq('id', onboarding.id);

        const payoutVerified = data.status === 'verified';
        await supabase
          .from('leads')
          .update({ payout_account_verified: payoutVerified })
          .eq('id', leadId);

        setOnboarding(prev => prev ? { ...prev, stripe_connect_status: data.status! } : prev);
        setLeadState(prev => prev ? { ...prev, payout_account_verified: payoutVerified } : prev);
      }
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-center py-8">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const onboardingStatus = leadState?.onboarding_status ?? 'incomplete';
  const payoutVerified = leadState?.payout_account_verified ?? false;
  const listingActive = leadState?.listing_active ?? false;
  const stripeStatus = onboarding?.stripe_connect_status ?? 'not_started';

  const statusCfg = STATUS_CONFIG[onboardingStatus];
  const payoutCfg = PAYOUT_STATUS_CONFIG[stripeStatus] ?? PAYOUT_STATUS_CONFIG.not_started;

  const steps = [
    { label: 'Bank details confirmed', done: onboarding?.step_bank_confirmed ?? false },
    { label: 'Blackout dates set', done: onboarding?.step_blackout_set ?? false },
    { label: 'Payout frequency selected', done: onboarding?.step_payout_selected ?? false },
    { label: 'Listing activated', done: onboarding?.step_listing_activated ?? false },
  ];
  const completedSteps = steps.filter(s => s.done).length;

  // Show onboarding checklist once contract is signed (onboarding_status is in_progress or complete)
  const showOnboardingChecklist = onboardingStatus === 'in_progress' || onboardingStatus === 'complete';

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap size={13} className="text-primary" />
            </div>
            <span className="text-sm font-semibold text-foreground">Deal Closed</span>
          </div>
          <span className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>
            {statusCfg.icon}
            {statusCfg.label}
          </span>
        </div>

        <div className="p-4 space-y-4">
          {/* Onboarding Progress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Onboarding Progress</p>
              <span className="text-[11px] text-muted-foreground">{completedSteps}/{steps.length} steps</span>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${(completedSteps / steps.length) * 100}%` }}
              />
            </div>
            <div className="space-y-1.5">
              {steps.map((step) => (
                <div key={step.label} className="flex items-center gap-2">
                  {step.done ? (
                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-border shrink-0" />
                  )}
                  <span className={`text-xs ${step.done ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Payout Account Verification */}
          <div className="bg-muted/30 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard size={13} className="text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">Payout Account</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${payoutCfg.bg} ${payoutCfg.color}`}>
                  {payoutVerified ? 'Verified' : payoutCfg.label}
                </span>
                {onboarding?.stripe_connect_account_id && (
                  <button
                    onClick={handleRefreshStripeStatus}
                    disabled={refreshing}
                    className="p-1 rounded hover:bg-muted transition-colors"
                    title="Refresh Stripe status"
                  >
                    <RefreshCw size={11} className={`text-muted-foreground ${refreshing ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
            </div>
            {onboarding?.stripe_connect_account_id ? (
              <p className="text-[10px] text-muted-foreground">
                Stripe account: <span className="font-mono">{onboarding.stripe_connect_account_id.slice(0, 16)}…</span>
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground italic">
                Awaiting homeowner onboarding — Stripe Connect credentials to be configured
              </p>
            )}
            {onboarding?.payout_frequency && (
              <p className="text-[10px] text-muted-foreground">
                Payout frequency: <span className="font-medium text-foreground capitalize">{onboarding.payout_frequency}</span>
              </p>
            )}
          </div>

          {/* Activate Listing Button */}
          <div>
            {listingActive ? (
              <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-700">Listing Active</p>
                  {onboarding?.listing_activated_at && (
                    <p className="text-[10px] text-emerald-600/70">
                      Activated {new Date(onboarding.listing_activated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <button
                onClick={handleActivateListing}
                disabled={activating}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 disabled:opacity-60 transition-all active:scale-[0.98]"
              >
                {activating ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Home size={15} />
                )}
                {activating ? 'Activating…' : 'Activate Property Listing'}
                {!activating && <ChevronRight size={14} className="ml-auto" />}
              </button>
            )}
          </div>

          {/* Link to homeowner onboarding */}
          {!listingActive && (
            <a
              href={`/homeowner/onboarding?leadId=${leadId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[11px] text-primary hover:underline"
            >
              <ExternalLink size={11} />
              Open homeowner onboarding screen
            </a>
          )}
        </div>
      </div>

      {/* Property Onboarding Checklist — shown once contract is signed */}
      {showOnboardingChecklist && <PropertyOnboardingChecklist />}
    </div>
  );
}
