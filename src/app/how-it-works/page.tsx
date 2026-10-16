import type { Metadata } from 'next';
import Link from 'next/link';
import { Search, FileSignature, Settings2, TrendingUp } from 'lucide-react';
import MarketingHeader from '@/app/prospect-finder/components/MarketingHeader';
import MarketingFooter from '@/app/prospect-finder/components/MarketingFooter';

export const metadata: Metadata = {
  title: 'How it works | AVYRO AI',
  description: 'Find, onboard, operate, grow: how AVYRO AI takes a vacation rental operator from a list of homes to signed owners and running properties.',
};

const STEPS = [
  { icon: Search, step: '1', name: 'Find', body: 'AVYRO builds your owner pipeline from property and listing data, then enriches and scores every lead. Owner and phone data is verified, bad numbers are screened out, and the leads worth a call float to the top.',
    points: ['Lead scoring and prioritization', 'Verified owner and phone data', 'Co-Host matching from public license records'] },
  { icon: FileSignature, step: '2', name: 'Onboard', body: 'Compliant text and email outreach opens the conversation, replies are read and routed, and calls are scheduled by text. When an owner says yes, checklists, agreements and DocuSign take them to signed.',
    points: ['Campaigns with quiet hours, opt-outs and a no-repeat window', 'Call scheduling by text', 'Onboarding checklists and e-signature'] },
  { icon: Settings2, step: '3', name: 'Operate', body: 'Once a property is live, tasks, alerts and coordination tools keep the work moving, and owners follow their progress in a portal.',
    points: ['Follow-up tasks and personal alerts', 'Cleaner and job coordination', 'Owner portal for progress and documents'] },
  { icon: TrendingUp, step: '4', name: 'Grow', body: 'See what is actually converting: the acquisition funnel, agent performance and market data, with every number tied back to the people behind it.',
    points: ['Acquisition funnel and campaign results', 'Agent performance and coaching', 'Market and regulation intelligence'] },
];

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingHeader />
      <section className="border-b border-border bg-muted/40">
        <div className="max-w-4xl mx-auto px-5 sm:px-6 py-14 sm:py-20 text-center">
          <p className="text-xs font-bold tracking-[0.2em] text-primary uppercase mb-4">How it works</p>
          <h1 className="text-3xl sm:text-5xl font-bold text-foreground leading-tight tracking-tight">Find. Onboard. Operate. Grow.</h1>
          <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">One system from the first list of homes to a running portfolio.</p>
        </div>
      </section>
      <section className="max-w-4xl mx-auto px-5 sm:px-6 py-12 space-y-6">
        {STEPS.map((s) => (
          <div key={s.name} className="bg-card border border-border rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row gap-5">
            <div className="flex items-center sm:items-start gap-3 sm:w-44 shrink-0">
              <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><s.icon className="w-5 h-5" /></div>
              <div><p className="text-[11px] font-bold tracking-widest text-muted-foreground uppercase">Step {s.step}</p><h2 className="text-xl font-bold text-foreground">{s.name}</h2></div>
            </div>
            <div>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">{s.body}</p>
              <ul className="mt-4 space-y-1.5">
                {s.points.map((p) => <li key={p} className="text-sm text-foreground flex gap-2"><span className="text-primary">•</span>{p}</li>)}
              </ul>
            </div>
          </div>
        ))}
      </section>
      <section className="max-w-3xl mx-auto px-5 sm:px-6 py-12 text-center">
        <h2 className="text-2xl font-bold text-foreground">Want to see the flow with your data?</h2>
        <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
          <Link href="/request-demo" className="px-6 py-3.5 min-h-[48px] inline-flex items-center justify-center rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 transition-opacity">Request a demo</Link>
          <Link href="/product" className="px-6 py-3.5 min-h-[48px] inline-flex items-center justify-center rounded-xl text-sm font-semibold border border-border hover:bg-muted transition-colors">Explore the product</Link>
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
