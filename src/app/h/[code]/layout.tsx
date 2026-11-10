import type { Metadata } from 'next';
import React from 'react';

// Prospects reach this page from an email or text, so every preview and tab shows NAVEO Stays only.
const TITLE = 'Earn more from your vacation rental | NAVEO Stays';
const DESCRIPTION = 'See what your listing could earn with a Co-Host or full management partner. A free, no-obligation listing audit from NAVEO Stays.';
const OG_IMAGE = { url: '/brand/naveo-stays-og.png', width: 1200, height: 630, alt: 'NAVEO Stays' };

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  applicationName: 'NAVEO Stays',
  icons: {
    icon: [{ url: '/brand/naveo-stays-symbol-512.png', type: 'image/png', sizes: '512x512' }],
    shortcut: '/brand/naveo-stays-symbol-512.png',
    apple: [{ url: '/brand/naveo-stays-apple-180.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: { type: 'website', siteName: 'NAVEO Stays', title: TITLE, description: DESCRIPTION, images: [OG_IMAGE] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [OG_IMAGE.url] },
  robots: { index: false, follow: false },
};

export default function HostOfferLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
