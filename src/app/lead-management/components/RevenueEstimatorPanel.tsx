'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import type { Lead } from '@/data/mockLeads';
import { X, DollarSign, TrendingUp, Save } from 'lucide-react';
import RegulationBadge from '@/components/ui/RegulationBadge';
import { toast } from 'sonner';

const RevenueBarChart = dynamic(() => import('./RevenueBarChart'), { ssr: false });

interface RevenueEstimatorPanelProps {
  lead: Lead;
  onClose: () => void;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export default function RevenueEstimatorPanel({ lead, onClose }: RevenueEstimatorPanelProps) {
  const [adr, setAdr] = useState(lead.estimatedADR);
  const [occupancy, setOccupancy] = useState(lead.estimatedOccupancy);
  const [mgmtFee, setMgmtFee] = useState(25);
  const [cleaningFee, setCleaningFee] = useState(120);
  const [platformFee, setPlatformFee] = useState(3);
  const [utilities, setUtilities] = useState(200);
  const [maintenance, setMaintenance] = useState(150);
  const [leaseOrPurchase, setLeaseOrPurchase] = useState(lead.price);

  // Calculations
  const daysPerMonth = 30.4;
  const occupiedDays = Math.round((occupancy / 100) * daysPerMonth);
  const grossMonthly = adr * occupiedDays;
  const cleaningRevenue = cleaningFee * occupiedDays * 0.5; // avg 1 clean per 2 days
  const totalGross = grossMonthly + cleaningRevenue;
  const mgmtDeduction = totalGross * (mgmtFee / 100);
  const platformDeduction = totalGross * (platformFee / 100);
  const fixedCosts = utilities + maintenance + leaseOrPurchase;
  const netMonthly = totalGross - mgmtDeduction - platformDeduction - fixedCosts;
  const annualNet = netMonthly * 12;
  const roi = leaseOrPurchase > 0 ? ((netMonthly / leaseOrPurchase) * 100).toFixed(1) : 'N/A';

  const chartData = [
    { label: 'Gross', value: Math.round(totalGross) },
    { label: 'After Mgmt', value: Math.round(totalGross - mgmtDeduction) },
    { label: 'After Fees', value: Math.round(totalGross - mgmtDeduction - platformDeduction) },
    { label: 'Net', value: Math.round(netMonthly) },
  ];

  function handleSave() {
    // BACKEND: PATCH /api/leads/:id/estimate { adr, occupancy, mgmtFee, ... }
    toast.success('Estimate saved', { description: `${lead.address} — ${formatCurrency(netMonthly)}/mo net` });
  }

  return (
    <div className="w-[380px] shrink-0 border-l border-border bg-card h-full overflow-y-auto scrollbar-thin slide-in-right flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Revenue Estimator</h2>
          <p className="text-xs text-muted-foreground truncate max-w-[260px]">{lead.address}, {lead.city}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          aria-label="Close estimator"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 px-5 py-4 space-y-5">
        {/* Regulation status */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border">
          <span className="text-xs font-medium text-muted-foreground">STR Regulation</span>
          <RegulationBadge status={lead.regulationStatus} size="sm" />
        </div>

        {/* Revenue inputs */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Revenue Inputs</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Average Daily Rate (ADR)
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                <input
                  type="number"
                  value={adr}
                  onChange={(e) => setAdr(Number(e.target.value))}
                  className="w-full pl-5 pr-3 py-1.5 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 font-mono-data"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Occupancy Rate
                <span className="ml-1 font-mono-data text-primary">{occupancy}%</span>
              </label>
              <input
                type="range"
                min={30}
                max={95}
                value={occupancy}
                onChange={(e) => setOccupancy(Number(e.target.value))}
                className="w-full accent-primary"
                aria-label="Occupancy rate slider"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>30%</span><span>95%</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Cleaning Fee per Stay
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                <input
                  type="number"
                  value={cleaningFee}
                  onChange={(e) => setCleaningFee(Number(e.target.value))}
                  className="w-full pl-5 pr-3 py-1.5 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 font-mono-data"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Cost inputs */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Cost Inputs</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Management Fee
                <span className="ml-1 font-mono-data text-primary">{mgmtFee}%</span>
              </label>
              <input
                type="range"
                min={10}
                max={40}
                value={mgmtFee}
                onChange={(e) => setMgmtFee(Number(e.target.value))}
                className="w-full accent-primary"
                aria-label="Management fee slider"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>10%</span><span>40%</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Platform Fee (Airbnb)
                <span className="ml-1 font-mono-data text-primary">{platformFee}%</span>
              </label>
              <input
                type="range"
                min={1}
                max={5}
                step={0.5}
                value={platformFee}
                onChange={(e) => setPlatformFee(Number(e.target.value))}
                className="w-full accent-primary"
                aria-label="Platform fee slider"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>1%</span><span>5%</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Utilities/mo</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                  <input
                    type="number"
                    value={utilities}
                    onChange={(e) => setUtilities(Number(e.target.value))}
                    className="w-full pl-5 pr-2 py-1.5 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 font-mono-data"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Maintenance/mo</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                  <input
                    type="number"
                    value={maintenance}
                    onChange={(e) => setMaintenance(Number(e.target.value))}
                    className="w-full pl-5 pr-2 py-1.5 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 font-mono-data"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Lease / Purchase Cost/mo
              </label>
              <p className="text-[11px] text-muted-foreground mb-1">Used for ROI calculation</p>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                <input
                  type="number"
                  value={leaseOrPurchase}
                  onChange={(e) => setLeaseOrPurchase(Number(e.target.value))}
                  className="w-full pl-5 pr-3 py-1.5 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 font-mono-data"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Estimated Results</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border">
              <span className="text-xs text-muted-foreground">Gross Monthly Revenue</span>
              <span className="font-mono-data text-sm font-semibold text-foreground">{formatCurrency(totalGross)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border">
              <span className="text-xs text-muted-foreground">After Mgmt + Platform</span>
              <span className="font-mono-data text-sm font-semibold text-foreground">
                {formatCurrency(totalGross - mgmtDeduction - platformDeduction)}
              </span>
            </div>
            <div className={`flex items-center justify-between p-3 rounded-lg border ${netMonthly >= 0 ? 'bg-success-bg border-success/30' : 'bg-danger-bg border-danger/30'}`}>
              <div className="flex items-center gap-1.5">
                <DollarSign size={13} className={netMonthly >= 0 ? 'text-success' : 'text-danger'} />
                <span className="text-xs font-semibold text-foreground">Net Monthly</span>
              </div>
              <span className={`font-mono-data text-base font-bold ${netMonthly >= 0 ? 'text-success' : 'text-danger'}`}>
                {formatCurrency(netMonthly)}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border">
              <span className="text-xs text-muted-foreground">Annual Net Revenue</span>
              <span className="font-mono-data text-sm font-semibold text-foreground">{formatCurrency(annualNet)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-1.5">
                <TrendingUp size={13} className="text-primary" />
                <span className="text-xs font-semibold text-foreground">ROI vs Lease</span>
              </div>
              <span className="font-mono-data text-sm font-bold text-primary">
                {typeof roi === 'string' ? roi : `${roi}%`}
              </span>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Revenue Waterfall</h3>
          <RevenueBarChart data={chartData} />
        </div>
      </div>

      {/* Save button */}
      <div className="px-5 py-4 border-t border-border sticky bottom-0 bg-card">
        <button
          onClick={handleSave}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-all active:scale-95"
        >
          <Save size={14} />
          Save Estimate
        </button>
      </div>
    </div>
  );
}