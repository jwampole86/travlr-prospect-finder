import type { Metadata } from 'next';
import Link from 'next/link';
import { Search, Database, TrendingUp, Users, Zap, Brain, BarChart2, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import MarketingHeader from '@/app/prospect-finder/components/MarketingHeader';
import MarketingFooter from '@/app/prospect-finder/components/MarketingFooter';
import PricingFaq from '@/app/prospect-finder/components/PricingFaq';
import ProductShowcase from '@/app/welcome/components/ProductShowcase';

export const metadata: Metadata = {
  title: 'VAYO | AI-Powered Growth for Property Managers',
  description: 'VAYO is the AI-powered growth and operations platform for vacation rental and property management companies. Find more high-value homeowners and turn them into management contracts.',
};

const MODULES = [
  { icon: Search, name: 'Prospect', body: 'Discover homeowner opportunities, verify owner and contact data, and score every lead.', points: ['Property discovery & lead generation', 'Owner/contact intelligence & data enrichment', 'Verification workflows & lead scoring'] },
  { icon: Users, name: 'CRM', body: 'Manage your pipeline, assignments, notes, and follow-up in one place.', points: ['Pipeline & assignment management', 'Notes, tasks & activity history', 'Owner and property profiles'] },
  { icon: Database, name: 'Intelligence', body: 'Revenue estimates, market intelligence, and STR regulations at your fingertips.', points: ['Property & revenue intelligence', 'Market intelligence & opportunity scoring', 'STR regulation lookups by city/state'] },
  { icon: Zap, name: 'Engage', body: 'Voice, SMS, email, and AI-assisted outreach — including a live call teleprompter.', points: ['Voice, SMS & email outreach', 'Live call teleprompter with AI suggestions', 'Campaigns & appointment scheduling'] },
  { icon: Brain, name: 'Talent', body: 'AI voice interviews, scorecards, and a full hiring pipeline for your team.', points: ['AI voice interviews & scheduling', 'Candidate scorecards & role plays', 'Interview calendar & Zoom integration'] },
  { icon: TrendingUp, name: 'Automate', body: 'Workflow automation, lead routing, and AI agents that handle the busywork.', points: ['Workflow triggers & actions', 'AI agents & lead routing', 'Automated follow-up & notifications'] },
  { icon: BarChart2, name: 'Analytics', body: 'Acquisition funnel, agent performance, and revenue opportunity reporting.', points: ['Acquisition funnel & lead conversion', 'Agent & team performance', 'Market and portfolio reporting'] },
];

const HOW_IT_WORKS = [
  { step: '1', title: 'Discover', body: 'Find homeowner opportunities across your target markets and portfolios.' },
  { step: '2', title: 'Enrich', body: 'Build stronger property and owner profiles from your enabled data sources.' },
  { step: '3', title: 'Prioritize', body: 'Score and rank opportunities so your team calls the right homeowners first.' },
  { step: '4', title: 'Engage', body: 'Reach out by voice, SMS, or email, with AI-assisted scripts and follow-up.' },
  { step: '5', title: 'Convert', body: 'Move opportunities through your pipeline from first contact to signed contract.' },
  { step: '6', title: 'Analyze', body: 'Track what is actually converting and where your team should focus next.' },
];

const WHO_ITS_FOR = [
  'Vacation Rental Management Companies',
  'Luxury Property Managers',
  'Boutique Hospitality Operators',
  'Multi-Market Property Managers',
  'Homeowner Acquisition Teams',
  'Business Development Teams',
];

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingHeader />

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-16 pb-12 text-center">
        <p className="text-xs font-bold tracking-[0.2em] text-primary uppercase mb-4">VAYO</p>
        <h1 className="text-3xl sm:text-5xl font-bold text-foreground leading-tight tracking-tight">
          Find More High-Value Homeowners.<br className="hidden sm:block" /> Turn Them Into Management Contracts.
        </h1>
        <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          VAYO is the AI-powered growth and operations platform for vacation rental and property management companies — from prospecting and enrichment to outreach, automation, analytics, and hiring.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <Link href="/plans" className="px-6 py-3 rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 transition-opacity">
            View Plans
          </Link>
          <Link href="/login" className="px-6 py-3 rounded-xl text-sm font-semibold border border-border hover:bg-muted transition-colors">
            Sign In
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Already have an account? <Link href="/login" className="text-primary hover:underline">Sign in here</Link>.</p>
      </section>

      {/* Product Showcase */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">One Platform. Your Entire Growth Operation.</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">From discovering high-value homeowner opportunities to outreach, automation, team operations, and performance intelligence, VAYO brings your growth workflow together in one platform.</p>
        </div>
        <ProductShowcase />
      </section>

      {/* Platform Workflow */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">The Homeowner Acquisition Workflow</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">VAYO connects the entire homeowner acquisition workflow so information doesn&apos;t disappear between disconnected tools.</p>
        </div>
        <div className="flex flex-wrap items-stretch justify-center gap-2">
          {[
            { step: 'Discover', body: 'Property opportunities' },
            { step: 'Enrich', body: 'Property + owner intelligence' },
            { step: 'Prioritize', body: 'Lead scoring + verification' },
            { step: 'Engage', body: 'Calling + AI-assisted teleprompter' },
            { step: 'Convert', body: 'CRM + pipeline' },
            { step: 'Automate', body: 'Follow-up + workflows' },
            { step: 'Analyze', body: 'Performance intelligence' },
          ].map((s, i, arr) => (
            <div key={s.step} className="flex items-stretch">
              <div className="bg-card border border-border rounded-xl px-4 py-3 text-center w-36">
                <p className="text-xs font-bold text-foreground uppercase tracking-wide">{s.step}</p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{s.body}</p>
              </div>
              {i < arr.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground/50 self-center mx-1.5 shrink-0" />}
            </div>
          ))}
        </div>
      </section>

      {/* Talent Workflow */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Build the Team Behind Your Growth</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">VAYO doesn&apos;t just help you acquire homeowners — it can also help you build the team responsible for growth.</p>
        </div>
        <div className="flex flex-wrap items-stretch justify-center gap-2 mb-6">
          {[
            'Candidate', 'Resume Intelligence', 'AI Interview', 'Scorecard', 'Human Interview', 'Decision',
          ].map((s, i, arr) => (
            <div key={s} className="flex items-stretch">
              <div className="bg-card border border-border rounded-xl px-4 py-3 text-center w-36 flex items-center justify-center">
                <p className="text-xs font-bold text-foreground uppercase tracking-wide leading-snug">{s}</p>
              </div>
              {i < arr.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground/50 self-center mx-1.5 shrink-0" />}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {['Candidate Profiles', 'AI Interview Assistant', 'Interview Calendar', 'AI Voice Interviews', 'Interview Scoring', 'Zoom Interviews', 'Hiring Pipeline'].map((cap) => (
            <span key={cap} className="text-xs font-medium px-3 py-1.5 rounded-full bg-muted text-muted-foreground">{cap}</span>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">One Platform, Every Growth Workflow</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">VAYO organizes everything your team needs into one coherent platform.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {MODULES.map(({ icon: Icon, name, body, points }) => (
            <div key={name} className="bg-card border border-border rounded-2xl p-6 hover:border-primary/40 hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-sm font-bold text-foreground mb-1.5">VAYO {name}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">{body}</p>
              <ul className="space-y-1.5">
                {points.map((point) => (
                  <li key={point} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">How VAYO Works</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">From first discovery to a signed management contract, in one workflow.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {HOW_IT_WORKS.map(({ step, title, body }) => (
            <div key={step} className="text-center">
              <div className="w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center text-sm font-bold mx-auto mb-3">{step}</div>
              <h3 className="text-sm font-bold text-foreground mb-1">{title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Who it's for */}
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

      {/* Why VAYO */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <div className="bg-card border border-border rounded-2xl p-8 sm:p-10">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-5 text-center">Why Teams Choose VAYO</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              'Discover and prioritize high-value homeowner opportunities',
              'Access available property and contact intelligence',
              'Manage your pipeline from first contact to signed contract',
              'Automate outreach and follow-up without losing the personal touch',
              'AI-assisted hiring tools to help you build your team',
              'Analytics that show what is actually converting',
            ].map((point) => (
              <div key={point} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <span className="text-sm text-foreground">{point}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Responsible Data & Compliance */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <div className="bg-card border border-border rounded-2xl p-8 sm:p-10">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">Responsible Data & Compliance</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              'Access available property and contact intelligence based on your enabled data sources and plan allowances',
              'Verified contact workflows help you prioritize outreach with confidence',
              'Channel-specific consent and opt-out controls for SMS, email, and voice outreach',
              'No guaranteed owner identity, phone number, or outcome on every lead',
            ].map((point) => (
              <div key={point} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <span className="text-sm text-foreground">{point}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-6xl mx-auto px-6 pb-16">
        <div className="text-center mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Frequently Asked Questions</h2>
        </div>
        <PricingFaq />
      </section>

      {/* CTA banner */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        <div className="rounded-3xl bg-foreground text-background p-8 sm:p-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold">Ready to Grow Smarter?</h2>
          <p className="mt-3 text-sm sm:text-base text-background/75 max-w-xl mx-auto">
            Compare Starter, Pro, Business, and Enterprise plans, or sign in if you're already part of a VAYO team.
          </p>
          <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
            <Link href="/plans" className="px-6 py-3 rounded-xl text-sm font-semibold bg-background text-foreground hover:opacity-90 transition-opacity flex items-center gap-1.5">
              View Plans <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/login" className="px-6 py-3 rounded-xl text-sm font-semibold border border-background/30 hover:bg-background/10 transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
