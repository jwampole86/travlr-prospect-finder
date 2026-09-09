'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { LayoutDashboard, List, Phone, CheckCircle2, ChevronRight, ChevronLeft, ArrowRight, Loader2, X, Star, PhoneCall, FileText, CheckSquare, Zap, Home } from 'lucide-react';

// ─── Tour Step Definitions ────────────────────────────────────────────────────

interface AgentTourStep {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  iconColor: string;
  content: string;
  highlights: string[];
  tip?: string;
}

const AGENT_TOUR_STEPS: AgentTourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to TRAVLR',
    subtitle: 'Your Homeowner Outreach Workspace',
    icon: Home,
    iconColor: 'text-blue-500',
    content: 'Your workspace is designed to help you quickly work the warm homeowner leads assigned to you. You\'ll use TRAVLR to review your assigned leads, prepare for calls, follow the guided call script, record outcomes, leave notes, and manage your follow-ups.',
    highlights: [
      'Work assigned homeowner leads efficiently',
      'Use the guided call teleprompter during conversations',
      'Record every call outcome and add notes',
      'Schedule and track follow-ups',
    ],
    tip: 'Your workspace is intentionally focused — everything here is designed for homeowner outreach.',
  },
  {
    id: 'dashboard',
    title: 'Your Agent Dashboard',
    subtitle: 'Step 2 of 8 — Your Personal Workspace',
    icon: LayoutDashboard,
    iconColor: 'text-blue-500',
    content: 'This is your personal TRAVLR workspace. It shows the leads assigned to you, the leads that need attention, upcoming follow-ups, and your recent activity. Everything here is scoped to your assigned leads only.',
    highlights: [
      'Assigned Leads — total leads in your queue',
      'Priority Leads — highest-value opportunities to work first',
      'Follow-Ups Due — leads requiring action today',
      'Calls Today — your outreach activity',
      'My Performance — your personal metrics',
    ],
    tip: 'Start each day by checking Follow-Ups Due and Priority Leads.',
  },
  {
    id: 'my-leads',
    title: 'My Leads Queue',
    subtitle: 'Step 3 of 8 — Your Assigned Opportunities',
    icon: List,
    iconColor: 'text-violet-500',
    content: 'These are homeowner opportunities assigned to you by the TRAVLR team. Focus on the leads in your queue and work them according to priority. Your queue is automatically sorted to surface the most important leads first.',
    highlights: [
      'Priority leads appear at the top of your queue',
      'Luxury properties are flagged for special handling',
      'Follow-Up Due leads are highlighted for immediate action',
      'New Assignments are marked so you never miss them',
    ],
    tip: 'Use the Priority filter to focus on your highest-value leads first.',
  },
  {
    id: 'lead-indicators',
    title: 'Lead Priority Indicators',
    subtitle: 'Step 4 of 8 — Understanding Lead Badges',
    icon: Star,
    iconColor: 'text-amber-500',
    content: 'Each lead has indicators that tell you what you need to know before making contact. Understanding these badges helps you prioritize your outreach effectively.',
    highlights: [
      'PRIORITY — This lead has been flagged as a high-value opportunity. Work it first.',
      'LUXURY — The property qualifies as a luxury STR opportunity. Use the premium approach.',
      'FULLY VERIFIED — Owner, address, and phone have all passed TRAVLR\'s verification workflow.',
      'PHONE AVAILABLE — A usable phone number is available for this lead.',
      'DO NOT CONTACT — This lead must not be contacted. Respect this flag at all times.',
    ],
    tip: 'Fully Verified + Phone Available = ready to call right now.',
  },
  {
    id: 'lead-profile',
    title: 'Lead Profile',
    subtitle: 'Step 5 of 8 — Reviewing a Lead Before You Call',
    icon: FileText,
    iconColor: 'text-emerald-500',
    content: 'Before calling, review the lead profile to understand the homeowner and property. This gives you the context you need for a confident, informed conversation.',
    highlights: [
      'Owner / Contact name and property address',
      'Phone number and verification status',
      'Property opportunity and projected revenue',
      'Previous outreach history and notes',
      'Next follow-up date and lead status',
    ],
    tip: 'Always review the Previous Outreach section before calling — know what was discussed before.',
  },
  {
    id: 'call-workspace',
    title: 'Call Workspace & Teleprompter',
    subtitle: 'Step 6 of 8 — Your Most Important Tool',
    icon: PhoneCall,
    iconColor: 'text-emerald-500',
    content: 'When you\'re ready to contact a homeowner, open the Call Workspace. TRAVLR will give you the information and guided script you need for the conversation. The teleprompter guides you through the conversation while keeping the property and homeowner information visible.',
    highlights: [
      'INTRODUCTION — Open the conversation naturally',
      'REASON FOR CALL — Explain the STR opportunity',
      'PROPERTY / OPPORTUNITY — Present the revenue potential',
      'DISCOVERY — Learn about their situation',
      'VALUE PROPOSITION — Explain TRAVLR\'s management approach',
      'OBJECTION HANDLING — Prepared responses for common concerns',
      'NEXT STEP / CLOSE — Schedule the follow-up or appointment',
    ],
    tip: 'The teleprompter auto-fills the homeowner\'s name and property details. Never read it word-for-word — use it as a guide.',
  },
  {
    id: 'call-outcomes',
    title: 'Recording Call Outcomes',
    subtitle: 'Step 7 of 8 — After Every Call',
    icon: CheckSquare,
    iconColor: 'text-blue-500',
    content: 'After every call, you must record an outcome. This keeps the TRAVLR team informed and ensures leads are followed up correctly. Always add notes with useful context for the next conversation.',
    highlights: [
      'No Answer — left no message',
      'Voicemail — left a voicemail message',
      'Connected — spoke with the homeowner',
      'Interested — homeowner expressed interest',
      'Follow-Up Needed — requires another contact',
      'Appointment Scheduled — meeting booked',
      'Not Interested — homeowner declined',
      'Do Not Contact — homeowner requested no further contact',
    ],
    tip: 'Always add a note after recording an outcome — even a brief one helps the team.',
  },
  {
    id: 'complete',
    title: "You're Ready to Start",
    subtitle: 'Step 8 of 8 — Your Daily Workflow',
    icon: CheckCircle2,
    iconColor: 'text-emerald-500',
    content: 'You now know everything you need to work your assigned leads effectively. Follow this workflow for every lead in your queue.',
    highlights: [
      '1. Check My Leads — review your assigned queue',
      '2. Start with Priority leads — work highest-value first',
      '3. Review the lead profile — know the property and homeowner',
      '4. Open the Call Workspace — use the teleprompter',
      '5. Record the outcome — every call, every time',
      '6. Add notes — context for the next conversation',
      '7. Schedule follow-up — keep the pipeline moving',
    ],
    tip: 'You can replay this tour anytime from Help → Take Platform Tour Again.',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface AgentOnboardingTourProps {
  onComplete?: () => void;
  forceShow?: boolean;
}

export default function AgentOnboardingTour({ onComplete, forceShow = false }: AgentOnboardingTourProps) {
  const { user, session } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [visible, setVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [checked, setChecked] = useState(false);

  // Check if onboarding should show
  useEffect(() => {
    if (!user || checked) return;
    setChecked(true);

    if (forceShow) {
      setVisible(true);
      return;
    }

    // Check onboarding completion status
    supabase
      .from('user_profiles')
      .select('app_role, agent_onboarding_completed_at')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.app_role === 'agent' && !data?.agent_onboarding_completed_at) {
          setVisible(true);
          // Mark as started
          if (session?.access_token) {
            fetch('/api/agent/onboarding', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ action: 'start' }),
            }).catch(() => {});
          }
        }
      });
  }, [user, checked, forceShow, session]);

  const handleComplete = useCallback(async () => {
    setCompleting(true);
    try {
      if (session?.access_token) {
        await fetch('/api/agent/onboarding', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'complete' }),
        });
      }
    } catch { /* non-fatal */ }

    setVisible(false);
    setCompleting(false);
    onComplete?.();
    router.push('/agent-workspace');
  }, [session, onComplete, router]);

  const handleSkip = useCallback(() => {
    setVisible(false);
    onComplete?.();
  }, [onComplete]);

  if (!visible) return null;

  const step = AGENT_TOUR_STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === AGENT_TOUR_STEPS.length - 1;
  const progress = ((currentStep + 1) / AGENT_TOUR_STEPS.length) * 100;
  const StepIcon = step.icon;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">

        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg bg-primary/10`}>
              <StepIcon size={16} className={step.iconColor} />
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {isFirst ? 'Agent Orientation' : `Step ${currentStep} of ${AGENT_TOUR_STEPS.length - 1}`}
            </span>
          </div>
          <button
            onClick={handleSkip}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Skip tour"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Title */}
          <div>
            <h2 className="text-xl font-bold text-foreground mb-1">{step.title}</h2>
            {!isFirst && (
              <p className="text-xs text-muted-foreground">{step.subtitle}</p>
            )}
          </div>

          {/* Main content */}
          <p className="text-sm text-muted-foreground leading-relaxed">{step.content}</p>

          {/* Highlights */}
          <div className="space-y-2">
            {step.highlights.map((highlight, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <p className="text-sm text-foreground leading-snug">{highlight}</p>
              </div>
            ))}
          </div>

          {/* Tip */}
          {step.tip && (
            <div className="flex items-start gap-2.5 p-3 bg-amber-500/8 border border-amber-500/20 rounded-xl">
              <Zap size={13} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">{step.tip}</p>
            </div>
          )}
        </div>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-1.5 pb-2">
          {AGENT_TOUR_STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentStep(i)}
              className={`rounded-full transition-all ${
                i === currentStep
                  ? 'w-4 h-1.5 bg-primary' :'w-1.5 h-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50'
              }`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20">
          <button
            onClick={() => setCurrentStep(s => s - 1)}
            disabled={isFirst}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-0 transition-all"
          >
            <ChevronLeft size={14} />
            Back
          </button>

          {isFirst ? (
            <button
              onClick={() => setCurrentStep(1)}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-all"
            >
              Start Tour
              <ArrowRight size={14} />
            </button>
          ) : isLast ? (
            <button
              onClick={handleComplete}
              disabled={completing}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-60 transition-all"
            >
              {completing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Go to My Dashboard
            </button>
          ) : (
            <button
              onClick={() => setCurrentStep(s => s + 1)}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-all"
            >
              Next
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
