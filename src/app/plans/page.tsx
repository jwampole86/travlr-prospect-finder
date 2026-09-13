import type { Metadata } from 'next';
import PlansPageClient from './PlansPageClient';

export const metadata: Metadata = {
  title: 'TRAVLR Prospect Finder Plans & Pricing',
  description: 'Compare TRAVLR Prospect Finder plans for vacation rental and property management teams, from core lead management to advanced automation, AI, analytics, integrations, and Enterprise access.',
  alternates: {
    canonical: 'https://prospect.staytrvlr.com/plans',
  },
};

export default function PlansPage() {
  return <PlansPageClient />;
}
