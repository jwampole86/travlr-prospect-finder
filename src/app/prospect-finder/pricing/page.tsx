import type { Metadata } from 'next';
import Link from 'next/link';
import { Search, Database, TrendingUp, Users, Zap, Brain, BarChart2 } from 'lucide-react';
import MarketingHeader from '@/app/prospect-finder/components/MarketingHeader';
import MarketingFooter from '@/app/prospect-finder/components/MarketingFooter';
import PricingCard from '@/app/prospect-finder/components/PricingCard';
import ComparisonTable from '@/app/prospect-finder/components/ComparisonTable';
import PricingFaq from '@/app/prospect-finder/components/PricingFaq';
import { PLAN_ORDER, PROSPECT_FINDER_PLANS } from '@/lib/pricing/prospectFinderPlans';

export const metadata: Metadata = {
  title: 'TRAVLR Prospect Finder Pricing | Homeowner Prospecting Software',
  description: 'Explore TRAVLR Prospect Finder plans for vacation rental and property management teams. Choose Starter, Pro, Business, or Enterprise access for lead management, homeowner prospecting, automation, AI tools, analytics, and more.',
};

const VALUE_ITEMS = [
  { icon: Search, title: 'Discover Opportunities', body: 'Find and organize potential homeowner prospects.' },
  { icon: Database, title: 'Enrich Property Data', body: 'Build stronger property and owner profiles.' },
  { icon: TrendingUp, title: 'Prioritize Leads', body: 'Identify high-value opportunities faster.' },
  { icon: Users, title: 'Manage Outreach', body: 'Assign, track, and move homeowner opportunities through the pipeline.' },
  { icon: Zap, title: 'Automate Workflows', body: 'Reduce repetitive lead-management and follow-up tasks.' },
  { icon: Brain, title: 'Interview & Build Teams', body: 'Use integrated AI and live interview workflows to support hiring and team growth.' },
  { icon: BarChart2, title: 'Analyze Performance', body: 'Understand pipeline activity, conversion, and team performance.' },
];

const WHO_ITS_FOR = [
  'Vacation Rental Management Companies',
  'Luxury Property Managers',
  'Boutique Hospitality Operators',
  'Multi-Market Property Managers',
  'Homeowner Acquisition Teams',
  'Business Development Teams',
];

const USAGE_CATEGORIES: Array<{ label: string; starter: string; pro: string; business: string; enterprise: string }> = [
  { label: 'Users', starter: '1', pro: 'Up to 5', business: 'Up to 15', enterprise: 'Custom' },
  { label: 'Portfolios', starter: '1', pro: 'Up to 5', business: 'Up to 25', enterprise: 'Custom' },
  { label: 'Leads', starter: 'Up to 1,000', pro: 'Up to 10,000', business: 'Up to 50,000', enterprise: 'Custom' },
  { label: 'Monthly Enrichments', starter: 'Up to 100', pro: 'Up to 1,000', business: 'Up to 5,000', enterprise: 'Custom' },
  { label: 'AI Interviews', starter: '—', pro: 'Up to 25/mo', business: 'Included', enterprise: 'Custom' },
  { label: 'Automation Runs', starter: '—', pro: 'Basic', business: 'Advanced', enterprise: 'Custom' },
  { label: 'API Usage', starter: '—', pro: '—', business: 'Included', enterprise: 'Custom' },
];

export default function ProspectFinderPricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingHeader />

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-16 pb-12 text-center">
        <h1 className="text-3xl sm:text-5xl font-bold text-foreground leading-tight tracking-tight">
          Find Better Homeowner Opportunities.<br className="hidden sm:block" /> Build a Smarter Pipeline.
        </h1>
        <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          TRAVLR Prospect Finder gives vacation rental operators and property management teams the tools to discover, organize, enrich, qualify, contact, and convert high-value homeowner opportunities from one platform.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Choose the plan that fits your team today and upgrade as your portfolio and outreach operation grows.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <Link href="/login" className="px-6 py-3 rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 transition-opacity">
            Start with Prospect Finder
          </Link>
          <Link href="/prospect-finder/contact-sales" className="px-6 py-3 rounded-xl text-sm font-semibold border border-border hover:bg-muted transition-colors">
            Contact Sales
          </Link>
        </div>
      </section>

      {/* Pricing Cards */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 items-stretch">
          {PLAN_ORDER.map((id) => (
            <div key={id} id={id === 'enterprise' ? 'enterprise' : undefined}>
              <PricingCard plan={PROSPECT_FINDER_PLANS[id]} />
            </div>
          ))}
        </div>
      </section>

      {/* Comparison Table */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Compare Plans</h2>
          <p className="mt-2 text-sm text-muted-foreground">Enterprise is the only plan with full access to every Prospect Finder feature.</p>
        </div>
        <ComparisonTable />
      </section>

      {/* Usage Limits */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Plan-Based Usage Allowances</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl mx-auto">
            Users, portfolios, leads, enrichments, AI interviews, automation runs, and API usage all scale with your plan. Enterprise limits are set contract-by-contract.
          </p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="text-left px-5 py-3.5 font-semibold text-foreground">Usage Category</th>
                <th className="px-5 py-3.5 font-semibold text-foreground text-center">Starter</th>
                <th className="px-5 py-3.5 font-semibold text-foreground text-center">Pro</th>
                <th className="px-5 py-3.5 font-semibold text-foreground text-center">Business</th>
                <th className="px-5 py-3.5 font-semibold text-foreground text-center">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {USAGE_CATEGORIES.map((row, idx) => (
                <tr key={row.label} className={idx % 2 === 1 ? 'bg-muted/20' : ''}>
                  <td className="px-5 py-3 text-foreground font-medium">{row.label}</td>
                  <td className="px-5 py-3 text-center text-muted-foreground">{row.starter}</td>
                  <td className="px-5 py-3 text-center text-muted-foreground">{row.pro}</td>
                  <td className="px-5 py-3 text-center text-muted-foreground">{row.business}</td>
                  <td className="px-5 py-3 text-center font-semibold text-foreground">{row.enterprise}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Value Section */}
      <section id="value" className="max-w-6xl mx-auto px-6 pb-16">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">From Property Discovery to Homeowner Conversation</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {VALUE_ITEMS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-card border border-border rounded-2xl p-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-sm font-bold text-foreground mb-1.5">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-xs text-muted-foreground text-center max-w-2xl mx-auto">
          Access available property and contact intelligence based on enabled data sources and plan allowances.
        </p>
      </section>

      {/* Who It's For */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Built for Growing Vacation Rental Teams</h2>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {WHO_ITS_FOR.map((label) => (
            <span key={label} className="px-4 py-2 rounded-full text-sm font-medium bg-muted text-foreground border border-border">
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="text-center mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Frequently Asked Questions</h2>
        </div>
        <PricingFaq />
      </section>

      <MarketingFooter />
    </div>
  );
}
