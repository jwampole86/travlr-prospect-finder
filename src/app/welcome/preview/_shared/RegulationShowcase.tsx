'use client';

import { Shield, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

const JURISDICTIONS = [
  { name: 'Vail, CO', status: 'PERMIT_REQUIRED', label: 'Permit Required', rule: 'Registered STR permit + local business license required annually.' },
  { name: 'Aspen, CO', status: 'RESTRICTED', label: 'Restricted', rule: 'Short-term rentals capped in residential zones; commercial zone exempt.' },
  { name: 'Naples, FL', status: 'ALLOWED', label: 'Allowed', rule: 'No permit required; county tourist tax registration only.' },
];

const STATUS_STYLES: Record<string, string> = {
  ALLOWED: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
  RESTRICTED: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300',
  PERMIT_REQUIRED: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300',
};

const STATUS_ICON: Record<string, typeof Shield> = {
  ALLOWED: CheckCircle2,
  RESTRICTED: AlertTriangle,
  PERMIT_REQUIRED: Shield,
};

// Static, sanitized mock of the STR city/state regulation compliance lookup — a
// differentiator vs. competitors that don't surface local short-term-rental law in-app.
export default function RegulationShowcase() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {JURISDICTIONS.map((j) => {
        const Icon = STATUS_ICON[j.status];
        return (
          <div key={j.name} className={`rounded-xl border p-4 ${STATUS_STYLES[j.status]}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase tracking-wide opacity-70">City STR Rules</p>
              <Icon size={14} />
            </div>
            <p className="text-sm font-bold mb-1">{j.name}</p>
            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border border-current/30 mb-2">{j.label}</span>
            <p className="text-xs leading-relaxed opacity-90">{j.rule}</p>
            <div className="flex items-center gap-1 mt-3 pt-2 border-t border-current/20 opacity-70">
              <Clock size={10} />
              <span className="text-[10px]">Last verified 14 days ago</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
