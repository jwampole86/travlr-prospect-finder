'use client';

import { useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { createTravlrHost } from './travlrHost';
import type { AvaRole } from './host/types';
import { AVA_CLIENT_ENABLED, AVA_STAFF_ROLES } from './avaFlags';

// Loaded on demand and never on the server: three.js is only fetched for signed-in staff when AVA is switched on.
const AvaWidget = dynamic(() => import('./widget/AvaWidget').then((m) => m.AvaWidget), { ssr: false });

/** Mounts AVA for signed-in staff. Switch it off with NEXT_PUBLIC_AVA_ENABLED=false. */
export default function AvaMount() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const avaRole = role && AVA_STAFF_ROLES.includes(role as AvaRole) ? (role as AvaRole) : null;
  const { selectedPortfolio } = usePortfolio();
  const portfolioRef = useRef<string | null>(null);
  portfolioRef.current = selectedPortfolio && selectedPortfolio.key !== 'all' ? selectedPortfolio.label : null;
  const host = useMemo(() => createTravlrHost({ role: avaRole, navigate: (r) => router.push(r), getPortfolio: () => portfolioRef.current }), [avaRole, router]);

  if (!AVA_CLIENT_ENABLED || loading || !user || !avaRole) return null;
  // AVA's button takes the corner the floating phone button used to occupy; the dialer now lives in the top bar.
  return <AvaWidget host={host} initialMode="closed" offset={{ right: 24, bottom: 24 }} />;
}
