'use client';

import dynamic from 'next/dynamic';
import { useAuth } from '@/contexts/AuthContext';

const AgentOnboardingTour = dynamic(() => import('@/components/AgentOnboardingTour'), {
  ssr: false,
  loading: () => null,
});

const OnboardingTourEngine = dynamic(() => import('@/components/OnboardingTourEngine'), {
  ssr: false,
  loading: () => null,
});

export default function FirstLoginPlatformGuide() {
  const { user, loading, role } = useAuth();

  if (loading || !user) return null;

  if (role === 'agent') {
    return <AgentOnboardingTour />;
  }

  if (role === 'admin' || role === 'owner') {
    return <OnboardingTourEngine />;
  }

  return null;
}
