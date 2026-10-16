import type { Metadata } from 'next';
import Link from 'next/link';
import { Search, ShieldCheck, MessageSquare, Home, FileSignature, Map, Brain, ClipboardList, Bell, BarChart2, Users, Sparkles } from 'lucide-react';
import MarketingHeader from '@/app/prospect-finder/components/MarketingHeader';
import MarketingFooter from '@/app/prospect-finder/components/MarketingFooter';

export const metadata: Metadata = {
  title: 'Product | AVYRO AI',
  description: 'AVYRO AI is the growth and operations platform for vacation rental operators: acquire owners, understand every property, and run operations from one system.',
};

const PILLARS = [
  {
    icon: Search, name: 'Acquisition', tagline: 'Find the owners worth calling, and reach them properly.',
    items: [
      { icon: Sparkles, title: 'Lead scoring', body: 'Every lead gets a score from property, market and engagement signals, so your team starts with the best opportunities.' },
      { icon: ShieldCheck, title: 'Verified owners and phones', body: 'Owner and contact data is enriched and checked, with landlines and bad numbers screened out before anyone is texted.' },
      { icon: MessageSquare, title: 'Compliant text and email campaigns', body: 'Audience rules, quiet hours, opt-out handling and a no-repeat window are built in. Replies are read and routed, and call times can be scheduled by text.' },
      { icon: Home, title: 'Co-Host matching', body: 'Match Airbnb and Vrbo listings to the owners behind them through public license records.' },
      { icon: Map, title: 'Pipeline and map views', body: 'See every lead move through your stages on a board and a map, with assignments and follow-ups in one place.' },
    ],
  },
  {
    icon: Brain, name: 'Intelligence', tagline: 'Walk into every conversation prepared.',
    items: [
      { icon: BarChart2, title: 'Revenue estimates', body: 'A property-level estimate of what a home could earn as a managed vacation rental, using market data for its area.' },
      { icon: ClipboardList, title: 'Regulation research', body: 'City-level short-term rental rules, kept current, so you know whether a home is worth pursuing before you call.' },
      { icon: Sparkles, title: 'Property reports', body: 'Listing quality scoring and property reports that give an owner conversation something concrete to start from.' },
    ],
  },
  {
    icon: Users, name: 'Operations', tagline: 'Onboard owners and keep the business running.',
    items: [
      { icon: FileSignature, title: 'Onboarding and agreements', body: 'Onboarding checklists, contract templates and DocuSign workflows take an owner from yes to signed.' },
      { icon: Home, title: 'Owner portal', body: 'Owners see onboarding progress, documents and statements in one place.' },
      { icon: Bell, title: 'Tasks, alerts and coordination', body: 'Follow-up tasks, personal alerts, and cleaner job coordination keep nothing waiting on a person to remember.' },
    ],
  },
];

export default function ProductPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingHeader />
      <section className="border-b border-border bg-muted/40">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 py-14 sm:py-20 text-center">
          <p className="text-xs font-bold tracking-[0.2em] text-primary uppercase mb-4">Product</p>
          <h1 className="text-3xl sm:text-5xl font-bold text-foreground leading-tight tracking-tight">Acquire owners. Run operations. Scale with confidence.</h1>
          <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            AVYRO AI is not a channel manager. It is the growth, intelligence and operating layer for vacation rental businesses: the tools that help you find, qualify, onboard and run properties.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <Link href="/request-demo" className="px-6 py-3.5 min-h-[48px] inline-flex items-center justify-center rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 transition-opacity">Request a demo</Link>
            <Link href="/how-it-works" className="px-6 py-3.5 min-h-[48px] inline-flex items-center justify-center rounded-xl text-sm font-semibold border border-border hover:bg-muted transition-colors">See how it works</Link>
          </div>
        </div>
      </section>

      {PILLARS.map((p) => (
        <section key={p.name} className="max-w-5xl mx-auto px-5 sm:px-6 py-12 border-b border-border last:border-0">
          <div className="flex items-start gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"><p.icon className="w-5 h-5" /></div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">{p.name}</h2>
              <p className="text-sm sm:text-base text-muted-foreground mt-1">{p.tagline}</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {p.items.map((i) => (
              <div key={i.title} className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-2"><i.icon className="w-4 h-4 text-primary" /><h3 className="text-sm font-semibold text-foreground">{i.title}</h3></div>
                <p className="text-sm text-muted-foreground leading-relaxed">{i.body}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="max-w-3xl mx-auto px-5 sm:px-6 py-14 text-center">
        <h2 className="text-2xl font-bold text-foreground">See it on your own market</h2>
        <p className="mt-3 text-sm sm:text-base text-muted-foreground">Tell us how you find and onboard owners today, and we will show you where AVYRO fits.</p>
        <Link href="/request-demo" className="mt-6 inline-flex px-6 py-3.5 min-h-[48px] items-center rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 transition-opacity">Request a demo</Link>
      </section>
      <MarketingFooter />
    </div>
  );
}
