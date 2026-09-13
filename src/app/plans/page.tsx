import type { Metadata } from 'next';
import PlansPageClient from './PlansPageClient';

export const metadata: Metadata = {
  title: 'VAYO Plans & Pricing',
  description: 'Compare VAYO plans for vacation rental and property management teams, from core lead management to advanced automation, AI, analytics, integrations, and Enterprise access.',
  alternates: {
    canonical: 'https://prospect.staytrvlr.com/plans',
  },
};

export default function PlansPage() {
  return <PlansPageClient />;
}
