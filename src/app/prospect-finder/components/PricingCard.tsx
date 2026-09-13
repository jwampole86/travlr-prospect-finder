import Link from 'next/link';
import { Check } from 'lucide-react';
import type { ProspectFinderPlan } from '@/lib/pricing/prospectFinderPlans';

export default function PricingCard({ plan, currentPlanId }: { plan: ProspectFinderPlan; currentPlanId?: string }) {
  const isCurrentPlan = currentPlanId === plan.id;
  const isEnterprise = plan.id === 'enterprise';

  return (
    <div
      className={`relative flex flex-col rounded-2xl p-6 sm:p-7 h-full ${
        isEnterprise
          ? 'bg-foreground text-background border-2 border-foreground shadow-xl'
          : plan.highlighted
            ? 'bg-card border-2 border-primary shadow-lg'
            : 'bg-card border border-border'
      }`}
    >
      {plan.badge && (
        <span
          className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase ${
            isEnterprise ? 'bg-background text-foreground' : 'bg-primary text-primary-foreground'
          }`}
        >
          {plan.badge}
        </span>
      )}

      <div className="mb-5">
        <h3 className={`text-lg font-bold ${isEnterprise ? 'text-background' : 'text-foreground'}`}>{plan.name}</h3>
        <p className={`text-xs mt-1.5 leading-relaxed ${isEnterprise ? 'text-background/70' : 'text-muted-foreground'}`}>{plan.tagline}</p>
      </div>

      <div className="mb-6">
        {plan.contactSales ? (
          <p className={`text-2xl font-bold ${isEnterprise ? 'text-background' : 'text-foreground'}`}>Custom Pricing</p>
        ) : (
          <p className={`text-3xl font-bold ${isEnterprise ? 'text-background' : 'text-foreground'}`}>
            ${plan.monthlyPrice}
            <span className={`text-sm font-medium ${isEnterprise ? 'text-background/70' : 'text-muted-foreground'}`}>/month</span>
          </p>
        )}
      </div>

      {isCurrentPlan ? (
        <span className="mb-4 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-muted text-muted-foreground">
          Current Plan
        </span>
      ) : (
        <Link
          href={plan.ctaHref}
          className={`mb-6 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 ${
            isEnterprise ? 'bg-background text-foreground' : plan.highlighted ? 'bg-primary text-primary-foreground' : 'bg-foreground text-background'
          }`}
        >
          {plan.ctaLabel}
        </Link>
      )}

      <ul className="space-y-2.5 flex-1">
        {plan.features.map((feature) => {
          const isSectionHeader = feature.endsWith(':');
          return (
            <li
              key={feature}
              className={`flex items-start gap-2 text-sm ${isSectionHeader ? 'font-semibold mt-1' : ''} ${
                isEnterprise ? 'text-background/90' : 'text-foreground'
              }`}
            >
              {!isSectionHeader && (
                <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isEnterprise ? 'text-background' : 'text-primary'}`} />
              )}
              <span>{feature}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
