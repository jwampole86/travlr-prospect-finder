import React from 'react';
import { BadgeCheck, ExternalLink } from 'lucide-react';
import { TRUST_ITEMS, TRUST_AFFILIATIONS, TRUST_STORY, ABOUT_URL } from '@/lib/homeownerTrust';
import { WEBSITE_URL, WEBSITE_LABEL, CONTACT_EMAIL, CONTACT_PHONE, telHref } from '@/lib/homeownerContact';

/** Light-palette card so it reads the same inside the funnel and the report. */
export default function TrustCard({ className = '' }: { className?: string }) {
  const a = 'font-semibold text-indigo-700 hover:underline';
  return (
    <aside className={`rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 break-inside-avoid ${className}`}>
      <p className="flex items-center gap-2 text-sm font-bold"><BadgeCheck size={16} className="text-emerald-600" /> Why homeowners trust TRAVLR</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{TRUST_STORY} Don&rsquo;t take our word for it. Every item below links to its public source.</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 print:grid-cols-2">
        {TRUST_ITEMS.map(i => (
          <li key={i.key}>
            <a href={i.href} target="_blank" rel="noopener noreferrer" className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
              <span><span className="block text-[13px] font-semibold text-slate-900">{i.title}</span><span className="block text-[11px] text-slate-500">{i.note}</span></span>
              <ExternalLink size={12} className="mt-1 shrink-0 text-slate-400 print:hidden" />
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] leading-relaxed text-slate-600">Affiliations shown on our website: {TRUST_AFFILIATIONS}.</p>
      <p className="mt-2 text-[12px] leading-relaxed text-slate-600">
        Learn more at <a href={WEBSITE_URL} target="_blank" rel="noopener noreferrer" className={a}>{WEBSITE_LABEL}</a> (<a href={ABOUT_URL} target="_blank" rel="noopener noreferrer" className={a}>our story</a>).
        Questions? <a href={`mailto:${CONTACT_EMAIL}`} className={a}>{CONTACT_EMAIL}</a>{CONTACT_PHONE && <> &middot; <a href={telHref(CONTACT_PHONE)} className={a}>{CONTACT_PHONE}</a></>}
      </p>
    </aside>
  );
}
