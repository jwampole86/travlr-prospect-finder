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
  title: 'VAYO | AI-Powered Growth for Property Managers',
  description:
    'VAYO is the AI-powered growth and operations platform for vacation rental and property management companies.',
  openGraph: {
    title: 'VAYO | AI-Powered Growth for Property Managers',
    description: 'VAYO is the AI-powered growth and operations platform for vacation rental and property management companies.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VAYO | AI-Powered Growth for Property Managers',
    description: 'VAYO is the AI-powered growth and operations platform for vacation rental and property management companies.',
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