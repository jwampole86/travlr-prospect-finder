import React from 'react';
import { CheckCircle, AlertTriangle, XCircle, HelpCircle } from 'lucide-react';
import type { RegulationStatus } from '@/data/mockLeads';
import Icon from '@/components/ui/AppIcon';


interface RegulationBadgeProps {
  status: RegulationStatus;
  size?: 'sm' | 'md';
}

export default function RegulationBadge({ status, size = 'md' }: RegulationBadgeProps) {
  const config: Record<RegulationStatus, { label: string; icon: React.ElementType; className: string }> = {
    Allowed: { label: 'Allowed', icon: CheckCircle, className: 'regulation-allowed' },
    Restricted: { label: 'Restricted', icon: AlertTriangle, className: 'regulation-restricted' },
    Prohibited: { label: 'Prohibited', icon: XCircle, className: 'regulation-prohibited' },
    Unknown: { label: 'Unknown', icon: HelpCircle, className: 'regulation-unknown' },
  };

  const { label, icon: Icon, className } = config[status];
  const iconSize = size === 'sm' ? 10 : 12;
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-[11px]';
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-0.5';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${textSize} ${padding} ${className}`}>
      <Icon size={iconSize} />
      {label}
    </span>
  );
}