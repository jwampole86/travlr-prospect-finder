import type { Metadata } from 'next';
import MarketingHeader from '@/app/prospect-finder/components/MarketingHeader';
import MarketingFooter from '@/app/prospect-finder/components/MarketingFooter';
import EnterpriseInquiryForm from '@/app/prospect-finder/components/EnterpriseInquiryForm';

export const metadata: Metadata = {
  title: 'Contact Sales | TRAVLR Prospect Finder Enterprise',
  description: 'Talk to our sales team about TRAVLR Prospect Finder Enterprise — full platform access with custom limits, integrations, and dedicated support.',
};

export default function ContactSalesPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingHeader />
      <section className="max-w-2xl mx-auto px-6 py-16">
        <div className="text-center mb-8">
          <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide bg-foreground text-background mb-4">
            Full Platform Access
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Talk to Sales About Enterprise</h1>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            Enterprise is the only Prospect Finder plan with full access to every feature — custom usage limits, full AI suite, API access, custom integrations, SSO, audit logs, and dedicated support.
          </p>
        </div>
        <EnterpriseInquiryForm />
      </section>
      <MarketingFooter />
    </div>
  );
}
