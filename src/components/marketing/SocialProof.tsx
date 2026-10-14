'use client';

import { useEffect, useState } from 'react';
import { MessageSquareText, ShieldCheck, Database } from 'lucide-react';

interface Stats { leads: number; phones: number; verified: number; texts: number; replies: number; optOuts: number }

const STACK = ['Twilio', 'DocuSign', 'Supabase', 'Vercel', 'Anthropic', 'Resend'];
const n = (v: number) => v.toLocaleString();

// Every figure is a production count; nothing here is a testimonial we cannot source.
export default function SocialProof({ id }: { id?: string }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/public/platform-stats').then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j && typeof j.leads === 'number') setStats(j); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const proofs = stats ? [
    {
      icon: MessageSquareText,
      big: `${n(stats.texts)}+`,
      headline: 'homeowner texts sent',
      detail: `${n(stats.replies)} owners wrote back. Every text followed quiet hours, one touch per owner and instant opt-out handling.`,
    },
    {
      icon: ShieldCheck,
      big: `${n(stats.verified)}+`,
      headline: 'fully verified leads',
      detail: 'Owner, phone and address all confirmed before anyone is contacted.',
    },
    {
      icon: Database,
      big: `${n(stats.leads)}+`,
      headline: 'homeowner leads researched',
      detail: `${n(stats.phones)}+ with a working phone number, each scored so the best opportunities are worked first.`,
    },
  ] : [];

  return (
    <section id={id} className="max-w-5xl mx-auto px-5 sm:px-6 pb-14 sm:pb-20 scroll-mt-20">
      <div className="text-center mb-8">
        <p className="text-xs font-bold tracking-[0.16em] text-primary uppercase mb-3">Proof, not promises</p>
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">Proven in a Working Vacation Rental Business</h2>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/travlr-badge.png" alt="TRAVLR Vacation Homes" width={52} height={52} className="rounded-xl shrink-0" />
        <div className="min-w-0">
          <p className="text-base font-bold text-foreground">TRAVLR Vacation Homes</p>
          <p className="mt-0.5 text-sm text-muted-foreground leading-snug">Runs its homeowner outreach, Co-Host offers and sales pipeline on AVYRO AI. Every feature has to hold up in a real operation, not a demo.</p>
        </div>
      </div>

      <div className="mt-4 grid sm:grid-cols-3 gap-4 min-h-[200px]">
        {(proofs.length ? proofs : Array.from({ length: 3 }).map(() => null)).map((p, i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            {p ? (
              <>
                <p.icon className="w-5 h-5 text-primary" />
                <p className="mt-3 text-3xl sm:text-4xl font-bold text-foreground font-mono-data">{p.big}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{p.headline}</p>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{p.detail}</p>
              </>
            ) : <div className="h-[150px] animate-pulse rounded-lg bg-muted/60" />}
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">Figures come straight from the production database, rounded down, and refresh hourly.</p>

      <div className="mt-6 text-center">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.14em] mb-3">Runs on infrastructure you already trust</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {STACK.map((name) => <span key={name} className="px-3.5 py-1.5 rounded-full border border-border bg-card text-xs font-semibold text-foreground">{name}</span>)}
        </div>
      </div>
    </section>
  );
}
