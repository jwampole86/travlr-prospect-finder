'use client';

import React from 'react';
import OnboardingTourEngine from '@/components/OnboardingTourEngine';

interface OnboardingWalkthroughProps {
  forceShow?: boolean;
  onClose?: () => void;
}

export default function OnboardingWalkthrough({ forceShow = false, onClose }: OnboardingWalkthroughProps) {
  return <OnboardingTourEngine forceShow={forceShow} onClose={onClose} />;
}
