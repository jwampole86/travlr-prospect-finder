import type { Metadata } from 'next';
import Link from 'next/link';
import MarketingHeader from '@/app/prospect-finder/components/MarketingHeader';
import MarketingFooter from '@/app/prospect-finder/components/MarketingFooter';

export const metadata: Metadata = {
  title: 'About | AVYRO AI',
  description: 'AVYRO AI develops the technology that modern vacation rental operations run on. NAVEO Stays is the first business built on it.',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingHeader />
      <section className="border-b border-border bg-muted/40">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 py-14 sm:py-20 text-center">
          <p className="text-xs font-bold tracking-[0.2em] text-primary uppercase mb-4">About</p>
          <h1 className="text-3xl sm:text-5xl font-bold text-foreground leading-tight tracking-tight">Technology built by operators, for operators.</h1>
          <p className="mt-5 text-base sm:text-lg text-muted-foreground leading-relaxed">AVYRO powers modern vacation rental operations, starting with NAVEO Stays and built for operators who want to grow.</p>
        </div>
      </section>
      <section className="max-w-3xl mx-auto px-5 sm:px-6 py-12 space-y-10">
        <div>
          <h2 className="text-xl font-bold text-foreground">What we do</h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">
            AVYRO AI is the technology and operations platform behind a vacation rental business: the systems that find homeowners, qualify them, onboard them, and run their properties. We build the tools so a team can do that with less busywork and better information.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Our relationship with NAVEO Stays</h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">
            NAVEO Stays is the consumer marketplace where guests book high-quality homes and owners raise their hand to list. It runs on AVYRO, which makes it our first major customer and our proving ground. Every feature is shaped by running a real operation.
          </p>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground leading-relaxed">
            The two are distinct on purpose. NAVEO Stays is the storefront for travelers and homeowners. AVYRO AI is the platform for the operators and managers behind it, and it is built to serve other operators too.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">What we believe</h2>
          <ul className="mt-3 space-y-2 text-sm sm:text-base text-muted-foreground">
            <li className="flex gap-2"><span className="text-primary">•</span>Owner acquisition should be intelligent and respectful, not a blast to every number.</li>
            <li className="flex gap-2"><span className="text-primary">•</span>Compliance is part of the product: consent, quiet hours and opt-outs are built in, not bolted on.</li>
            <li className="flex gap-2"><span className="text-primary">•</span>Software should earn trust by doing what it says, so we describe what is built and say plainly what is coming.</li>
          </ul>
        </div>
        <div className="text-center pt-2">
          <Link href="/request-demo" className="inline-flex px-6 py-3.5 min-h-[48px] items-center rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 transition-opacity">Request a demo</Link>
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
