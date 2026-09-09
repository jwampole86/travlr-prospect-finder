'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import HomeownerSidebar from './components/HomeownerSidebar';
import NotificationDrawer from '@/components/NotificationDrawer';

interface HomeownerLayoutProps {
  children: React.ReactNode;
}

export default function HomeownerLayout({ children }: HomeownerLayoutProps) {
  const { user, loading, role } = useAuth();
  const router = useRouter();

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

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <HomeownerSidebar />
      <main className="flex-1 overflow-y-auto scrollbar-thin pt-12 md:pt-0">
        {children}
      </main>
      <NotificationDrawer />
    </div>
  );
}
