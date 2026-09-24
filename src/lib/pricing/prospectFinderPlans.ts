/**
 * Single source of truth for VAYO subscription plans.
 * Both the pricing cards and the comparison table render from this config.
 *
 * Internal plan identifiers (starter | pro | business | enterprise) are stable
 * and intended to map 1:1 to Stripe Price IDs once billing is wired up — see
 * `stripePriceEnvVar` below. No Stripe secret keys or IDs are hard-coded here;
 * they should be read server-side from environment variables at checkout time.
 */

export type PlanId = 'starter' | 'pro' | 'business' | 'enterprise';

export interface ProspectFinderPlan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Monthly price in USD. `null` means pricing is custom / contact sales. */
  monthlyPrice: number | null;
  /** Total annual price in USD, billed yearly (2 months free vs. paying monthly). `null` means custom / contact sales. */
  annualPrice: number | null;
  contactSales?: boolean;
  fullAccess?: boolean;
  highlighted?: boolean;
  badge?: string;
  ctaLabel: string;
  ctaHref: string;
  limits: {
    users: string;
    portfolios: string;
    leads: string;
    enrichments: string;
    aiInterviews: string;
  };
  features: string[];
  /** Name of the env var that will hold this plan's Stripe Price ID once configured server-side. */
  stripePriceEnvVar: string;
  /** Name of the env var that will hold this plan's annual Stripe Price ID once configured server-side. */
  annualStripePriceEnvVar: string;
}

export const PROSPECT_FINDER_PLANS: Record<PlanId, ProspectFinderPlan> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    tagline: 'For individual operators and small teams getting started. Find and organize high-value homeowner opportunities without the complexity of a full platform.',
    monthlyPrice: 149,
    annualPrice: 1490,
    ctaLabel: 'Get Started',
    ctaHref: '/login?plan=starter',
    limits: {
      users: '1 user',
      portfolios: '1 portfolio',
      leads: 'Up to 1,000 leads',
      enrichments: 'Up to 100 enrichments/mo',
      aiInterviews: 'Not included',
    },
    features: [
      'Lead management & basic dashboard',
      'Property profiles & CSV import',
      'Basic search & filtering',
      'Up to 100 contact/property enrichments per month',
      'Basic lead notes',
    ],
    stripePriceEnvVar: 'STRIPE_PRICE_PROSPECT_FINDER_STARTER',
    annualStripePriceEnvVar: 'STRIPE_PRICE_PROSPECT_FINDER_STARTER_ANNUAL',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'For growing vacation rental and property management teams. Prioritize the right owners, enrich contact data, and keep your pipeline moving in one place.',
    monthlyPrice: 399,
    annualPrice: 3990,
    ctaLabel: 'Start Pro',
    ctaHref: '/login?plan=pro',
    limits: {
      users: 'Up to 5 users',
      portfolios: 'Up to 5 portfolios',
      leads: 'Up to 10,000 leads',
      enrichments: 'Up to 1,000 enrichments/mo',
      aiInterviews: 'Up to 25 AI interviews/mo',
    },
    features: [
      'Everything in Starter',
      'Advanced lead filtering & priority views',
      'Verified contact workflows',
      'Lead assignment',
      'Enhanced property profiles',
      'Advanced pipeline management',
      'Higher enrichment limits',
    ],
    stripePriceEnvVar: 'STRIPE_PRICE_PROSPECT_FINDER_PRO',
    annualStripePriceEnvVar: 'STRIPE_PRICE_PROSPECT_FINDER_PRO_ANNUAL',
  },
  business: {
    id: 'business',
    name: 'Business',
    tagline: 'For established teams scaling homeowner acquisition. Run outreach, enrichment, team workflows, and AI-assisted operations from a single system built for growth.',
    monthlyPrice: 999,
    annualPrice: 9990,
    highlighted: true,
    badge: 'Most Popular',
    ctaLabel: 'Start Business',
    ctaHref: '/login?plan=business',
    limits: {
      users: 'Up to 15 users',
      portfolios: 'Up to 25 portfolios',
      leads: 'Up to 50,000 leads',
      enrichments: 'Up to 5,000 enrichments/mo',
      aiInterviews: 'Included',
    },
    features: [
      'Everything in Pro',
      'Higher user, portfolio, and lead limits',
      'AI Interview Assistant',
      'Automated & bulk interview scheduling',
      'Candidate interview calendar',
      'Zoom interview integration',
      'Advanced analytics',
      'Stronger enrichment volume',
    ],
    stripePriceEnvVar: 'STRIPE_PRICE_PROSPECT_FINDER_BUSINESS',
    annualStripePriceEnvVar: 'STRIPE_PRICE_PROSPECT_FINDER_BUSINESS_ANNUAL',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For multi-market operators and larger organizations. Unlock the complete VAYO platform with the full AI suite, custom limits, advanced automation, and dedicated support.',
    monthlyPrice: null,
    annualPrice: null,
    contactSales: true,
    fullAccess: true,
    badge: 'Full Platform Access',
    ctaLabel: 'Contact Sales',
    ctaHref: '/prospect-finder/contact-sales',
    limits: {
      users: 'Custom',
      portfolios: 'Custom',
      leads: 'Custom',
      enrichments: 'Custom',
      aiInterviews: 'Custom',
    },
    features: [
      'Everything in Business',
      'Full AI suite & automated bulk AI interviews',
      'Custom lead, enrichment, user, and portfolio limits',
      'Advanced automation & workflow controls',
      'Priority support & onboarding',
      'Custom integrations available',
    ],
    stripePriceEnvVar: 'STRIPE_PRICE_PROSPECT_FINDER_ENTERPRISE',
    annualStripePriceEnvVar: 'STRIPE_PRICE_PROSPECT_FINDER_ENTERPRISE_ANNUAL',
  },
};

