import type { Metadata } from 'next';
import React from 'react';

const TITLE = 'The Future of Property Turnovers | VAYO AI';
const DESCRIPTION = 'Help shape the future of vacation rental operations. A short research survey from VAYO AI.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'VAYO AI',
  openGraph: { type: 'website', siteName: 'VAYO AI', title: TITLE, description: DESCRIPTION },
  robots: { index: false, follow: false },
};

export default function FutureOfStrLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
