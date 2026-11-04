'use client';

import React, { useState } from 'react';
import { BadgeDollarSign, Handshake, LayoutDashboard, ListChecks } from 'lucide-react';
import { Card, cx } from '@/app/campaigns/shared';
import DashboardTab from './DashboardTab';
import OpportunitiesTab from './OpportunitiesTab';
import PartnersTab from './PartnersTab';
import RevenueTab from './RevenueTab';

type TabId = 'dashboard' | 'opportunities' | 'partners' | 'revenue';
const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={15} /> },
  { id: 'opportunities', label: 'Opportunities', icon: <ListChecks size={15} /> },
  { id: 'partners', label: 'Partners', icon: <Handshake size={15} /> },
  { id: 'revenue', label: 'Revenue', icon: <BadgeDollarSign size={15} /> },
];

export default function SellerPipelineView() {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <div data-ava-anchor="seller-intro">
      <Card className="p-5 sm:p-6 bg-gradient-to-br from-primary/10 via-card to-card">
        <h1 className="text-xl sm:text-2xl font-bold">Seller &amp; owner services</h1>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-3xl">
          When a homeowner&rsquo;s reply suggests they may sell, it lands here as an opportunity for a person to review. Nothing is sent automatically:
          each step needs the owner&rsquo;s recorded permission, and a person approves which service fits.
        </p>
      </Card>
      </div>

      <div data-ava-anchor="seller-tabs" role="tablist" className="inline-flex max-w-full overflow-x-auto rounded-2xl border border-border bg-card p-1 shadow-sm">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={cx('inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all', tab === t.id ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div data-ava-anchor="seller-content">
      {tab === 'dashboard' && <DashboardTab onOpen={(id) => { setOpenId(id); setTab('opportunities'); }} />}
      {tab === 'opportunities' && <OpportunitiesTab openId={openId} onOpenChange={setOpenId} />}
      {tab === 'partners' && <PartnersTab />}
      {tab === 'revenue' && <RevenueTab />}
      </div>
    </div>
  );
}
