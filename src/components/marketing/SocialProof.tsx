'use client';

import { useEffect, useState } from 'react';
import { Database, MapPin, Phone, Home } from 'lucide-react';

interface Stats { leads: number; phones: number; listings: number; states: number }

const STACK = ['Twilio', 'DocuSign', 'Supabase', 'Vercel', 'Anthropic', 'Resend'];

// Only claims we can back: TRAVLR Vacation Homes runs on the platform, and the counts come from the production database.
export default function SocialProof({ id }: { id?: string }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/public/platform-stats').then((r) => (r.ok ? r.json() : null)).then((j) => { if (live && j && typeof j.leads === 'number') setStats(j); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const tiles = stats ? [
    { icon: Database, value: `${stats.leads.toLocaleString()}+`, label: 'homeowner leads researched and scored' },
    { icon: Phone, value: `${stats.phones.toLocaleString()}+`, label: 'leads with a working phone number' },
    { icon: Home, value: `${stats.listings.toLocaleString()}+`, label: 'Airbnb and Vrbo listings tracked for Co-Host' },
    ...(stats.states >= 10 ? [{ icon: MapPin, value: String(stats.states), label: 'states with leads in the platform' }] : []),
  ] : [];

  return (
    <section id={id} className="max-w-5xl mx-auto px-5 sm:px-6 pb-14 sm:pb-20 scroll-mt-20">
      <div className="text-center mb-8">
        <p className="text-xs font-bold tracking-[0.16em] text-primary uppercase mb-3">Proof, not promises</p>
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">Built by a Working Vacation Rental Operator</h2>
      </div>

      <div className="grid lg:grid-cols-[1.05fr_1fr] gap-5">
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-7 flex flex-col">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/travlr-badge.png" alt="TRAVLR Vacation Homes" width={48} height={48} className="rounded-xl shrink-0" />
            <div>
              <p className="text-base font-bold text-foreground">TRAVLR Vacation Homes</p>
              <p className="text-xs text-muted-foreground">Vacation rental operator and AVYRO AI&apos;s first customer</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
            AVYRO AI started as TRAVLR&apos;s own growth engine. TRAVLR Vacation Homes runs its homeowner acquisition and Co-Host outreach on the same platform you would use, so every feature has to hold up in a real operation, not just a demo.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-foreground">
            {['Texting that respects quiet hours, one touch per owner and every opt-out', 'Owner and phone verification before anyone is contacted', 'A live pipeline from first text to signed agreement'].map((t) => (
              <li key={t} className="flex items-start gap-2"><span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />{t}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 sm:p-7">
          <p className="text-sm font-bold text-foreground">Running in production today</p>
          <div className="mt-4 grid grid-cols-2 gap-3 min-h-[168px]">
            {(tiles.length ? tiles : Array.from({ length: 4 }).map((_, i) => ({ icon: Database, value: '', label: '', key: i }))).map((t, i) => (
              <div key={i} className="rounded-xl bg-muted/40 border border-border p-4">
                {t.value ? (
                  <>
                    <t.icon className="w-4 h-4 text-primary mb-2" />
                    <p className="text-2xl font-bold text-foreground font-mono-data">{t.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground leading-snug">{t.label}</p>
                  </>
                ) : <div className="h-[72px] animate-pulse rounded-lg bg-muted/60" />}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">Counts come straight from the production database, rounded down, and refresh hourly.</p>
        </div>
      </div>

      <div className="mt-6 text-center">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.14em] mb-3">Runs on infrastructure you already trust</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {STACK.map((name) => <span key={name} className="px-3.5 py-1.5 rounded-full border border-border bg-card text-xs font-semibold text-foreground">{name}</span>)}
        </div>
      </div>
    </section>
  );
}
