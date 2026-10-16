'use client';

import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLanguage } from '@/contexts/LanguageContext';
import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Loader2 } from 'lucide-react';
import HomeownerSidebar from './components/HomeownerSidebar';
import NotificationDrawer, { BellButton } from '@/components/NotificationDrawer';

interface HomeownerLayoutProps {
  children: React.ReactNode;
}

export default function HomeownerLayout({ children }: HomeownerLayoutProps) {
  const { user, loading, role } = useAuth();
  const { t } = useLanguage();
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
        <div className="hidden md:flex items-center justify-between px-6 py-2 border-b border-border bg-card">
          {!isLandingPage ? (
            <button
              onClick={() => router.back()}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label={t('common.goBack')}
              title={t('common.goBack')}
            >
              <ArrowLeft size={16} />
              <span>{t('common.back')}</span>
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <BellButton />
          </div>
        </div>
        <div className="md:hidden fixed top-3 right-3 z-30">
          <LanguageSwitcher compact />
        </div>
        {children}
      </main>
      <NotificationDrawer />
    </div>
  );
}