export const PLAN_ORDER: PlanId[] = ['starter', 'pro', 'business', 'enterprise'];

export type BillingPeriod = 'monthly' | 'annual';

/** Effective monthly-equivalent price for display, given the selected billing period. */
export function getDisplayMonthlyPrice(plan: ProspectFinderPlan, period: BillingPeriod): number | null {
  if (period === 'monthly') return plan.monthlyPrice;
  if (plan.annualPrice == null) return null;
  return Math.round(plan.annualPrice / 12);
}

/** Percentage saved by paying annually instead of monthly (rounded), or null if not applicable. */
export function getAnnualSavingsPercent(plan: ProspectFinderPlan): number | null {
  if (plan.monthlyPrice == null || plan.annualPrice == null) return null;
  const monthlyTotal = plan.monthlyPrice * 12;
  if (monthlyTotal <= 0) return null;
  return Math.round((1 - plan.annualPrice / monthlyTotal) * 100);
}

/** Comparison-table cell value: full access, restricted access, or unavailable. */
export type FeatureAvailability = 'yes' | 'limited' | 'no';

export interface FeatureComparisonRow {
  key: string;
  label: string;
  values: Record<PlanId, FeatureAvailability>;
}

// Enterprise is intentionally 'yes' on every single row — it is the only plan
// with complete access to every VAYO feature.
export const FEATURE_COMPARISON: FeatureComparisonRow[] = [
  { key: 'lead_management', label: 'Lead Management', values: { starter: 'yes', pro: 'yes', business: 'yes', enterprise: 'yes' } },
  { key: 'dashboard', label: 'Dashboard', values: { starter: 'limited', pro: 'yes', business: 'yes', enterprise: 'yes' } },
  { key: 'property_profiles', label: 'Property Profiles', values: { starter: 'yes', pro: 'yes', business: 'yes', enterprise: 'yes' } },
  { key: 'csv_imports', label: 'CSV Imports', values: { starter: 'yes', pro: 'yes', business: 'yes', enterprise: 'yes' } },
  { key: 'lead_search', label: 'Lead Search', values: { starter: 'yes', pro: 'yes', business: 'yes', enterprise: 'yes' } },
  { key: 'lead_filtering', label: 'Lead Filtering', values: { starter: 'limited', pro: 'yes', business: 'yes', enterprise: 'yes' } },
  { key: 'verified_contact_workflows', label: 'Verified Contact Workflows', values: { starter: 'no', pro: 'yes', business: 'yes', enterprise: 'yes' } },
  { key: 'lead_assignment', label: 'Lead Assignment', values: { starter: 'no', pro: 'yes', business: 'yes', enterprise: 'yes' } },
  { key: 'pipeline_management', label: 'Pipeline Management', values: { starter: 'limited', pro: 'yes', business: 'yes', enterprise: 'yes' } },
  { key: 'multiple_portfolios', label: 'Multiple Portfolios', values: { starter: 'no', pro: 'yes', business: 'yes', enterprise: 'yes' } },
  { key: 'team_members', label: 'Team Members', values: { starter: 'no', pro: 'yes', business: 'yes', enterprise: 'yes' } },
  { key: 'property_enrichment', label: 'Property Enrichment', values: { starter: 'limited', pro: 'limited', business: 'limited', enterprise: 'yes' } },
  { key: 'ai_assisted_workflows', label: 'AI-Assisted Workflows', values: { starter: 'no', pro: 'yes', business: 'yes', enterprise: 'yes' } },
  { key: 'ai_interview_assistant', label: 'AI Interview Assistant', values: { starter: 'no', pro: 'limited', business: 'yes', enterprise: 'yes' } },
  { key: 'automated_interview_scheduling', label: 'Automated Interview Scheduling', values: { starter: 'no', pro: 'no', business: 'yes', enterprise: 'yes' } },
  { key: 'bulk_interview_scheduling', label: 'Bulk Interview Scheduling', values: { starter: 'no', pro: 'no', business: 'yes', enterprise: 'yes' } },
  { key: 'interview_calendar', label: 'Interview Calendar', values: { starter: 'no', pro: 'no', business: 'yes', enterprise: 'yes' } },
  { key: 'zoom_integration', label: 'Zoom Integration', values: { starter: 'no', pro: 'no', business: 'yes', enterprise: 'yes' } },
  { key: 'advanced_analytics', label: 'Advanced Analytics', values: { starter: 'no', pro: 'no', business: 'yes', enterprise: 'yes' } },
  { key: 'automation_rules', label: 'Automation Rules', values: { starter: 'no', pro: 'limited', business: 'yes', enterprise: 'yes' } },
  { key: 'bulk_workflows', label: 'Bulk Workflows', values: { starter: 'no', pro: 'no', business: 'yes', enterprise: 'yes' } },
  { key: 'api_access', label: 'API Access', values: { starter: 'no', pro: 'no', business: 'yes', enterprise: 'yes' } },
  { key: 'custom_integrations', label: 'Custom Integrations', values: { starter: 'no', pro: 'no', business: 'no', enterprise: 'yes' } },
  { key: 'audit_logs', label: 'Audit Logs', values: { starter: 'no', pro: 'no', business: 'no', enterprise: 'yes' } },
  { key: 'sso', label: 'SSO', values: { starter: 'no', pro: 'no', business: 'no', enterprise: 'yes' } },
  { key: 'custom_roles', label: 'Custom Roles', values: { starter: 'no', pro: 'no', business: 'yes', enterprise: 'yes' } },
  { key: 'priority_support', label: 'Priority Support', values: { starter: 'no', pro: 'yes', business: 'yes', enterprise: 'yes' } },
  { key: 'dedicated_support', label: 'Dedicated Support', values: { starter: 'no', pro: 'no', business: 'no', enterprise: 'yes' } },
  { key: 'custom_limits', label: 'Custom Limits', values: { starter: 'no', pro: 'no', business: 'no', enterprise: 'yes' } },
];

