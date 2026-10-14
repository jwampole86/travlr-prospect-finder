import type { Metadata } from 'next';
import Link from 'next/link';
import { Search, Database, TrendingUp, Users, Zap, Brain, BarChart2, Home, ArrowRight, CheckCircle2, ShieldCheck, PlayCircle } from 'lucide-react';
import MarketingHeader from '@/app/prospect-finder/components/MarketingHeader';
import MarketingFooter from '@/app/prospect-finder/components/MarketingFooter';
import PricingFaq from '@/app/prospect-finder/components/PricingFaq';
import ProductShowcase from '@/app/welcome/components/ProductShowcase';

export const metadata: Metadata = {
  title: 'VAYO | AI-Powered Growth for Property Managers',
  description: 'VAYO is the AI-powered growth and operations platform for vacation rental and property management companies. Find more high-value homeowners and turn them into management contracts.',
};

const MODULES = [
  { icon: Search, name: 'Prospect', outcome: 'Know who to call first.', body: 'Discover homeowner opportunities, verify owner and contact data, and score every lead.', points: ['Property discovery & lead generation', 'Owner/contact intelligence & data enrichment', 'Verification workflows & lead scoring'] },
  { icon: Database, name: 'Intelligence', outcome: 'Walk into every call prepared.', body: 'Revenue estimates, market intelligence, and STR regulations at your fingertips.', points: ['Property & revenue intelligence', 'Market intelligence & opportunity scoring', 'STR regulation lookups by city/state'] },
  { icon: Users, name: 'Pipeline', outcome: 'See every lead move.', body: 'A live board and map built on your real campaign stages, with assignments, notes, and follow-up in one place.', points: ['Drag-and-drop pipeline board & map view', 'Quick views and overview tiles in Lead Management', 'Notes, assignments & activity history'] },
  { icon: Zap, name: 'Engage', outcome: 'Turn research into conversations.', body: 'Text campaigns, email, and calling with AI-assisted guidance.', points: ['Text campaigns with carrier checks, quiet hours & opt-outs', 'Voice, email & a live call teleprompter', 'Campaigns & appointment scheduling'] },
  { icon: Home, name: 'Co-Host', outcome: 'Turn listings into owners.', body: 'Match Airbnb and Vrbo listings to verified owners through public license records.', points: ['Owner matching & verification', 'Audit offers by email and text', 'Numbered pages and market filters'] },
  { icon: TrendingUp, name: 'Automate', outcome: 'Reduce manual busywork.', body: 'Workflow automation, lead routing, and alerts that handle the busywork.', points: ['Personal alerts & working hours', 'AI agents & lead routing', 'Automated follow-up & notifications'] },
  { icon: Brain, name: 'Talent', outcome: 'Hire the team that can grow.', body: 'AI voice interviews, scorecards, and a full hiring pipeline for your team.', points: ['AI voice interviews & scheduling', 'Candidate scorecards & role plays', 'Interview calendar & Zoom integration'] },
  { icon: BarChart2, name: 'Analytics', outcome: 'See what is actually converting.', body: 'Acquisition funnel, agent performance, and an Executive Overview where every number drills into the people behind it.', points: ['Executive Overview with drill-down', 'Agent & team performance', 'Live System Status & Team Chat'] },
];

const PROOF_POINTS = [
  'Live text, voice, email, AI, and data stack',
  'Pipeline board, map, and Co-Host program',
  'Operator-shaped call and hiring tools',
];

