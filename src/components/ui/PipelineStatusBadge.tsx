'use client';

import React from 'react';
import { Phone, Calendar, FileText, CheckCircle, XCircle } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


export type PipelineStatus = 'contacted' | 'callback_scheduled' | 'offer_sent' | 'signed' | 'rejected' | null;

interface PipelineStatusConfig {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ElementType;
}

export const PIPELINE_STATUS_CONFIG: Record<NonNullable<PipelineStatus>, PipelineStatusConfig> = {
  contacted: {
    label: 'Contacted',
    color: 'text-blue-600',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    icon: Phone,
  },
  callback_scheduled: {
    label: 'Callback Scheduled',
    color: 'text-amber-600',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    icon: Calendar,
  },
  offer_sent: {
    label: 'Offer Sent',
    color: 'text-purple-600',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    icon: FileText,
  },
  signed: {
    label: 'Signed',
    color: 'text-emerald-600',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    icon: CheckCircle,
  },
  rejected: {
    label: 'Rejected',
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    icon: XCircle,
  },
};

export const PIPELINE_STATUS_ORDER: NonNullable<PipelineStatus>[] = [
  'contacted',
  'callback_scheduled',
  'offer_sent',
  'signed',
  'rejected',
];

interface PipelineStatusBadgeProps {
  status: PipelineStatus;
  size?: 'sm' | 'md';
}

export default function PipelineStatusBadge({ status, size = 'md' }: PipelineStatusBadgeProps) {
  if (!status) return null;
  const cfg = PIPELINE_STATUS_CONFIG[status];
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
    </span>
  );
}