export interface FeatureCategoryGroup {
  category: string;
  rows: FeatureComparisonRow[];
}

function rowsFor(keys: string[]): FeatureComparisonRow[] {
  return keys.map((key) => FEATURE_COMPARISON.find((row) => row.key === key)).filter((row): row is FeatureComparisonRow => Boolean(row));
}

// Grouped view of the exact same FEATURE_COMPARISON rows above — the comparison
// table and the collapsible-category view on /plans both read from this single
// source of truth, so marketing copy can never drift from the underlying data.
export const FEATURE_CATEGORIES: FeatureCategoryGroup[] = [
  { category: 'Core Platform', rows: rowsFor(['lead_management', 'dashboard', 'property_profiles', 'csv_imports']) },
  { category: 'Lead Management', rows: rowsFor(['lead_search', 'lead_filtering', 'lead_assignment', 'pipeline_management', 'multiple_portfolios', 'team_members']) },
  { category: 'Property & Contact Intelligence', rows: rowsFor(['verified_contact_workflows', 'property_enrichment']) },
  { category: 'AI & Automation', rows: rowsFor(['ai_assisted_workflows', 'automation_rules', 'bulk_workflows']) },
  { category: 'Interviews & Team Tools', rows: rowsFor(['ai_interview_assistant', 'automated_interview_scheduling', 'bulk_interview_scheduling', 'interview_calendar', 'zoom_integration']) },
  { category: 'Analytics', rows: rowsFor(['advanced_analytics']) },
  { category: 'Integrations', rows: rowsFor(['api_access', 'custom_integrations']) },
  { category: 'Security & Admin', rows: rowsFor(['audit_logs', 'sso', 'custom_roles', 'custom_limits']) },
  { category: 'Support', rows: rowsFor(['priority_support', 'dedicated_support']) },
];

/** Reusable upgrade-gate messaging for logged-in users who hit a feature outside their plan. */
export function getFeatureGateMessage(featureLabel: string, minimumPlan: PlanId): { title: string; body: string } {
  if (minimumPlan === 'enterprise') {
    return {
      title: 'Enterprise Feature',
      body: `${featureLabel} is available with VAYO Enterprise. Contact Sales to unlock full platform access.`,
    };
  }
  const planName = PROSPECT_FINDER_PLANS[minimumPlan].name;
  return {
    title: featureLabel,
    body: `Available on ${planName} and higher plans. Upgrade your plan to unlock ${featureLabel.toLowerCase()}.`,
  };
}
