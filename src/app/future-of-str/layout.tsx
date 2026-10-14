import type { Metadata } from 'next';
import React from 'react';

const TITLE = 'The Future of Property Turnovers | AVYRO AI';
const DESCRIPTION = 'Help shape the future of vacation rental operations. A short research survey from AVYRO AI.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'AVYRO AI',
  openGraph: { type: 'website', siteName: 'AVYRO AI', title: TITLE, description: DESCRIPTION },
  robots: { index: false, follow: false },
};

export default function FutureOfStrLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
