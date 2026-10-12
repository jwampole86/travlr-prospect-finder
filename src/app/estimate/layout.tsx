import type { Metadata } from 'next';
import React from 'react';

// Homeowners reach these pages from a text, so every preview and tab must show TRAVLR only.
const TITLE = 'Free Property Revenue Estimate | TRAVLR Vacation Homes';
const DESCRIPTION = 'See what your home could earn as a managed vacation rental. Free, instant and no obligation, from TRAVLR Vacation Homes.';
const OG_IMAGE = { url: '/brand/travlr-og.png', width: 1200, height: 630, alt: 'TRAVLR Vacation Homes' };

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'TRAVLR Vacation Homes',
  icons: {
    icon: [{ url: '/brand/travlr-icon.png', type: 'image/png', sizes: '512x512' }],
    shortcut: '/brand/travlr-icon.png',
    apple: [{ url: '/brand/travlr-badge-apple.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: { type: 'website', siteName: 'TRAVLR Vacation Homes', title: TITLE, description: DESCRIPTION, images: [OG_IMAGE] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [OG_IMAGE.url] },
  robots: { index: false, follow: false },
};

export default function EstimateLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
