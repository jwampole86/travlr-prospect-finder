import type { Metadata } from 'next';
import React from 'react';

// Homeowners reach these pages from a text, so every preview and tab must show NAVEO Stays only.
const TITLE = 'Free Property Revenue Estimate | NAVEO Stays';
const DESCRIPTION = 'See what your home could earn as a managed vacation rental. Free, instant and no obligation, from NAVEO Stays.';
const OG_IMAGE = { url: '/brand/travlr-og.png', width: 1200, height: 630, alt: 'NAVEO Stays' };

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'NAVEO Stays',
  icons: {
    icon: [{ url: '/brand/travlr-icon.png', type: 'image/png', sizes: '512x512' }],
    shortcut: '/brand/travlr-icon.png',
    apple: [{ url: '/brand/travlr-badge-apple.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: { type: 'website', siteName: 'NAVEO Stays', title: TITLE, description: DESCRIPTION, images: [OG_IMAGE] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [OG_IMAGE.url] },
  robots: { index: false, follow: false },
};

export default function EstimateLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
