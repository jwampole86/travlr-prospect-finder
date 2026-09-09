'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X, ChevronRight, ChevronLeft, HelpCircle, BookOpen, Lightbulb, ArrowRight, CheckCircle2, LayoutDashboard, List, Phone, MessageSquare, Calendar, FileText, BarChart2, HelpCircle as HelpIcon,  } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// ─── Tour Step Definitions ────────────────────────────────────────────────────

interface TourStep {
  id: string;
  screen: string;
  screenHref: string;
  icon: React.ElementType;
  iconColor: string;
  title: string;
  overview: string;
  keyFeatures: string[];
  nextAction: string;
  nextActionHref?: string;
  tip: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'dashboard',
    screen: 'Dashboard',
    screenHref: '/',
    icon: LayoutDashboard,
    iconColor: 'text-blue-500',
    title: 'Dashboard — Your Command Center',
    overview: 'The Dashboard gives you a real-time snapshot of your entire STR lead pipeline. KPI cards surface total leads, active pipeline, high-priority prospects, and your personal commission payout — all scoped to your selected portfolio.',
    keyFeatures: [
      'KPI cards: total leads, active pipeline, action-needed count, your commission payout',
      'Stage Funnel Chart showing conversion across pipeline stages',
      'Top Leads Table with prospect scores and regulation status',
      'Activity Feed for recent team actions and system events',
      'Portfolio switcher to scope all data to a specific market',
    ],
    nextAction: 'Next: Lead & Homeowner Pipeline',
    nextActionHref: '/lead-management',
    tip: 'Pin your most-used portfolio in the sidebar switcher to load it by default every session.',
  },
  {
    id: 'lead-pipeline',
    screen: 'Lead Pipeline',
    screenHref: '/lead-management',
    icon: List,
    iconColor: 'text-violet-500',
    title: 'Lead & Homeowner Pipeline — Work Your Prospects',
    overview: 'Lead Management is where you spend most of your time. Browse, filter, enrich, and act on every lead. Leads tagged "Inbound — Self-Qualified" are warm homeowners who opted in via the TRAVLR estimate page — prioritize these above cold sync-sourced leads.',
    keyFeatures: [
      '"Inbound — Self-Qualified" tag = homeowner opted in via estimate landing page (warm lead)',
      'Full-text search across names, addresses, notes, and tags',
      'Saved filter presets for instant recall of common views',
      'Bulk SMS dispatch and sequence assignment',
      'Inline enrichment panel: owner lookup (Stage 1) and contact enrichment (Stage 2)',
    ],
    nextAction: 'Next: Dialer & Teleprompter',
    nextActionHref: '/teleprompter',
    tip: 'Filter by "Inbound — Self-Qualified" first — these leads already expressed interest and convert at a higher rate than cold outreach.',
  },
  {
    id: 'dialer',
    screen: 'Dialer',
    screenHref: '/teleprompter',
    icon: Phone,
    iconColor: 'text-emerald-500',
    title: 'Dialer & Teleprompter — Your Highest-Frequency Daily Action',
    overview: 'The Teleprompter is your live call companion. It auto-fills lead details into your script, surfaces objection responses in real time, and logs every call to the Activity Timeline automatically — no manual entry needed.',
    keyFeatures: [
      'One-tap call start from any lead record; script auto-fills with lead name, address, and property details',
      'Live objection library: pre-built responses surface before falling back to AI generation',
      'Call disposition capture: outcome logged and lead stage updated automatically on hang-up',
      'Every call auto-logged to Activity Timeline (duration, outcome, timestamp, recording link)',
      'Post-call summary generated and saved without manual entry',
      'Call recording consent disclosure plays on every call (all-party consent standard across all 10 states)',
    ],
    nextAction: 'Next: Messaging Tools',
    nextActionHref: '/templates',
    tip: 'Use the "warm inbound" script variant for "Inbound — Self-Qualified" leads — it opens by acknowledging they reached out, not re-introducing TRAVLR from scratch.',
  },
  {
    id: 'messaging',
    screen: 'Messaging',
    screenHref: '/templates',
    icon: MessageSquare,
    iconColor: 'text-sky-500',
    title: 'Messaging Tools — SMS, Email & Follow-Up Sequencing',
    overview: 'SMS and email templates share the same merge-field resolution system as the Teleprompter — one unified system, not three separate implementations. Follow-up sequences extend the cadence engine with SMS and call as additional channel options per stage.',
    keyFeatures: [
      'SMS and email templates with merge-field autofill (same system as Teleprompter)',
      'Follow-up sequencing: add SMS/call steps to any cadence stage',
      'A2P 10DLC brand/campaign registration required before SMS goes live (hard blocker)',
      'Pre-send compliance checklist: DNC check, time-of-day restrictions, TCPA consent',
      'Template performance tracking: open rates, click rates, reply rates per template',
    ],
    nextAction: 'Next: Scheduling & Calendar',
    nextActionHref: '/follow-up-sequences',
    tip: 'Check A2P 10DLC registration status in Settings before sending any SMS — unregistered numbers will be blocked by carriers.',
  },
  {
    id: 'scheduling',
    screen: 'Scheduling',
    screenHref: '/follow-up-sequences',
    icon: Calendar,
    iconColor: 'text-orange-500',
    title: 'Scheduling & Calendar — Manage Follow-Ups',
    overview: 'The follow-up sequencing engine handles automated cadence scheduling across email, SMS, and call steps. Leads auto-advance through stages based on call outcomes — interested leads move to follow-up, no-answers queue for retry.',
    keyFeatures: [
      'Auto-trigger cadences when leads hit stage thresholds (interested → follow-up, no-answer → retry)',
      'Scheduled queue panel showing upcoming touchpoints per lead',
      'Manual override: reschedule or skip any step from the lead record',
      'Cadence performance metrics: completion rate, escalation rate, per-step engagement',
      'Calendar view of all scheduled outreach across your lead portfolio',
    ],
    nextAction: 'Next: Documents & E-Signature',
    nextActionHref: '/lead-record',
    tip: 'Sort cadence performance by escalation rate descending to find your highest-converting sequences and clone their structure.',
  },
  {
    id: 'documents',
    screen: 'Documents',
    screenHref: '/lead-record',
    icon: FileText,
    iconColor: 'text-indigo-500',
    title: 'Documents & E-Signature — DocuSign from a Lead Record',
    overview: 'Trigger the DocuSign Partnership Agreement flow directly from any lead record. Once the homeowner signs, the system auto-logs the completion, updates the lead stage, and triggers your commission calculation.',
    keyFeatures: [
      'Send Partnership Agreement via DocuSign from the lead\'s detail view — one click',
      'Signing status tracked in real time: sent → viewed → signed → completed',
      'DocuSign completion = commission trigger (system-verifiable event)',
      'Embedded signing portal: homeowner can sign without leaving the TRAVLR flow',
      'Void and resend available if the homeowner needs a corrected document',
    ],
    nextAction: 'Next: Performance & Reporting',
    nextActionHref: '/agent/commissions',
    tip: 'After sending a DocuSign, check the Activity Timeline on the lead record — signing events are logged there in real time so you know exactly when the homeowner opens and signs.',
  },
  {
    id: 'performance',
    screen: 'Performance',
    screenHref: '/agent/commissions',
    icon: BarChart2,
    iconColor: 'text-rose-500',
    title: 'Performance & Reporting — Your KPIs & Commission Status',
    overview: 'Your personal performance dashboard shows only your own numbers — leads worked, calls made, conversion rates, and commission payout. Portfolio-wide revenue figures are not shown here; you see only what\'s owed to you.',
    keyFeatures: [
      'Commission payout card: pending payout, next scheduled payout date and amount',
      'Total commission earned: current period and lifetime (toggleable)',
      'Payout via Stripe Connect on the schedule defined in your commission agreement',
      'Commission triggered by DocuSign completion of the Partnership Agreement',
      'Call analytics: your personal volume, conversion rate, and outcome breakdown',
    ],
    nextAction: 'Next: Q&A / Help Center',
    nextActionHref: '/help-center',
    tip: 'Commission calculations are tied to DocuSign completion — if a payout looks wrong, check the lead\'s Activity Timeline to confirm the signing event was captured.',
  },
  {
    id: 'help-center',
    screen: 'Help Center',
    screenHref: '/help-center',
    icon: HelpIcon,
    iconColor: 'text-teal-500',
    title: 'Q&A / Help Center — Your Ongoing Support Resource',
    overview: 'The Help Center is your go-to after this tour. Ask questions about your own leads, stats, and how any module works — the AI assistant answers from your actual dashboard data and TRAVLR\'s internal documentation, not from guesses.',
    keyFeatures: [
      'AI assistant answers from your dashboard data and TRAVLR\'s how-to documentation',
      'Ask about your own leads, stats, commission status, or any module\'s features',
      'Compliance or legal questions route to a human admin — AI will not guess on those',
      'Search TRAVLR\'s internal documentation for step-by-step module guides',
      'This is your primary support resource after completing this tour',
    ],
    nextAction: 'You\'re all set! Start working your leads.',
    nextActionHref: '/lead-management',
    tip: 'After this tour, the Help Center is your first stop for any question. The AI assistant has context about your specific leads and stats — ask it directly rather than searching generic docs.',
  },
];

