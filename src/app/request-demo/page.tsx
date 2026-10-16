import type { Metadata } from 'next';
import MarketingHeader from '@/app/prospect-finder/components/MarketingHeader';
import MarketingFooter from '@/app/prospect-finder/components/MarketingFooter';
import EnterpriseInquiryForm from '@/app/prospect-finder/components/EnterpriseInquiryForm';

export const metadata: Metadata = {
  title: 'Request a demo | AVYRO AI',
  description: 'See AVYRO AI on your own market. Tell us how you find and onboard owners today and we will walk you through the platform.',
};

export default function RequestDemoPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingHeader />
      <section className="max-w-2xl mx-auto px-6 py-16">
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Request a demo</h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            Tell us a little about your business and how you find and onboard owners today. We will reach out to set up a walkthrough on your own market.
          </p>
        </div>
        <EnterpriseInquiryForm kind="demo" />
      </section>
      <MarketingFooter />
    </div>
  );
}
