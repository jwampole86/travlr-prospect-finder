'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronRight, ChevronLeft, CheckCircle, Home, HelpCircle, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// ─── Step definitions ─────────────────────────────────────────────────────────

interface HomeownerStep {
  id: string;
  title: string;
  description: string;
  tip?: string;
  faqLink?: string;
  faqLabel?: string;
  icon: string;
  highlight?: string;
}

const HOMEOWNER_STEPS: HomeownerStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Your TRAVLR Dashboard',
    description: "You've signed your management agreement — congratulations! This is your homeowner portal where you can track revenue, bookings, payouts, and submit requests to your property manager.",
    tip: 'Your dashboard updates automatically as bookings and payouts are processed. No action needed to get started.',
    icon: '🏡',
    highlight: 'Your property is now in TRAVLR\'s active management pipeline.',
  },
  {
    id: 'property-setup',
    title: 'Property Setup & Listing Activation',
    description: "Your property manager is preparing your listing. This includes professional photography, pricing optimization, and platform setup across Airbnb, VRBO, and direct booking channels.",
    tip: 'Setup typically takes 5–10 business days. You\'ll receive an email notification when your listing goes live.',
    faqLink: '/homeowner/onboarding',
    faqLabel: 'View Onboarding Checklist',
    icon: '📋',
    highlight: 'No action required from you — your manager handles the full listing setup.',
  },
  {
    id: 'listing-activation',
    title: 'When Your Listing Goes Live',
    description: "Once your listing is activated, you'll see your first bookings appear in the Bookings tab. Your occupancy rate, gross revenue, and net payout will populate automatically from real booking data.",
    tip: 'You can view but not modify live guest reservations. Contact your TRAVLR property manager for any booking changes.',
    faqLink: '/homeowner/bookings',
    faqLabel: 'Go to Bookings',
    icon: '🚀',
    highlight: 'Bookings, revenue, and payout data all update in real time.',
  },
  {
    id: 'revenue-payouts',
    title: 'Revenue & Payout Statements',
    description: "The Revenue tab shows your monthly gross and net earnings, occupancy rate, and itemized deductions. Payout statements are generated automatically each month and available for download.",
    tip: 'Net payout = Gross revenue minus TRAVLR management fee, platform fees, and any maintenance costs incurred that month.',
    faqLink: '/homeowner/revenue',
    faqLabel: 'View Revenue Tab',
    icon: '💰',
  },
  {
    id: 'requests-documents',
    title: 'Requests & Documents',
    description: "Use the Requests tab to submit maintenance requests, personal use block-outs, or any property concerns directly to your manager. Your management agreement and STR permit are in the Documents tab.",
    tip: 'Personal use block-outs should be submitted at least 2 weeks in advance to avoid conflicts with existing reservations.',
    faqLink: '/homeowner/documents',
    faqLabel: 'View Documents',
    icon: '📄',
  },
];

const HOMEOWNER_WALKTHROUGH_KEY = 'travlr_homeowner_walkthrough_v1';

// ─── Component ────────────────────────────────────────────────────────────────

interface HomeownerWalkthroughProps {
  forceShow?: boolean;
  onClose?: () => void;
}

