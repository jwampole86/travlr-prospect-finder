'use client';

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { StageCount, RegulationCount } from '@/lib/hooks/useDashboardLeads';
import type { Lead } from '@/data/mockLeads';

const StageFunnelChart = dynamic(() => import('./StageFunnelChart'), {
  ssr: false,
  loading: () => (
    <div className="bg-card rounded-xl border border-border p-5 min-h-[220px] flex items-center justify-center animate-pulse">
      <div className="w-full h-40 bg-muted rounded-lg" />
    </div>
  ),
});

const RegulationPieChart = dynamic(() => import('./RegulationPieChart'), {
  ssr: false,
  loading: () => (
    <div className="bg-card rounded-xl border border-border p-5 min-h-[220px] flex items-center justify-center animate-pulse">
      <div className="w-40 h-40 bg-muted rounded-full mx-auto" />
    </div>
  ),
});

interface DashboardChartsProps {
  leads: Lead[];
}

export default function DashboardCharts({ leads }: DashboardChartsProps) {
  const stageBreakdown: StageCount[] = Object.entries(
    leads.reduce<Record<string, number>>((counts, lead) => {
      counts[lead.stage] = (counts[lead.stage] || 0) + 1;
      return counts;
    }, {})
  ).map(([stage, count]) => ({ stage, count }));
  const regulationBreakdown: RegulationCount[] = Object.entries(
    leads.reduce<Record<string, number>>((counts, lead) => {
      counts[lead.regulationStatus] = (counts[lead.regulationStatus] || 0) + 1;
      return counts;
    }, {})
  ).map(([status, count]) => ({ status, count }));
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {visible ? (
        <>
          <StageFunnelChart stageBreakdown={stageBreakdown} />
          <RegulationPieChart regulationBreakdown={regulationBreakdown} />
        </>
      ) : (
        <>
          <div className="bg-card rounded-xl border border-border p-5 min-h-[220px] flex items-center justify-center animate-pulse">
            <div className="w-full h-40 bg-muted rounded-lg" />
          </div>
          <div className="bg-card rounded-xl border border-border p-5 min-h-[220px] flex items-center justify-center animate-pulse">
            <div className="w-40 h-40 bg-muted rounded-full mx-auto" />
          </div>
        </>
      )}
    </div>
  );
}