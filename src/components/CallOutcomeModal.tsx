'use client';

import React, { useState } from 'react';
import { Phone, PhoneOff, MessageSquare, Calendar, VoicemailIcon, ThumbsDown, ThumbsUp, X, Loader2 } from 'lucide-react';
import type { CallOutcome } from '@/lib/services/callSessionService';

interface CallOutcomeModalProps {
  contactName?: string;
  address?: string;
  durationSeconds: number;
  onSubmit: (outcome: CallOutcome, dispositionNotes: string) => void;
  onSkip: () => void;
  isSubmitting?: boolean;
}

const OUTCOMES: { value: CallOutcome; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'interested', label: 'Interested', icon: <ThumbsUp size={16} />, color: 'border-emerald-500 bg-emerald-500/10 text-emerald-600' },
  { value: 'callback', label: 'Callback Scheduled', icon: <Calendar size={16} />, color: 'border-blue-500 bg-blue-500/10 text-blue-600' },
  { value: 'not_interested', label: 'Not Interested', icon: <ThumbsDown size={16} />, color: 'border-red-500 bg-red-500/10 text-red-500' },
  { value: 'voicemail', label: 'Voicemail', icon: <VoicemailIcon size={16} />, color: 'border-amber-500 bg-amber-500/10 text-amber-600' },
  { value: 'no_answer', label: 'No Answer', icon: <PhoneOff size={16} />, color: 'border-gray-400 bg-gray-500/10 text-muted-foreground' },
  { value: 'other', label: 'Other', icon: <MessageSquare size={16} />, color: 'border-purple-500 bg-purple-500/10 text-purple-600' },
];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function CallOutcomeModal({
  contactName,
  address,
  durationSeconds,
  onSubmit,
  onSkip,
  isSubmitting = false,
}: CallOutcomeModalProps) {
  const [selectedOutcome, setSelectedOutcome] = useState<CallOutcome | null>(null);
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    if (!selectedOutcome) return;
    onSubmit(selectedOutcome, notes.trim());
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/50 backdrop-blur-sm" onClick={onSkip} />
      <div className="relative w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <Phone size={14} className="text-green-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Call Ended</p>
              <p className="text-[11px] text-muted-foreground">
                {contactName || address || 'Unknown'} · {formatDuration(durationSeconds)}
              </p>
            </div>
          </div>
          <button
            onClick={onSkip}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="text-xs font-medium text-foreground mb-3">How did the call go?</p>

          {/* Outcome grid */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {OUTCOMES.map(opt => (
              <button
                key={opt.value}
                onClick={() => setSelectedOutcome(opt.value)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                  selectedOutcome === opt.value
                    ? opt.color + 'ring-2 ring-offset-1 ring-current' :'border-border text-muted-foreground hover:border-border/80 hover:bg-muted/40'
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}
          </div>

          {/* Disposition notes */}
          <div className="mb-4">
            <label className="text-[11px] font-medium text-muted-foreground mb-1.5 block">
              Disposition Notes <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Homeowner interested but wants to discuss with spouse first. Follow up next week."
              rows={3}
              className="w-full px-3 py-2 text-xs bg-muted/40 border border-border rounded-xl resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onSkip}
              className="flex-1 py-2 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
            >
              Skip
            </button>
            <button
              onClick={handleSubmit}
              disabled={!selectedOutcome || isSubmitting}
              className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Saving…
                </>
              ) : (
                'Save & Summarize'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
