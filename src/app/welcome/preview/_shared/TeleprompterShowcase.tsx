'use client';

import { Mic, Zap, Shield, ThumbsUp, ThumbsDown, User, Home } from 'lucide-react';

const TRANSCRIPT = [
  { speaker: 'Agent', text: 'Hi, is this Dana? This is Alex with VAYO Property Group — I help homeowners in the Vail area explore vacation rental management.' },
  { speaker: 'Homeowner', text: "Oh, hi. I've actually looked into short-term rentals before but wasn't sure about the local rules." },
  { speaker: 'Agent', text: "Totally fair question — Vail allows short-term rentals with a registered permit, which we handle for owners we manage." },
];

// Static, sanitized mock of the Live Call Teleprompter's real-time AI suggestion panel —
// a key differentiator vs. competing CRMs that don't coach agents live during calls.
export default function TeleprompterShowcase() {
  return (
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
          <span className="ml-auto text-[10px] text-muted-foreground">Objection detected</span>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm font-medium text-foreground leading-relaxed">
            &ldquo;Great question — Vail currently allows short-term rentals with a registered permit, and we handle that entire registration process for the homeowners we manage, so there&apos;s nothing extra for you to file.&rdquo;
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400">
              <Shield size={10} /> Regulation objection
            </span>
            <span className="text-[10px] text-muted-foreground">Source: Objection Library</span>
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
  );
}
