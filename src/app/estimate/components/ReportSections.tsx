'use client';

import React from 'react';
import {
  FileCheck2, ClipboardCheck, LayoutDashboard, CheckCircle2, AlertTriangle, ExternalLink, Clock, DollarSign,
  Wallet, CalendarDays, ListChecks, Bell, FileText, MessageSquare, ShieldCheck, Camera, Lock, Volume2, Siren, Flame, Wind, BriefcaseMedical,
} from 'lucide-react';
import type { HomeownerReport } from '@/lib/homeownerEstimateTypes';
import {
  buildEquipmentView, TYPICAL_PERMIT_COSTS, TYPICAL_PERMIT_STEPS, TYPICAL_PROCESSING, PERMIT_HELP, SETUP_HELP, OWNER_DASHBOARD,
  type EquipmentKey,
} from '@/lib/homeownerReportContent';

function SectionTitle({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mb-5 break-inside-avoid break-after-avoid">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-600">{eyebrow}</p>
      <h2 className="mt-1 text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">{title}</h2>
      {sub && <p className="mt-1.5 text-sm text-slate-600 leading-relaxed max-w-2xl">{sub}</p>}
    </div>
  );
}

// ─── Permits: what they cost and the steps ───────────────────────────────────

export function PermitsSection({ report }: { report: HomeownerReport }) {
  const reg = report.regulation;
  const permit = reg.permit;
  const place = [report.city, report.state].filter(Boolean).join(', ') || 'your area';
  const needs = reg.requirements.filter(r => r.required === true && /^(permit|license|registration|inspection)$/i.test(r.label)).map(r => r.label.toLowerCase());
  const noneRequired = reg.found && reg.requirements.some(r => /^permit$/i.test(r.label) && r.required === false) && !needs.length;
  const steps = permit?.steps.length ? permit.steps : TYPICAL_PERMIT_STEPS;

  return (
    <section>
      <SectionTitle
        eyebrow="Permits & licenses"
        title={noneRequired ? 'No city permit appears to be required' : 'What it takes to get licensed, and what it costs'}
        sub={noneRequired
          ? `${place} does not list a short-term rental permit, but a business license and lodging-tax registration can still apply. Your specialist confirms which ones fit your address.`
          : `Most homeowners have never done this before, and that is fine. We have been through it in many markets, and your specialist walks you through every step.`}
      />

      <div className="grid lg:grid-cols-5 print:grid-cols-5 gap-4">
        <div className="lg:col-span-3 print:col-span-3 space-y-4">
          <div className="break-inside-avoid rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2"><DollarSign size={14} /> Typical costs</p>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${permit ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                {permit ? `Specific to ${place}` : 'General estimates'}
              </span>
            </div>
            {permit ? (
              <div className="px-5 py-4 space-y-3 text-sm text-slate-700 leading-relaxed">
                {permit.name && <p className="font-semibold text-slate-900">{permit.name}</p>}
                {permit.costSummary && <p>{permit.costSummary}</p>}
                {permit.renewal && <p><span className="text-slate-500">Renewal:</span> {permit.renewal}</p>}
                {permit.processingTime && <p className="flex items-start gap-2"><Clock size={14} className="mt-1 shrink-0 text-slate-400" /><span><span className="text-slate-500">Timing:</span> {permit.processingTime}</span></p>}
                {permit.applicationUrl && <a href={permit.applicationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-700 font-semibold hover:underline">Official application page <ExternalLink size={12} /></a>}
              </div>
            ) : (
              <>
                <ul className="divide-y divide-slate-100">
                  {TYPICAL_PERMIT_COSTS.map(c => (
                    <li key={c.label} className="px-5 py-3 text-sm flex flex-col sm:flex-row sm:items-start sm:gap-4">
                      <span className="sm:w-56 shrink-0 font-medium text-slate-800">{c.label}</span>
                      <span className="text-slate-600">{c.range}</span>
                    </li>
                  ))}
                </ul>
                <p className="px-5 py-3 bg-amber-50 border-t border-amber-100 text-[12px] text-amber-900 leading-relaxed">
                  These are typical ranges across U.S. markets, not the fees for {place}. We have not yet verified your city&rsquo;s exact figures. Your specialist confirms the real amounts before you pay anything. {TYPICAL_PROCESSING}
                </p>
              </>
            )}
          </div>

          <div className="break-inside-avoid rounded-2xl border border-slate-200 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2"><ListChecks size={14} /> The steps</p>
            <ol className="mt-3 space-y-2.5">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm text-slate-700 leading-relaxed">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
            {!permit && <p className="mt-3 text-[11px] text-slate-500">Typical sequence. The order and forms in {place} may differ.</p>}
          </div>
        </div>

        <aside className="lg:col-span-2 print:col-span-2 break-inside-avoid rounded-2xl bg-indigo-50 border border-indigo-200 p-5 self-start">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-2"><FileCheck2 size={14} /> How TRAVLR helps</p>
          <ul className="mt-3 space-y-3">
            {PERMIT_HELP.map(h => (
              <li key={h} className="flex gap-2.5 text-sm text-slate-700 leading-relaxed"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-indigo-600" />{h}</li>
            ))}
          </ul>
          <p className="mt-4 text-[12px] text-slate-600 leading-relaxed">Permit fees are paid to the city and are separate from TRAVLR&rsquo;s management fee.</p>
        </aside>
      </div>
    </section>
  );
}

// ─── Safety & smart-home checklist, tailored to what the home already has ────

const ICONS: Record<EquipmentKey, React.ReactNode> = {
  smoke: <Flame size={16} />, co: <Wind size={16} />, extinguisher: <ShieldCheck size={16} />, lock: <Lock size={16} />,
  doorbell: <Camera size={16} />, noise: <Volume2 size={16} />, alarm: <Siren size={16} />, firstaid: <BriefcaseMedical size={16} />,
};

export function SafetySection({ report, equipment }: { report: HomeownerReport; equipment: EquipmentKey[] | null }) {
  const place = [report.city, report.state].filter(Boolean).join(', ') || 'your area';
  const tailored = equipment !== null;
  const { items, otherCity, mustHaveCount: needCount } = buildEquipmentView(equipment, report.regulation.permit?.safety ?? []);

  return (
    <section>
      <SectionTitle
        eyebrow="Safety & smart-home setup"
        title="Getting the home guest-ready"
        sub={tailored
          ? `Based on what you told us the home already has${needCount ? `, here is what is worth adding first (${needCount} must-have${needCount === 1 ? '' : 's'}).` : ', you are in good shape on the essentials.'}`
          : 'The safety essentials and smart-home equipment that make a rental safer to operate. Tell us what the home already has and we will tailor this list.'}
      />
      <div className="grid sm:grid-cols-2 print:grid-cols-2 gap-3">
        {items.map(({ item: e, status, cityRequired }) => (
          <div key={e.key} className={`break-inside-avoid rounded-xl border p-4 ${status === 'need' ? 'border-amber-300 bg-amber-50/60' : status === 'have' ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
            <div className="flex flex-col gap-1.5">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><span className="text-indigo-600 shrink-0">{ICONS[e.key]}</span>{e.label}</p>
              <div className="flex flex-wrap gap-1">
                {cityRequired && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">Required in {place}</span>}
                {status === 'have' && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">You have this</span>}
                {status === 'need' && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">Add this</span>}
                {status === 'optional' && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">Recommended</span>}
              </div>
            </div>
            <p className="mt-1.5 text-[13px] text-slate-600 leading-relaxed">{e.why}</p>
            {e.note && <p className="mt-1.5 text-[12px] text-slate-600 leading-relaxed flex gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-600" />{e.note}</p>}
            {status !== 'have' && <p className="mt-2 text-[12px] text-slate-500">Typical cost: <strong className="text-slate-700">{e.cost}</strong></p>}
          </div>
        ))}
      </div>

      {otherCity.length > 0 && (
        <div className="mt-4 break-inside-avoid rounded-2xl border border-slate-200 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Also required by the city in {place}</p>
          <ul className="mt-3 space-y-2">
            {otherCity.map(s => (
              <li key={s.item} className="flex gap-2.5 text-sm text-slate-700 leading-relaxed">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-indigo-500" />
                <span><strong>{s.item}.</strong> {s.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-sm text-slate-600 leading-relaxed">{SETUP_HELP} Costs shown are typical retail ranges and vary by brand and installation.</p>
    </section>
  );
}

// ─── Owner dashboard ─────────────────────────────────────────────────────────

const DASH_ICONS = [<Wallet key="w" size={18} />, <CalendarDays key="c" size={18} />, <ClipboardCheck key="k" size={18} />, <Bell key="b" size={18} />, <FileText key="f" size={18} />, <MessageSquare key="m" size={18} />];

export function OwnerDashboardSection() {
  return (
    <section className="break-inside-avoid">
      <SectionTitle
        eyebrow="Your owner dashboard"
        title="See everything about your home in one place"
        sub="When you join TRAVLR you get your own secure homeowner dashboard. No chasing emails or spreadsheets: your earnings, bookings and updates are always a click away."
      />
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5 sm:p-6">
        <div className="flex items-center gap-2 text-indigo-700 text-xs font-bold uppercase tracking-wider"><LayoutDashboard size={14} /> Included with every home</div>
        <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3 gap-3">
          {OWNER_DASHBOARD.map((f, i) => (
            <div key={f.title} className="break-inside-avoid rounded-xl bg-white border border-slate-200 p-4">
              <span className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">{DASH_ICONS[i]}</span>
              <p className="mt-3 text-sm font-semibold text-slate-900">{f.title}</p>
              <p className="mt-1 text-[13px] text-slate-600 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
