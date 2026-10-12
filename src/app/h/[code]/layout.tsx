import type { Metadata } from 'next';
import React from 'react';

// Prospects reach this page from an email or text, so every preview and tab shows TRAVLR only.
const TITLE = 'Earn more from your vacation rental | TRAVLR Vacation Homes';
const DESCRIPTION = 'See what your listing could earn with a Co-Host or full management partner. A free, no-obligation listing audit from TRAVLR Vacation Homes.';
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

export default function HostOfferLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