export default function HomeownerWalkthrough({ forceShow = false, onClose }: HomeownerWalkthroughProps) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const { user } = useAuth();
  const supabase = createClient();
  const overlayRef = useRef<HTMLDivElement>(null);

  const checkShouldShow = useCallback(async () => {
    if (forceShow) { setVisible(true); return; }
    if (typeof window !== 'undefined') {
      const dismissed = localStorage.getItem(HOMEOWNER_WALKTHROUGH_KEY);
      if (dismissed) return;
    }
    if (user) {
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('onboarding_completed')
          .eq('id', user.id)
          .single();
        if (data?.onboarding_completed) {
          if (typeof window !== 'undefined') localStorage.setItem(HOMEOWNER_WALKTHROUGH_KEY, '1');
          return;
        }
      } catch { /* ignore */ }
    }
    setVisible(true);
  }, [forceShow, user, supabase]);

  useEffect(() => {
    checkShouldShow();
  }, [checkShouldShow]);

  const dismiss = useCallback(async (markComplete = false) => {
    setVisible(false);
    if (typeof window !== 'undefined') localStorage.setItem(HOMEOWNER_WALKTHROUGH_KEY, '1');
    if (markComplete && user) {
      try {
        await supabase
          .from('user_profiles')
          .update({ onboarding_completed: true })
          .eq('id', user.id);
      } catch { /* ignore */ }
    }
    onClose?.();
  }, [user, supabase, onClose]);

  const markStepComplete = (stepId: string) => {
    setCompleted(prev => new Set([...prev, stepId]));
  };

  const goNext = () => {
    markStepComplete(HOMEOWNER_STEPS[step].id);
    if (step < HOMEOWNER_STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      dismiss(true);
    }
  };

  const goPrev = () => {
    if (step > 0) setStep(s => s - 1);
  };

  if (!visible) return null;

  const currentStep = HOMEOWNER_STEPS[step];
  const isLast = step === HOMEOWNER_STEPS.length - 1;
  const progress = ((step + 1) / HOMEOWNER_STEPS.length) * 100;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === overlayRef.current) dismiss(false); }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Home size={15} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">Getting Started</p>
              <p className="text-[11px] text-muted-foreground">Step {step + 1} of {HOMEOWNER_STEPS.length} · Homeowner Onboarding</p>
            </div>
          </div>
          <button
            onClick={() => dismiss(false)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Skip walkthrough"
          >
            <X size={15} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-2 pt-4 px-6">
          {HOMEOWNER_STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setStep(i)}
              className={`transition-all duration-300 rounded-full ${
                i === step
                  ? 'w-6 h-2 bg-primary'
                  : completed.has(s.id)
                  ? 'w-2 h-2 bg-emerald-500' :'w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
              }`}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <div className="flex items-start gap-4 mb-4">
            <div className="text-3xl shrink-0">{currentStep.icon}</div>
            <div>
              <h2 className="text-base font-bold text-foreground mb-1">{currentStep.title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{currentStep.description}</p>
            </div>
          </div>

          {/* Highlight callout */}
          {currentStep.highlight && (
            <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-3">
              <CheckCircle size={14} className="text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-800 font-medium leading-relaxed">{currentStep.highlight}</p>
            </div>
          )}

          {/* Tip */}
          {currentStep.tip && (
            <div className="flex items-start gap-2.5 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 mb-4">
              <span className="text-base shrink-0">💡</span>
              <p className="text-xs text-foreground/80 leading-relaxed">{currentStep.tip}</p>
            </div>
          )}

          {/* FAQ / page link */}
          {currentStep.faqLink && (
            <a
              href={currentStep.faqLink}
              onClick={() => markStepComplete(currentStep.id)}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium mb-4"
            >
              <ExternalLink size={11} />
              {currentStep.faqLabel}
            </a>
          )}

          {/* Step checklist */}
          <div className="space-y-1.5 pt-2 border-t border-border">
            {HOMEOWNER_STEPS.map((s, i) => (
              <div key={s.id} className={`flex items-center gap-2 text-xs transition-colors ${i === step ? 'text-foreground font-medium' : completed.has(s.id) ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                {completed.has(s.id) ? (
                  <CheckCircle size={12} className="text-emerald-500 shrink-0" />
                ) : (
                  <div className={`w-3 h-3 rounded-full border shrink-0 ${i === step ? 'border-primary bg-primary/20' : 'border-muted-foreground/30'}`} />
                )}
                {s.title}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 pb-5 gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => dismiss(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
            >
              Skip tour
            </button>
            <a
              href="/homeowner/onboarding"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <HelpCircle size={11} />
              FAQ
            </a>
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={goPrev}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors"
              >
                <ChevronLeft size={12} />
                Back
              </button>
            )}
            <button
              onClick={goNext}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              {isLast ? (
                <>
                  <CheckCircle size={12} />
                  Get Started
                </>
              ) : (
                <>
                  Next
                  <ChevronRight size={12} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
