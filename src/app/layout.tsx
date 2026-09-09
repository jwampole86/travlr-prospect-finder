import React from 'react';
import type { Metadata, Viewport } from 'next';
import '../styles/tailwind.css';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { PortfolioProvider } from '@/contexts/PortfolioContext';
import MixpanelProvider from '@/components/MixpanelProvider';
import RealtimeProvider from '@/components/RealtimeProvider';
import ThemeWrapper from '@/components/ThemeWrapper';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'TRAVLR Prospect Finder — STR Lead Intelligence for Operators',
  description:
    'Upload FRBO leads, score by regulation compliance and revenue potential, and prioritize outreach for short-term rental conversion.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/assets/images/EFB407B4-CD49-4BC9-9A8E-9894DB058712-1786579880495.PNG', type: 'image/png', sizes: '1254x1254' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [{ url: '/assets/images/EFB407B4-CD49-4BC9-9A8E-9894DB058712-1786579880495.PNG', type: 'image/png', sizes: '1254x1254' }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Inline script to apply theme class before first paint — prevents flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=localStorage.getItem('theme_preference')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
</head>
      <body>
        <AuthProvider>
          <NotificationProvider>
            <PortfolioProvider>
              <MixpanelProvider>
                <RealtimeProvider>
                  <ThemeWrapper>
                    {children}
                  </ThemeWrapper>
                </RealtimeProvider>
              </MixpanelProvider>
            </PortfolioProvider>
          </NotificationProvider>
        </AuthProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
            },
          }}
        />
</body>
    </html>
  );
}