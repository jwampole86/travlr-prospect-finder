'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Menu, Phone } from 'lucide-react';
import NotificationDrawer from './NotificationDrawer';
import SyncSchedulerRunner from './SyncSchedulerRunner';
import SyncToastEmitter from './SyncToastEmitter';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import ProfileMenu from './ProfileMenu';
import FirstLoginPlatformGuide from './FirstLoginPlatformGuide';
import TimeClockWidget from './TimeClockWidget';
import TimeClockIdleMonitor from './TimeClockIdleMonitor';

// ── Lazy-load FloatingDialer — Twilio Voice SDK is heavy and should only
//    initialize when the agent actually opens the dialer, not on every page load.
const FloatingDialer = dynamic(() => import('./FloatingDialer'), {
  ssr: false,
  loading: () => null,
});

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, loading, role } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [dialerOpen, setDialerOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
      return;
    }
    if (!loading && user && role === 'homeowner') {
      router.replace('/homeowner');
    }
    // Agents land on the shared dashboard ("/") only when they type/bookmark it directly —
    // route them to their own workspace so there's one consistent agent landing page.
    if (!loading && user && role === 'agent' && pathname === '/') {
      router.replace('/agent-workspace');
    }
  }, [user, loading, role, pathname, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || role === 'homeowner') return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — hidden on mobile unless open */}
      <div
        className={`fixed inset-y-0 left-0 z-50 md:relative md:z-auto md:flex md:shrink-0 transition-transform duration-300 ease-in-out ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <Sidebar onClose={() => setMobileSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto scrollbar-thin min-w-0">
        {/* Mobile top bar — 44px min height for touch targets */}
        <div className="sticky top-0 z-30 flex items-center gap-3 px-4 bg-card border-b border-border md:hidden" style={{ minHeight: '52px' }}>
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors touch-manipulation"
            aria-label="Open navigation menu"
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            <Menu size={20} />
          </button>
          <span className="text-sm font-semibold text-foreground flex-1">TRAVLR Prospect Finder</span>
          <TimeClockWidget />
          <ProfileMenu />
        </div>

        {/* Desktop top bar */}
        <div className="hidden md:flex sticky top-0 z-30 items-center justify-end gap-2 px-6 py-2 bg-card border-b border-border">
          <TimeClockWidget />
          <ProfileMenu />
        </div>
        {children}
        {/* Compliance footer */}
        <footer className="border-t border-border bg-card px-6 py-4 mt-auto">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="text-foreground/60">© 2026 TRAVLR Inc.</span>
            <Link href="/terms-of-service" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <Link href="/privacy-policy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/tcpa-compliance" className="hover:text-foreground transition-colors">TCPA Compliance</Link>
            <Link href="/gdpr-data-processing" className="hover:text-foreground transition-colors">GDPR Data Processing</Link>
          </div>
        </footer>
      </main>
      <NotificationDrawer />
      <SyncSchedulerRunner />
      <SyncToastEmitter />
      <FirstLoginPlatformGuide />
      <TimeClockIdleMonitor />

      {/* Floating Dialer toggle button — 44px min touch target.
          The FloatingDialer component (and Twilio SDK) is lazy-loaded via
          next/dynamic so it does NOT add to the initial bundle. The button
          itself is always rendered so agents can open the dialer at any time. */}
      {!dialerOpen && (
        <button
          onClick={() => setDialerOpen(true)}
          className="fixed bottom-6 right-4 md:right-6 z-[9998] rounded-full bg-gray-900 hover:bg-gray-800 text-white shadow-2xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 touch-manipulation"
          aria-label="Open dialer"
          title="Open Dialer"
          style={{ width: '52px', height: '52px' }}
        >
          <Phone size={20} />
        </button>
      )}

      {/* FloatingDialer — only rendered (and Twilio SDK only initialized)
          when dialerOpen is true. Lazy-loaded via next/dynamic. */}
      {dialerOpen && <FloatingDialer onClose={() => setDialerOpen(false)} />}
    </div>
  );
}