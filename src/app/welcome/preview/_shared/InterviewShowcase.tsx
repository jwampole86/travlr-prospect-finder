'use client';

import { Brain, Award, ThumbsUp, AlertCircle, Sparkles } from 'lucide-react';

const SCORES: { label: string; value: number }[] = [
  { label: 'Vacation Rental Knowledge', value: 8 },
  { label: 'Consultative Sales', value: 9 },
  { label: 'Objection Handling', value: 7 },
  { label: 'Coachability', value: 9 },
];

// Static, sanitized mock of the AI voice interview + candidate scorecard workflow — a
// differentiator vs. competitors that don't offer built-in AI hiring/interview tooling.
export default function InterviewShowcase() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4">
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <div className="w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold">JC</div>
          <div>
            <p className="text-xs font-bold text-foreground">Candidate — Property Acquisition Agent</p>
            <p className="text-[10px] text-muted-foreground">AI voice interview completed · 22 min</p>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">Overall Fit: 8.4/10</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">STRONG YES</span>
          </div>
          {SCORES.map((s) => (
            <div key={s.label} className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="font-semibold text-foreground">{s.value}/10</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${s.value * 10}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-primary/30 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-primary/5">
          <Brain size={13} className="text-primary" />
          <span className="text-xs font-semibold text-foreground">AI Post-Interview Summary</span>
          <span className="ml-auto text-[10px] text-muted-foreground">Human decision required</span>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Top Strengths</p>
            <ul className="space-y-1">
              {['Strong consultative selling style with warm, confident tone', 'Deep familiarity with STR permitting and owner objections', 'Clear examples of past pipeline management success'].map((s) => (
                <li key={s} className="flex items-start gap-1.5 text-xs text-foreground">
                  <ThumbsUp size={11} className="text-emerald-500 mt-0.5 shrink-0" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Validate Before Hiring</p>
            <div className="flex items-start gap-1.5 text-xs text-foreground">
              <AlertCircle size={11} className="text-amber-500 mt-0.5 shrink-0" />
              <span>Limited experience managing a multi-market portfolio — confirm ramp-up expectations.</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 pt-1 border-t border-border">
            <Award size={12} className="text-primary" />
            <span className="text-[11px] text-muted-foreground">Scorecard synced to Candidate Pipeline</span>
            <Sparkles size={12} className="text-primary ml-auto" />
          </div>
        </div>
      </div>
    </div>
  );
}
