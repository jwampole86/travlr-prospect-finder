import React from 'react';
import { Crown, Clock, TrendingUp, ShieldCheck, FileCheck2, Star, X, Check } from 'lucide-react';
import { WHY_TITLE, WHY_INTRO, WHY_ITEMS, type WhyItem } from '@/lib/homeownerTrust';

const ICONS: Record<WhyItem['key'], React.ComponentType<{ size?: number; className?: string }>> = {
  guests: Crown, time: Clock, pricing: TrendingUp, protection: ShieldCheck, compliance: FileCheck2, reputation: Star,
};

/** Light palette so it reads the same in the funnel and in the report. */
export default function WhyTravlrCard({ className = '' }: { className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 text-slate-900 ${className}`}>
      <p className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700"><Star size={12} /> 10+ years of experience</p>
      <h2 className="mt-3 text-lg sm:text-xl font-bold leading-snug">{WHY_TITLE}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{WHY_INTRO}</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 print:grid-cols-2">
        {WHY_ITEMS.map(i => {
          const Icon = ICONS[i.key];
          return (
            <li key={i.key} className="break-inside-avoid rounded-xl border border-slate-200 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><Icon size={15} /></span>{i.title}</p>
              <p className="mt-2.5 flex items-start gap-2 text-[13px] leading-relaxed text-slate-500"><X size={14} className="mt-0.5 shrink-0 text-rose-400" /><span><span className="sr-only">On your own: </span>{i.alone}</span></p>
              <p className="mt-1.5 flex items-start gap-2 text-[13px] leading-relaxed text-slate-800"><Check size={14} className="mt-0.5 shrink-0 text-emerald-600" /><span><span className="sr-only">With TRAVLR: </span>{i.withUs}</span></p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
