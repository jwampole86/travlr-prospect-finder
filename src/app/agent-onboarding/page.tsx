'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { User, MessageSquare, BookOpen, Calendar, CheckCircle, ChevronRight, ChevronLeft, ArrowRight, Loader2, AlertCircle, Phone, Mail, Check,  } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OnboardingState {
  // Step 1: Profile
  fullName: string;
  phone: string;
  bio: string;
  avatarInitials: string;
  // Step 2: Timezone & SMS
  timezone: string;
  smsOptIn: boolean;
  smsFromNumber: string;
  dailySmsLimit: number;
  // Step 3: Templates
  selectedTemplateIds: string[];
  // Step 4: Calendar
  calendarSync: 'none' | 'google' | 'outlook' | 'apple';
  workingHoursStart: string;
  workingHoursEnd: string;
  workingDays: string[];
  reminderMinutes: number;
}

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'America/Phoenix', 'America/Anchorage',
  'Pacific/Honolulu',
];

const TIMEZONE_LABELS: Record<string, string> = {
  'America/New_York': 'Eastern (ET)',
  'America/Chicago': 'Central (CT)',
  'America/Denver': 'Mountain (MT)',
  'America/Los_Angeles': 'Pacific (PT)',
  'America/Phoenix': 'Arizona (AZ)',
  'America/Anchorage': 'Alaska (AKT)',
  'Pacific/Honolulu': 'Hawaii (HST)',
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MOCK_TEMPLATES = [
  { id: 'tpl-1', name: 'Initial Outreach', type: 'sms', tag: 'outreach', description: 'First contact with homeowner' },
  { id: 'tpl-2', name: 'Follow-Up #1', type: 'sms', tag: 'follow up', description: 'Re-engage after no response' },
  { id: 'tpl-3', name: 'Check-In / Re-Engage', type: 'sms', tag: 'follow up', description: 'Warm check-in message' },
  { id: 'tpl-4', name: 'Proposal Introduction', type: 'sms', tag: 'proposal', description: 'Formal proposal with terms' },
  { id: 'tpl-5', name: 'Closing / Contract', type: 'sms', tag: 'closing', description: 'Move to contract stage' },
  { id: 'tpl-6', name: 'Luxury Welcome Email', type: 'email', tag: 'outreach', description: 'Premium email introduction' },
  { id: 'tpl-7', name: 'ROI Breakdown Email', type: 'email', tag: 'proposal', description: 'Revenue projection email' },
];

const STEPS = [
  { id: 1, label: 'Profile', icon: User, description: 'Complete your agent profile' },
  { id: 2, label: 'Timezone & SMS', icon: MessageSquare, description: 'Set timezone and SMS preferences' },
  { id: 3, label: 'Templates', icon: BookOpen, description: 'Choose your template library' },
  { id: 4, label: 'Calendar', icon: Calendar, description: 'Configure calendar sync' },
];

const DEFAULT_STATE: OnboardingState = {
  fullName: '',
  phone: '',
  bio: '',
  avatarInitials: '',
  timezone: 'America/Los_Angeles',
  smsOptIn: false,
  smsFromNumber: '',
  dailySmsLimit: 50,
  selectedTemplateIds: [],
  calendarSync: 'none',
  workingHoursStart: '09:00',
  workingHoursEnd: '18:00',
  workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  reminderMinutes: 15,
};

// ─── Step Components ──────────────────────────────────────────────────────────

function StepProfile({ state, onChange }: { state: OnboardingState; onChange: (k: keyof OnboardingState, v: any) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Full Name *</label>
        <input
          type="text"
          value={state.fullName}
          onChange={e => onChange('fullName', e.target.value)}
          placeholder="e.g. Alex Rivera"
          className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Phone Number</label>
        <input
          type="tel"
          value={state.phone}
          onChange={e => onChange('phone', e.target.value)}
          placeholder="+1 (555) 000-0000"
          className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Short Bio</label>
        <textarea
          value={state.bio}
          onChange={e => onChange('bio', e.target.value)}
          placeholder="Tell homeowners a bit about yourself and your experience with vacation rentals..."
          rows={3}
          className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Avatar Initials</label>
        <input
          type="text"
          value={state.avatarInitials}
          onChange={e => onChange('avatarInitials', e.target.value.toUpperCase().slice(0, 2))}
          placeholder="AR"
          maxLength={2}
          className="w-24 px-3 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary uppercase"
        />
        <p className="text-[11px] text-muted-foreground mt-1">2 characters shown in your avatar when no photo is set</p>
      </div>
      {/* Preview */}
      {state.fullName && (
        <div className="flex items-center gap-3 p-4 bg-muted/40 border border-border rounded-xl">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
            {state.avatarInitials || state.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{state.fullName}</p>
            {state.phone && <p className="text-xs text-muted-foreground">{state.phone}</p>}
            {state.bio && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{state.bio}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function StepTimezone({ state, onChange }: { state: OnboardingState; onChange: (k: keyof OnboardingState, v: any) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Your Timezone *</label>
        <select
          value={state.timezone}
          onChange={e => onChange('timezone', e.target.value)}
          className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        >
          {TIMEZONES.map(tz => (
            <option key={tz} value={tz}>{TIMEZONE_LABELS[tz]}</option>
          ))}
        </select>
        <p className="text-[11px] text-muted-foreground mt-1">Used to schedule outreach and display timestamps correctly</p>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-emerald-500" />
            <span className="text-sm font-semibold text-foreground">SMS Opt-In</span>
          </div>
          <button
            onClick={() => onChange('smsOptIn', !state.smsOptIn)}
            className={`relative w-10 h-5 rounded-full transition-colors ${state.smsOptIn ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${state.smsOptIn ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            By enabling SMS, you confirm you have obtained proper consent from recipients per TCPA guidelines. All SMS messages will include an opt-out instruction.
          </p>
          {state.smsOptIn && (
            <>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">SMS From Number (optional)</label>
                <input
                  type="tel"
                  value={state.smsFromNumber}
                  onChange={e => onChange('smsFromNumber', e.target.value)}
                  placeholder="Leave blank to use system default"
                  className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Daily SMS Limit</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={10}
                    max={200}
                    step={10}
                    value={state.dailySmsLimit}
                    onChange={e => onChange('dailySmsLimit', Number(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                  <span className="text-sm font-bold text-foreground w-12 text-right">{state.dailySmsLimit}/day</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
        <AlertCircle size={13} className="text-amber-500 mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          SMS messages are sent during business hours in your selected timezone. Messages scheduled outside those hours will be queued for the next available window.
        </p>
      </div>
    </div>
  );
}

function StepTemplates({ state, onChange }: { state: OnboardingState; onChange: (k: keyof OnboardingState, v: any) => void }) {
  function toggleTemplate(id: string) {
    const current = state.selectedTemplateIds;
    if (current.includes(id)) {
      onChange('selectedTemplateIds', current.filter(t => t !== id));
    } else {
      onChange('selectedTemplateIds', [...current, id]);
    }
  }

  const emailTemplates = MOCK_TEMPLATES.filter(t => t.type === 'email');
  const smsTemplates = MOCK_TEMPLATES.filter(t => t.type === 'sms');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Select the templates you want quick access to in your outreach workflow.</p>
        <button
          onClick={() => onChange('selectedTemplateIds', MOCK_TEMPLATES.map(t => t.id))}
          className="text-xs text-primary hover:underline font-medium"
        >
          Select All
        </button>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">SMS Templates</p>
        <div className="space-y-2">
          {smsTemplates.map(tpl => {
            const selected = state.selectedTemplateIds.includes(tpl.id);
            return (
              <button
                key={tpl.id}
                onClick={() => toggleTemplate(tpl.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                  selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                }`}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  selected ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                }`}>
                  {selected && <Check size={11} className="text-primary-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{tpl.name}</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[10px] font-semibold">{tpl.tag}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
                </div>
                <MessageSquare size={14} className="text-emerald-500 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Email Templates</p>
        <div className="space-y-2">
          {emailTemplates.map(tpl => {
            const selected = state.selectedTemplateIds.includes(tpl.id);
            return (
              <button
                key={tpl.id}
                onClick={() => toggleTemplate(tpl.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                  selected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                }`}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  selected ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                }`}>
                  {selected && <Check size={11} className="text-primary-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{tpl.name}</span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 text-[10px] font-semibold">{tpl.tag}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
                </div>
                <Mail size={14} className="text-blue-500 shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        {state.selectedTemplateIds.length} of {MOCK_TEMPLATES.length} templates selected · You can change this anytime in Message Templates
      </p>
    </div>
  );
}

function StepCalendar({ state, onChange }: { state: OnboardingState; onChange: (k: keyof OnboardingState, v: any) => void }) {
  const calendarOptions = [
    { id: 'none', label: 'No Calendar Sync', icon: '—', description: 'Skip for now, configure later in Settings' },
    { id: 'google', label: 'Google Calendar', icon: '📅', description: 'Sync with Google Workspace or personal Gmail' },
    { id: 'outlook', label: 'Microsoft Outlook', icon: '📆', description: 'Sync with Office 365 or Outlook.com' },
    { id: 'apple', label: 'Apple Calendar', icon: '🗓', description: 'Sync with iCloud Calendar' },
  ] as const;

  function toggleDay(day: string) {
    const days = state.workingDays;
    if (days.includes(day)) {
      onChange('workingDays', days.filter(d => d !== day));
    } else {
      onChange('workingDays', [...days, day]);
    }
  }

  return (
    <div className="space-y-5">
      {/* Calendar provider */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Calendar Provider</p>
        <div className="grid grid-cols-2 gap-2">
          {calendarOptions.map(opt => (
            <button
              key={opt.id}
              onClick={() => onChange('calendarSync', opt.id)}
              className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                state.calendarSync === opt.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
              }`}
            >
              <span className="text-lg leading-none mt-0.5">{opt.icon}</span>
              <div>
                <p className="text-xs font-semibold text-foreground">{opt.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{opt.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Working hours */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Working Hours</p>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-[11px] text-muted-foreground">Start</label>
            <input
              type="time"
              value={state.workingHoursStart}
              onChange={e => onChange('workingHoursStart', e.target.value)}
              className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary mt-1"
            />
          </div>
          <span className="text-muted-foreground mt-5">–</span>
          <div className="flex-1">
            <label className="text-[11px] text-muted-foreground">End</label>
            <input
              type="time"
              value={state.workingHoursEnd}
              onChange={e => onChange('workingHoursEnd', e.target.value)}
              className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary mt-1"
            />
          </div>
        </div>
      </div>

      {/* Working days */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Working Days</p>
        <div className="flex gap-2 flex-wrap">
          {DAYS.map(day => (
            <button
              key={day}
              onClick={() => toggleDay(day)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                state.workingDays.includes(day)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted text-muted-foreground border-border hover:border-primary/30'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      </div>

      {/* Reminder */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Follow-Up Reminder</p>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={5}
            max={60}
            step={5}
            value={state.reminderMinutes}
            onChange={e => onChange('reminderMinutes', Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <span className="text-sm font-bold text-foreground w-20 text-right">{state.reminderMinutes} min before</span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">Reminder notification before scheduled follow-up calls</p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AgentOnboardingPage() {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [state, setState] = useState<OnboardingState>({
    ...DEFAULT_STATE,
    fullName: user?.user_metadata?.full_name || '',
    avatarInitials: user?.user_metadata?.full_name
      ? user.user_metadata.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
      : '',
  });

  function handleChange(key: keyof OnboardingState, value: any) {
    setState(prev => ({ ...prev, [key]: value }));
  }

  function canProceed(): boolean {
    if (currentStep === 1) return state.fullName.trim().length > 0;
    if (currentStep === 2) return !!state.timezone;
    return true;
  }

  async function handleFinish() {
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        await supabase.from('user_profiles').upsert({
          id: authUser.id,
          full_name: state.fullName,
          phone: state.phone,
          bio: state.bio,
          avatar_initials: state.avatarInitials || state.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2),
          timezone: state.timezone,
          sms_opt_in: state.smsOptIn,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      }
      setCompleted(true);
    } catch {
      toast.error('Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (completed) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6">
            <CheckCircle size={40} className="text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">You're all set, {state.fullName.split(' ')[0]}!</h2>
          <p className="text-muted-foreground max-w-md mb-8">
            Your agent profile is complete. You can now access leads, send outreach, and manage your pipeline.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-xl mb-8">
            {[
              { label: 'Profile', icon: User, done: true },
              { label: 'Timezone & SMS', icon: MessageSquare, done: true },
              { label: 'Templates', icon: BookOpen, done: state.selectedTemplateIds.length > 0 },
              { label: 'Calendar', icon: Calendar, done: state.calendarSync !== 'none' },
            ].map(item => (
              <div key={item.label} className={`flex flex-col items-center gap-2 p-4 rounded-xl border ${item.done ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-muted/30'}`}>
                <item.icon size={20} className={item.done ? 'text-emerald-500' : 'text-muted-foreground'} />
                <span className="text-xs font-medium text-foreground">{item.label}</span>
                {item.done ? <CheckCircle size={12} className="text-emerald-500" /> : <span className="text-[10px] text-muted-foreground">Skipped</span>}
              </div>
            ))}
          </div>
          <a
            href="/lead-management"
            className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors"
          >
            Go to Lead Management
            <ArrowRight size={16} />
          </a>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-card shrink-0">
          <h1 className="text-lg font-bold text-foreground">Agent Setup</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Complete your profile to start working leads</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-6 space-y-6">
            {/* Step progress */}
            <div className="flex items-center gap-0">
              {STEPS.map((step, i) => {
                const done = step.id < currentStep;
                const active = step.id === currentStep;
                return (
                  <React.Fragment key={step.id}>
                    <div className="flex flex-col items-center gap-1.5 flex-1">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                        done ? 'bg-emerald-500 border-emerald-500' : active ?'bg-primary border-primary': 'bg-muted border-border'
                      }`}>
                        {done ? (
                          <CheckCircle size={16} className="text-white" />
                        ) : (
                          <step.icon size={15} className={active ? 'text-primary-foreground' : 'text-muted-foreground'} />
                        )}
                      </div>
                      <span className={`text-[10px] font-semibold text-center leading-tight ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {step.label}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`h-0.5 flex-1 mb-5 transition-colors ${done ? 'bg-emerald-500' : 'bg-border'}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Step card */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-border bg-muted/20">
                <div className="flex items-center gap-3">
                  {React.createElement(STEPS[currentStep - 1].icon, { size: 18, className: 'text-primary' })}
                  <div>
                    <h2 className="text-sm font-bold text-foreground">{STEPS[currentStep - 1].label}</h2>
                    <p className="text-xs text-muted-foreground">{STEPS[currentStep - 1].description}</p>
                  </div>
                  <span className="ml-auto text-xs text-muted-foreground">Step {currentStep} of {STEPS.length}</span>
                </div>
              </div>
              <div className="p-6">
                {currentStep === 1 && <StepProfile state={state} onChange={handleChange} />}
                {currentStep === 2 && <StepTimezone state={state} onChange={handleChange} />}
                {currentStep === 3 && <StepTemplates state={state} onChange={handleChange} />}
                {currentStep === 4 && <StepCalendar state={state} onChange={handleChange} />}
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setCurrentStep(s => s - 1)}
                disabled={currentStep === 1}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} />
                Back
              </button>

              <div className="flex items-center gap-2">
                {currentStep < STEPS.length && (
                  <button
                    onClick={() => setCurrentStep(s => s + 1)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Skip this step
                  </button>
                )}
                {currentStep < STEPS.length ? (
                  <button
                    onClick={() => setCurrentStep(s => s + 1)}
                    disabled={!canProceed()}
                    className="flex items-center gap-1.5 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                    <ChevronRight size={14} />
                  </button>
                ) : (
                  <button
                    onClick={handleFinish}
                    disabled={saving || !canProceed()}
                    className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                    {saving ? 'Saving...' : 'Complete Setup'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