const FIELD_PROOF = [
  {
    label: 'Operational Proof',
    stat: 'Texting, calling, email, AI',
    body: 'Twilio, Resend, Anthropic, Supabase, and Vercel power real texting, calling, AI assistance, auth, and deployment, watched by a live System Status page.',
  },
  {
    label: 'Workflow Proof',
    stat: 'End-to-end agent loop',
    body: 'Lead scoring, verified-number texting, a live pipeline board, Co-Host owner matching, assignments, and interviews are wired into one operating path.',
  },
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
      <section className="relative overflow-hidden border-b border-border bg-[linear-gradient(135deg,hsl(var(--background))_0%,hsl(var(--muted))_58%,hsl(var(--background))_100%)]">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:56px_56px] opacity-30" />
        <div className="relative max-w-7xl mx-auto px-5 sm:px-6 pt-14 sm:pt-16 pb-12">
        <div className="grid lg:grid-cols-[0.78fr_1.22fr] gap-8 xl:gap-10 items-center">
          <div className="min-w-0 text-center lg:text-left">
            <p className="text-xs font-bold tracking-[0.2em] text-primary uppercase mb-4">VAYO</p>
            <h1 className="text-3xl sm:text-5xl font-bold text-foreground leading-tight tracking-tight">
              Find More High-Value Homeowners.<br className="hidden sm:block" /> Turn Them Into Management Contracts.
            </h1>
            <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto lg:mx-0 leading-relaxed">
              VAYO is the AI-powered growth and operations platform for vacation rental and property management companies — from prospecting and enrichment to outreach, automation, analytics, and hiring.
            </p>
            <div className="mt-8 flex items-center justify-center lg:justify-start gap-3 flex-wrap">
              <Link href="/plans" className="px-6 py-3 rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 transition-opacity">
                View Plans
              </Link>
              <a href="#how-it-works" className="px-6 py-3 rounded-xl text-sm font-semibold border border-border hover:bg-muted transition-colors inline-flex items-center gap-1.5">
                <PlayCircle className="w-4 h-4" /> See how it works
              </a>
              <Link href="/login" className="px-6 py-3 rounded-xl text-sm font-semibold border border-border hover:bg-muted transition-colors">
                Sign In
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap justify-center lg:justify-start gap-2">
              {PROOF_POINTS.map((point) => (
                <span key={point} className="max-w-full text-center text-[11px] font-medium px-3 py-1.5 rounded-full bg-muted text-muted-foreground border border-border leading-snug">{point}</span>
              ))}
            </div>
          </div>
          <div className="min-w-0 lg:-mr-8 xl:-mr-14">
            <ProductShowcase presentation="hero" />
          </div>
        </div>
        </div>
      </section>

      {/* Proof points */}
      <section className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid md:grid-cols-[0.8fr_1.2fr] gap-6 items-start">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-primary uppercase mb-3">Proof in the product</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">More than a concept deck.</h2>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">VAYO runs on a live calling, messaging, AI and data stack, and every workflow below is built into the product you will use.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {FIELD_PROOF.map((proof) => (
              <article key={proof.label} className="bg-card border border-border rounded-2xl p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">{proof.label}</p>
                <p className="mt-2 text-xl font-bold text-foreground leading-tight">{proof.stat}</p>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{proof.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Product Showcase */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-6 pb-16">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {[
            { step: 'Discover', body: 'Property opportunities' },
            { step: 'Enrich', body: 'Property + owner intelligence' },
            { step: 'Prioritize', body: 'Lead scoring + verification' },
            { step: 'Engage', body: 'Texts, calls + AI teleprompter' },
            { step: 'Convert', body: 'Pipeline board + map' },
            { step: 'Automate', body: 'Follow-up + workflows' },
            { step: 'Analyze', body: 'Performance intelligence' },
          ].map((s, i) => (
            <div key={s.step} className="bg-card border border-border rounded-xl p-4 text-center flex flex-col items-center gap-1.5">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <p className="text-xs font-bold text-foreground uppercase tracking-wide">{s.step}</p>
              <p className="text-[11px] text-muted-foreground leading-snug">{s.body}</p>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {[
            'Candidate', 'Resume Intelligence', 'AI Interview', 'Scorecard', 'Human Interview', 'Decision',
          ].map((s, i) => (
            <div key={s} className="bg-card border border-border rounded-xl p-4 text-center flex flex-col items-center gap-1.5">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <p className="text-xs font-bold text-foreground uppercase tracking-wide leading-snug">{s}</p>
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
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">What's Inside VAYO</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">VAYO organizes everything your team needs into one coherent platform.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {MODULES.map(({ icon: Icon, name, outcome, body, points }) => (
            <div key={name} className="bg-card border border-border rounded-2xl p-6 hover:border-primary/40 hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-sm font-bold text-foreground mb-1.5">VAYO {name}</h3>
              <p className="text-xs font-semibold text-primary mb-2">{outcome}</p>
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
              'Discover and prioritize high-value homeowner opportunities, with luxury lead access on Business and Enterprise plans',
              'Access available property and contact intelligence',
              'Watch every lead move on a live pipeline board and map, from first text to signed contract',
              'Partner with hosts through the Co-Host program, matched to verified owners',
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
              'Texts only between 9am and 8pm in the owner\'s time zone, never twice, with every opt-out honored',
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
