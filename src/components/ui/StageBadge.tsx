import React from 'react';
import type { LeadStage } from '@/data/mockLeads';

interface StageBadgeProps {
  stage: LeadStage;
  size?: 'sm' | 'md';
}

const stageConfig: Record<LeadStage, { className: string }> = {
  'New Lead': { className: 'bg-[var(--stage-new-bg)] text-[var(--stage-new)] border border-[var(--stage-new)]/20' },
  'Contacted': { className: 'bg-[var(--stage-contacted-bg)] text-[var(--stage-contacted)] border border-[var(--stage-contacted)]/20' },
  'Interested': { className: 'bg-[var(--stage-interested-bg)] text-[var(--stage-interested)] border border-[var(--stage-interested)]/20' },
  'Proposal Sent': { className: 'bg-[var(--stage-proposal-bg)] text-[var(--stage-proposal)] border border-[var(--stage-proposal)]/20' },
  'Under Contract': { className: 'bg-[var(--stage-contract-bg)] text-[var(--stage-contract)] border border-[var(--stage-contract)]/20' },
  'Live': { className: 'bg-[var(--stage-live-bg)] text-[var(--stage-live)] border border-[var(--stage-live)]/20' },
  'Not a Fit': { className: 'bg-[var(--stage-notfit-bg)] text-[var(--stage-notfit)] border border-[var(--stage-notfit)]/20' },
};

export default function StageBadge({ stage, size = 'md' }: StageBadgeProps) {
  const { className } = stageConfig[stage];
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-[11px]';
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-0.5';

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${textSize} ${padding} ${className}`}>
      {stage}
    </span>
  );
}