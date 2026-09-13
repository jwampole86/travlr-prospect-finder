import { Check, Minus } from 'lucide-react';
import { FEATURE_COMPARISON, PLAN_ORDER, PROSPECT_FINDER_PLANS, type FeatureAvailability } from '@/lib/pricing/prospectFinderPlans';

function AvailabilityCell({ value }: { value: FeatureAvailability }) {
  if (value === 'yes') return <Check className="w-4 h-4 text-primary mx-auto" />;
  if (value === 'limited') return <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Limited</span>;
  return <Minus className="w-4 h-4 text-muted-foreground/40 mx-auto" />;
}

export default function ComparisonTable() {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="bg-muted/40 border-b border-border">
            <th className="text-left px-5 py-3.5 font-semibold text-foreground">Feature</th>
            {PLAN_ORDER.map((id) => (
              <th key={id} className="px-5 py-3.5 font-semibold text-foreground text-center">
                {PROSPECT_FINDER_PLANS[id].name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FEATURE_COMPARISON.map((row, idx) => (
            <tr key={row.key} className={idx % 2 === 1 ? 'bg-muted/20' : ''}>
              <td className="px-5 py-3 text-foreground font-medium whitespace-nowrap">{row.label}</td>
              {PLAN_ORDER.map((id) => (
                <td key={id} className="px-5 py-3 text-center">
                  <AvailabilityCell value={row.values[id]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
