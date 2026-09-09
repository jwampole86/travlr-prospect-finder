'use client';

import React from 'react';
import { Flame, Thermometer, Snowflake } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


export type ConfidenceBand = 'hot' | 'warm' | 'cold';

export function getConfidenceBand(score: number): ConfidenceBand {
  if (score >= 80) return 'hot';
  if (score >= 60) return 'warm';
  return 'cold';
}

interface ConfidenceBandConfig {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ElementType;
  range: string;
}

export const CONFIDENCE_BAND_CONFIG: Record<ConfidenceBand, ConfidenceBandConfig> = {
  hot: {
    label: 'Hot',
    color: 'text-orange-600',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    icon: Flame,
    range: '80–92',
  },
  warm: {
    label: 'Warm',
    color: 'text-amber-600',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    icon: Thermometer,
    range: '60–79',
  },
  cold: {
    label: 'Cold',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    icon: Snowflake,
    range: '15–59',
  },
};

interface ConfidenceBandBadgeProps {
  score: number;
  size?: 'sm' | 'md';
  showRange?: boolean;
}

export default function ConfidenceBandBadge({ score, size = 'md', showRange = false }: ConfidenceBandBadgeProps) {
  const band = getConfidenceBand(score);
  const cfg = CONFIDENCE_BAND_CONFIG[band];
  const Icon = cfg.icon;
  const isSmall = size === 'sm';
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border} ${
        isSmall ? 'text-[9px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5'
      }`}
    >
      <Icon size={isSmall ? 8 : 10} />
      {cfg.label}
      {showRange && <span className="opacity-70 ml-0.5">({cfg.range})</span>}
    </span>
  );
}