// ─── Analytics helpers ────────────────────────────────────────────────────────

async function logTourAnalytics(
  userId: string,
  event: 'tour_started' | 'tour_completed' | 'tour_skipped' | 'tour_step_viewed',
  payload: Record<string, unknown>
) {
  try {
    const supabase = createClient();
    await supabase.from('tour_analytics').insert({
      user_id: userId,
      event,
      payload,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-fatal
  }
}

// ─── Context Help Modal ───────────────────────────────────────────────────────

interface ContextHelpModalProps {
  screenId: string;
  onClose: () => void;
}

export function ContextHelpModal({ screenId, onClose }: ContextHelpModalProps) {
  const step = TOUR_STEPS.find((s) => s.id === screenId) ?? TOUR_STEPS[0];
  const IconComp = step.icon;
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
              <IconComp size={18} className={step.iconColor} />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{step.screen}</p>
              <h2 className="text-sm font-bold text-foreground leading-tight">{step.title}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
            aria-label="Close help"
          >
            <X size={14} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{step.overview}</p>
          <div>
            <p className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">Key Features</p>
            <ul className="space-y-1.5">
              {step.keyFeatures.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 size={12} className="text-primary shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-start gap-2.5 bg-amber-500/8 border border-amber-500/20 rounded-xl px-3.5 py-3">
            <Lightbulb size={13} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-foreground/80 leading-relaxed">{step.tip}</p>
          </div>
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">{step.nextAction}</p>
            {step.nextActionHref && (
              <a
                href={step.nextActionHref}
                onClick={onClose}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline shrink-0"
              >
                Go <ArrowRight size={11} />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Help Button (per-screen) ─────────────────────────────────────────────────

interface HelpButtonProps {
  screenId: string;
  className?: string;
}

export function HelpButton({ screenId, className = '' }: HelpButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors text-xs font-medium text-muted-foreground hover:text-foreground ${className}`}
        title="Feature overview & next-action guidance"
      >
        <HelpCircle size={13} />
        Help
      </button>
      {open && <ContextHelpModal screenId={screenId} onClose={() => setOpen(false)} />}
    </>
  );
}

// ─── Replay Tour Button ───────────────────────────────────────────────────────
// Only renders when tour_view_count < 2. Hidden entirely (not disabled) at ≥2.

interface ReplayTourButtonProps {
  className?: string;
}

export function ReplayTourButton({ className = '' }: ReplayTourButtonProps) {
  const { user } = useAuth();
  const [viewCount, setViewCount] = useState<number | null>(null);
  const [showTour, setShowTour] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    const supabase = createClient();
    supabase
      .from('user_profiles')
      .select('tour_view_count')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setViewCount(data?.tour_view_count ?? 0);
      });
  }, [user?.id]);

  // If count ≥ 2, remove from UI entirely
  if (viewCount === null || viewCount >= 2) return null;

  return (
    <>
      <button
        onClick={() => setShowTour(true)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors text-xs font-medium text-muted-foreground hover:text-foreground ${className}`}
      >
        <BookOpen size={13} />
        Replay Tour
      </button>
      {showTour && (
        <OnboardingTourEngine
          viewingNumber={2}
          onClose={() => setShowTour(false)}
        />
      )}
    </>
  );
}

// ─── Full Tour Engine ─────────────────────────────────────────────────────────

interface OnboardingTourEngineProps {
  /** 1 = first/mandatory view, 2 = optional replay */
  viewingNumber?: 1 | 2;
  /** Called when tour is dismissed or completed */
  onClose?: () => void;
  /** Legacy prop: if true, treat as viewingNumber=2 */
  forceShow?: boolean;
}

export default function OnboardingTourEngine({
  viewingNumber,
  onClose,
  forceShow = false,
}: OnboardingTourEngineProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [resolvedViewingNumber, setResolvedViewingNumber] = useState<1 | 2>(1);
  const [loadingCount, setLoadingCount] = useState(true);
  const overlayRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(Date.now());
  const stepStartTimeRef = useRef<number>(Date.now());

  // ── Resolve tour_view_count from DB ──────────────────────────────────────
  useEffect(() => {
    if (!user?.id) { setLoadingCount(false); return; }

    const supabase = createClient();
    supabase
      .from('user_profiles')
      .select('tour_view_count')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        const count = data?.tour_view_count ?? 0;

        if (forceShow || viewingNumber === 2) {
          // Manual replay — only show if count < 2
          if (count < 2) {
            setResolvedViewingNumber(2);
            setVisible(true);
          } else {
            // Already seen twice — redirect to Help Center for self-serve support
            router.push('/help-center');
          }
        } else if (viewingNumber === 1) {
          // Explicit first-view
          setResolvedViewingNumber(1);
          setVisible(true);
        } else {
          // Auto-detect: show mandatory tour if count === 0
          // If count >= 2, redirect to Help Center instead of showing tour again
          if (count === 0) {
            setResolvedViewingNumber(1);
            setVisible(true);
          } else if (count >= 2) {
            router.push('/help-center');
          }
        }
        setLoadingCount(false);
      });
  }, [user?.id, viewingNumber, forceShow]);

  // ── Log tour started ──────────────────────────────────────────────────────
  useEffect(() => {
    if (visible && user?.id) {
      startTimeRef.current = Date.now();
      stepStartTimeRef.current = Date.now();
      logTourAnalytics(user.id, 'tour_started', {
        viewing_number: resolvedViewingNumber,
        total_steps: TOUR_STEPS.length,
      });
    }
  }, [visible, user?.id, resolvedViewingNumber]);

  // ── Log step viewed ───────────────────────────────────────────────────────
  useEffect(() => {
    if (visible && user?.id) {
      stepStartTimeRef.current = Date.now();
      logTourAnalytics(user.id, 'tour_step_viewed', {
        step_index: step,
        step_id: TOUR_STEPS[step]?.id,
        viewing_number: resolvedViewingNumber,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, visible]);

  // ── Increment tour_view_count in DB ───────────────────────────────────────
  const incrementViewCount = useCallback(async () => {
    if (!user?.id) return;
    const supabase = createClient();
    await supabase.rpc('increment_tour_view_count', { user_id_input: user.id });
  }, [user?.id]);

  // ── Dismiss / complete ────────────────────────────────────────────────────
  const dismiss = useCallback(async (wasCompleted: boolean, wasSkipped = false) => {
    setVisible(false);

    if (user?.id) {
      const durationMs = Date.now() - startTimeRef.current;
      if (wasCompleted) {
        await incrementViewCount();
        logTourAnalytics(user.id, 'tour_completed', {
          viewing_number: resolvedViewingNumber,
          duration_ms: durationMs,
          steps_completed: completed.size,
        });
        // After 2nd viewing completion → redirect to Help Center
        if (resolvedViewingNumber === 2) {
          router.push('/help-center');
        }
      } else if (wasSkipped) {
        await incrementViewCount();
        logTourAnalytics(user.id, 'tour_skipped', {
          viewing_number: resolvedViewingNumber,
          drop_off_step: step,
          drop_off_step_id: TOUR_STEPS[step]?.id,
          duration_ms: durationMs,
        });
      }
    }

    onClose?.();
  }, [user?.id, resolvedViewingNumber, completed.size, step, incrementViewCount, onClose, router]);

  // ── Keyboard navigation (only on 2nd viewing — 1st is mandatory) ─────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!visible) return;
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
      // Escape only works on 2nd viewing
      if (e.key === 'Escape' && resolvedViewingNumber === 2) dismiss(false, true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, resolvedViewingNumber, step]);

  const goNext = () => {
    setCompleted((prev) => new Set([...prev, TOUR_STEPS[step].id]));
    if (step < TOUR_STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss(true);
    }
  };

  const goPrev = () => { if (step > 0) setStep((s) => s - 1); };

  if (loadingCount || !visible) return null;

  const currentStep = TOUR_STEPS[step];
  const IconComp = currentStep.icon;
  const isLast = step === TOUR_STEPS.length - 1;
  const progress = ((step + 1) / TOUR_STEPS.length) * 100;
  const isMandatory = resolvedViewingNumber === 1;

  return (
    // On 1st viewing: click-outside disabled (no onClick on overlay)
    // On 2nd viewing: click-outside skips tour
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={isMandatory ? undefined : (e) => { if (e.target === overlayRef.current) dismiss(false, true); }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <BookOpen size={15} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">
                Platform Tour
                {isMandatory && (
                  <span className="ml-2 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">Required</span>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground">Step {step + 1} of {TOUR_STEPS.length} · {currentStep.screen}</p>
            </div>
          </div>
          {/* Close button only on 2nd viewing */}
          {!isMandatory && (
            <button
              onClick={() => dismiss(false, true)}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Close tour"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div className="h-full bg-primary transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>

        {/* Step tabs */}
        <div className="flex items-center gap-0.5 px-6 pt-3 pb-0 overflow-x-auto scrollbar-none">
          {TOUR_STEPS.map((s, i) => {
            const SIcon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => {
                  // On 1st viewing, only allow going back (not jumping forward)
                  if (isMandatory && i > step) return;
                  setStep(i);
                }}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all shrink-0 ${
                  i === step
                    ? 'bg-primary/10 text-primary'
                    : completed.has(s.id)
                    ? 'text-emerald-600 hover:bg-muted' :'text-muted-foreground hover:bg-muted'
                } ${isMandatory && i > step ? 'cursor-not-allowed opacity-40' : ''}`}
                title={s.screen}
              >
                {completed.has(s.id) && i !== step ? (
                  <CheckCircle2 size={10} className="text-emerald-500" />
                ) : (
                  <SIcon size={10} className={i === step ? 'text-primary' : ''} />
                )}
                <span className="hidden sm:inline">{s.screen}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <IconComp size={20} className={currentStep.iconColor} />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground mb-1">{currentStep.title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{currentStep.overview}</p>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">What you can do here</p>
            <div className="grid grid-cols-1 gap-1.5">
              {currentStep.keyFeatures.map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0 mt-1.5" />
                  {f}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2.5 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3">
            <Lightbulb size={13} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-foreground/80 leading-relaxed">{currentStep.tip}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 pb-5 gap-3 border-t border-border pt-4">
          <div className="flex items-center gap-3">
            {/* Skip Tour: only on 2nd viewing */}
            {!isMandatory && (
              <button
                onClick={() => dismiss(false, true)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
              >
                Skip Tour
              </button>
            )}
            {/* Help Center link always visible */}
            <a
              href="/help-center"
              onClick={() => dismiss(false, false)}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <BookOpen size={11} />
              Help Center
            </a>
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={goPrev}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                <ChevronLeft size={13} /> Back
              </button>
            )}
            <button
              onClick={goNext}
              className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              {isLast ? (isMandatory ? 'Start Working Leads' : 'Finish Tour') : 'Next'}
              {!isLast && <ChevronRight size={13} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
