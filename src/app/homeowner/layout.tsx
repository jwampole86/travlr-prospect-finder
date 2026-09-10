'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Loader2 } from 'lucide-react';
import HomeownerSidebar from './components/HomeownerSidebar';
import NotificationDrawer from '@/components/NotificationDrawer';

interface HomeownerLayoutProps {
  children: React.ReactNode;
}

export default function HomeownerLayout({ children }: HomeownerLayoutProps) {
  const { user, loading, role } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
      return;
    }
    if (!loading && user && role !== 'homeowner') {
      router.replace('/');
    }
  }, [user, loading, role, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || role !== 'homeowner') return null;

  const isLandingPage = pathname === '/homeowner';

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <HomeownerSidebar />
      <main className="flex-1 overflow-y-auto scrollbar-thin pt-12 md:pt-0">
        {!isLandingPage && (
          <div className="hidden md:flex items-center px-6 py-2 border-b border-border bg-card">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Go back"
              title="Go back"
            >
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
          </div>
        )}
        {children}
      </main>
      <NotificationDrawer />
    </div>
  );
}
