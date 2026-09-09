'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { initMixpanel, trackPageView } from '@/lib/mixpanel';

const PAGE_NAMES: Record<string, string> = {
  '/': 'Dashboard',
  '/lead-management': 'Lead Management',
  '/map-view': 'Map View',
  '/lead-sources': 'Lead Sources',
  '/tools': 'Tools',
  '/settings': 'Settings',
  '/login': 'Login',
  '/analytics': 'Analytics',
  '/email-templates': 'Email Templates',
  '/lead-profile': 'Lead Profile',
  '/workflows': 'Workflows',
  '/agents': 'Agents',
};

export default function MixpanelProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    initMixpanel();
  }, []);

  useEffect(() => {
    if (!pathname) return;
    const pageName = PAGE_NAMES[pathname] ?? pathname;
    trackPageView(pageName, { path: pathname });
  }, [pathname]);

  return <>{children}</>;
}
