'use client';

import { Mic, Zap, BriefcaseBusiness, ThumbsUp, ThumbsDown, User, Home, CheckCircle2, Circle } from 'lucide-react';

const TRANSCRIPT = [
  { speaker: 'Agent', text: 'Hi, is this Dana? This is Alex with VAYO Property Group — I help homeowners in the Vail area explore vacation rental management.' },
  { speaker: 'Homeowner', text: "Oh, hi. I've actually looked into short-term rentals before but wasn't sure about the local rules." },
  { speaker: 'Agent', text: "Totally fair question — Vail allows short-term rentals with a registered permit, which we handle for owners we manage." },
  { speaker: 'Homeowner', text: 'That actually sounds easier than I expected. What would managing it actually look like day to day?' },
];

const CALL_OUTLINE = [
  { label: 'Introduction & rapport', done: true },
  { label: 'Property & goals discovery', done: true },
  { label: 'Regulation & permit objection', done: true },
  { label: 'Revenue estimate walkthrough', done: false },
  { label: 'Next steps & scheduling', done: false },
];

// Static, sanitized mock of the Live Call Teleprompter's real-time AI suggestion panel —
// a key differentiator vs. competing CRMs that don't coach agents live during calls.
export default function TeleprompterShowcase() {
  return (
    <div className="space-y-4">
    <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-semibold text-foreground">Live Call · 02:14</span>
          </div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">Initial Outreach</span>
        </div>
        <div className="p-4 space-y-3">
          {TRANSCRIPT.map((entry, i) => (
            <div key={i} className={`flex items-start gap-2 ${entry.speaker === 'Agent' ? '' : 'flex-row-reverse text-right'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${entry.speaker === 'Agent' ? 'bg-foreground text-background' : 'bg-primary/10 text-primary'}`}>
                {entry.speaker === 'Agent' ? <User size={12} /> : <Home size={12} />}
              </div>
              <p className="text-xs text-foreground leading-relaxed bg-muted/50 rounded-lg px-3 py-2">{entry.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-primary/30 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-primary/5">
          <Zap size={13} className="text-primary" />
          <span className="text-xs font-semibold text-foreground">AI Suggestion</span>
          <span className="ml-auto text-[10px] text-muted-foreground">Management question detected</span>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm font-medium text-foreground leading-relaxed">
            &ldquo;Day to day, our team handles guest communication, pricing, cleaning coordination, maintenance, and permit compliance. You keep visibility into performance without having to run the property yourself.&rdquo;
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400">
              <BriefcaseBusiness size={10} /> Service scope
            </span>
            <span className="text-[10px] text-muted-foreground">Source: Live conversation + property context</span>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full border border-border text-muted-foreground">
              <ThumbsUp size={11} /> Helpful
            </button>
            <button className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full border border-border text-muted-foreground">
              <ThumbsDown size={11} /> Not quite
            </button>
          </div>
        </div>
        <div className="px-4 py-2.5 border-t border-border flex items-center gap-2">
          <Mic size={12} className="text-emerald-500" />
          <span className="text-[11px] text-muted-foreground">Listening — live transcription active</span>
        </div>
      </div>
    </div>

    <div className="bg-card rounded-xl border border-border p-4">
      <p className="text-xs font-semibold text-foreground mb-3">Call Outline</p>
      <div className="flex items-center gap-4 flex-wrap">
        {CALL_OUTLINE.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            {item.done ? <CheckCircle2 size={13} className="text-emerald-500" /> : <Circle size={13} className="text-muted-foreground" />}
            <span className={`text-xs ${item.done ? 'text-foreground' : 'text-muted-foreground'}`}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}
