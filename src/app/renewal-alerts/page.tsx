'use client';

import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';
import { CalendarClock, AlertTriangle, CheckCircle, TrendingDown, User, Home, Bell, Filter, ChevronDown, Eye, Phone, Mail, Activity, LogIn, Wrench, RefreshCw, X } from 'lucide-react';

interface RenewalProperty {
  id: string;
  address: string;
  city: string;
  state: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  assignedAgent: string;
  renewalDate: string;
  daysUntilRenewal: number;
  riskScore: 'critical' | 'high' | 'medium' | 'low';
  riskFactors: string[];
  occupancyTrend: number; // % change last 30d
  lastLogin: string; // days ago
  openRequests: number;
  currentOccupancy: number;
  monthlyRevenue: number;
  agreementYear: number;
}

const mockRenewalProperties: RenewalProperty[] = [
  {
    id: 'rp-001', address: '2847 Larimer St', city: 'Denver', state: 'CO',
    ownerName: 'Marcus Webb', ownerPhone: '+1 (720) 555-0182', ownerEmail: 'marcus.webb@email.com',
    assignedAgent: 'Sarah Chen', renewalDate: '2026-09-12', daysUntilRenewal: 30,
    riskScore: 'critical', riskFactors: ['Declining occupancy', 'Stale login (18d)', '2 open requests'],
    occupancyTrend: -14, lastLogin: '18 days ago', openRequests: 2,
    currentOccupancy: 58, monthlyRevenue: 3200, agreementYear: 2,
  },
  {
    id: 'rp-002', address: '1420 Canyon Blvd', city: 'Boulder', state: 'CO',
    ownerName: 'Priya Nair', ownerPhone: '+1 (303) 555-0247', ownerEmail: 'priya.nair@email.com',
    assignedAgent: 'James Torres', renewalDate: '2026-09-20', daysUntilRenewal: 38,
    riskScore: 'high', riskFactors: ['Stale login (25d)', '1 open request'],
    occupancyTrend: -6, lastLogin: '25 days ago', openRequests: 1,
    currentOccupancy: 71, monthlyRevenue: 4100, agreementYear: 1,
  },
  {
    id: 'rp-003', address: '8901 Sunset Blvd', city: 'Los Angeles', state: 'CA',
    ownerName: 'Derek Fontaine', ownerPhone: '+1 (310) 555-0391', ownerEmail: 'derek.f@email.com',
    assignedAgent: 'Sarah Chen', renewalDate: '2026-10-05', daysUntilRenewal: 53,
    riskScore: 'medium', riskFactors: ['Occupancy below target'],
    occupancyTrend: -3, lastLogin: '4 days ago', openRequests: 0,
    currentOccupancy: 67, monthlyRevenue: 5800, agreementYear: 3,
  },
  {
    id: 'rp-004', address: '3312 Fremont Ave', city: 'Seattle', state: 'WA',
    ownerName: 'Lena Kowalski', ownerPhone: '+1 (206) 555-0118', ownerEmail: 'lena.k@email.com',
    assignedAgent: 'James Torres', renewalDate: '2026-10-18', daysUntilRenewal: 66,
    riskScore: 'low', riskFactors: [],
    occupancyTrend: 4, lastLogin: '2 days ago', openRequests: 0,
    currentOccupancy: 84, monthlyRevenue: 4600, agreementYear: 2,
  },
  {
    id: 'rp-005', address: '5544 Flamingo Rd', city: 'Las Vegas', state: 'NV',
    ownerName: 'Tony Reyes', ownerPhone: '+1 (702) 555-0229', ownerEmail: 'tony.r@email.com',
    assignedAgent: 'Sarah Chen', renewalDate: '2026-08-20', daysUntilRenewal: 7,
    riskScore: 'critical', riskFactors: ['7-day deadline', 'Declining occupancy', 'No recent contact'],
    occupancyTrend: -21, lastLogin: '31 days ago', openRequests: 3,
    currentOccupancy: 44, monthlyRevenue: 2900, agreementYear: 1,
  },
  {
    id: 'rp-006', address: '720 Malibu Crest Dr', city: 'Malibu', state: 'CA',
    ownerName: 'Cassandra Hill', ownerPhone: '+1 (424) 555-0377', ownerEmail: 'c.hill@email.com',
    assignedAgent: 'James Torres', renewalDate: '2026-09-01', daysUntilRenewal: 19,
    riskScore: 'high', riskFactors: ['Declining occupancy', 'Stale login (12d)'],
    occupancyTrend: -9, lastLogin: '12 days ago', openRequests: 0,
    currentOccupancy: 62, monthlyRevenue: 7200, agreementYear: 2,
  },
];

const riskConfig = {
  critical: { label: 'Critical', color: 'text-red-600', bg: 'bg-red-500/10', border: 'border-red-500/30', dot: 'bg-red-500' },
  high: { label: 'High Risk', color: 'text-orange-600', bg: 'bg-orange-500/10', border: 'border-orange-500/30', dot: 'bg-orange-500' },
  medium: { label: 'Medium', color: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/30', dot: 'bg-amber-500' },
  low: { label: 'Low Risk', color: 'text-green-600', bg: 'bg-green-500/10', border: 'border-green-500/30', dot: 'bg-green-500' },
};

const windowBuckets = [
  { label: '7-Day', days: 7, color: 'text-red-600', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  { label: '30-Day', days: 30, color: 'text-orange-600', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  { label: '60-Day', days: 60, color: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
];

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

interface DetailDrawerProps {
  property: RenewalProperty;
  onClose: () => void;
}

function DetailDrawer({ property, onClose }: DetailDrawerProps) {
  const risk = riskConfig[property.riskScore];
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-md bg-card border-l border-border h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
          <div>
            <h3 className="text-sm font-bold text-foreground">{property.address}</h3>
            <p className="text-xs text-muted-foreground">{property.city}, {property.state}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <X size={15} className="text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Risk badge */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${risk.bg} border ${risk.border}`}>
            <div className={`w-2 h-2 rounded-full ${risk.dot}`} />
            <span className={`text-xs font-semibold ${risk.color}`}>{risk.label} · {property.daysUntilRenewal} days to renewal</span>
          </div>

          {/* Owner info */}
          <div className="bg-muted/30 rounded-xl p-4 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Owner</p>
            <div className="flex items-center gap-2">
              <User size={13} className="text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{property.ownerName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone size={13} className="text-muted-foreground" />
              <span className="text-xs text-foreground">{property.ownerPhone}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail size={13} className="text-muted-foreground" />
              <span className="text-xs text-foreground">{property.ownerEmail}</span>
            </div>
            <div className="flex items-center gap-2">
              <User size={13} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Agent: {property.assignedAgent}</span>
            </div>
          </div>

          {/* Risk factors */}
          {property.riskFactors.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Risk Factors</p>
              <div className="space-y-1.5">
                {property.riskFactors.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-foreground">
                    <AlertTriangle size={11} className="text-orange-500 shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Occupancy', value: `${property.currentOccupancy}%`, sub: `${property.occupancyTrend > 0 ? '+' : ''}${property.occupancyTrend}% trend`, icon: <Activity size={13} className="text-primary" /> },
              { label: 'Monthly Rev', value: formatCurrency(property.monthlyRevenue), sub: 'current', icon: <TrendingDown size={13} className="text-green-500" /> },
              { label: 'Last Login', value: property.lastLogin, sub: 'homeowner portal', icon: <LogIn size={13} className="text-muted-foreground" /> },
              { label: 'Open Requests', value: `${property.openRequests}`, sub: 'unresolved', icon: <Wrench size={13} className="text-amber-500" /> },
            ].map(m => (
              <div key={m.label} className="bg-muted/30 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">{m.icon}<span className="text-[10px] text-muted-foreground">{m.label}</span></div>
                <p className="text-base font-bold text-foreground">{m.value}</p>
                <p className="text-[10px] text-muted-foreground">{m.sub}</p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quick Actions</p>
            <a href={`tel:${property.ownerPhone}`} className="flex items-center gap-2 w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              <Phone size={13} />
              Call {property.ownerName.split(' ')[0]}
            </a>
            <a href={`mailto:${property.ownerEmail}`} className="flex items-center gap-2 w-full px-4 py-2.5 border border-border rounded-lg text-sm hover:bg-muted transition-colors">
              <Mail size={13} />
              Send Email
            </a>
            <Link href={`/lead-profile?id=${property.id}`} className="flex items-center gap-2 w-full px-4 py-2.5 border border-border rounded-lg text-sm hover:bg-muted transition-colors">
              <Eye size={13} />
              View Full Profile
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RenewalAlertsPage() {
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [filterWindow, setFilterWindow] = useState<string>('all');
  const [selectedProperty, setSelectedProperty] = useState<RenewalProperty | null>(null);

  const agents = Array.from(new Set(mockRenewalProperties.map(p => p.assignedAgent)));

  const filtered = mockRenewalProperties.filter(p => {
    if (filterRisk !== 'all' && p.riskScore !== filterRisk) return false;
    if (filterAgent !== 'all' && p.assignedAgent !== filterAgent) return false;
    if (filterWindow !== 'all') {
      const days = parseInt(filterWindow);
      if (p.daysUntilRenewal > days) return false;
    }
    return true;
  }).sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal);

  const bucketCounts = windowBuckets.map(b => ({
    ...b,
    count: mockRenewalProperties.filter(p => p.daysUntilRenewal <= b.days).length,
    atRisk: mockRenewalProperties.filter(p => p.daysUntilRenewal <= b.days && (p.riskScore === 'critical' || p.riskScore === 'high')).length,
  }));

  return (
    <AppLayout>
      <div className="px-6 py-5 max-w-screen-xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Renewal Alerts</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Partnership agreement renewal windows · At-risk homeowner surfacing</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs hover:bg-muted transition-colors">
              <RefreshCw size={12} />
              Refresh
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors">
              <Bell size={12} />
              Configure Alerts
            </button>
          </div>
        </div>

        {/* Window Buckets */}
        <div className="grid grid-cols-3 gap-4">
          {bucketCounts.map(b => (
            <button
              key={b.label}
              onClick={() => setFilterWindow(filterWindow === String(b.days) ? 'all' : String(b.days))}
              className={`rounded-xl border p-4 text-left transition-all hover:shadow-sm ${
                filterWindow === String(b.days) ? `${b.bg} ${b.border} ring-1 ring-current` : 'bg-card border-border'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`flex items-center gap-1.5 text-xs font-semibold ${b.color}`}>
                  <CalendarClock size={13} />
                  {b.label} Window
                </div>
                {b.atRisk > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-500/10 text-red-600 rounded-full">
                    {b.atRisk} at-risk
                  </span>
                )}
              </div>
              <p className="text-3xl font-bold text-foreground">{b.count}</p>
              <p className="text-xs text-muted-foreground mt-0.5">properties renewing</p>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter size={12} />
            Filter:
          </div>
          <div className="relative">
            <select
              value={filterRisk}
              onChange={e => setFilterRisk(e.target.value)}
              className="pl-3 pr-7 py-1.5 text-xs border border-border rounded-lg bg-card outline-none appearance-none"
            >
              <option value="all">All Risk Levels</option>
              <option value="critical">Critical</option>
              <option value="high">High Risk</option>
              <option value="medium">Medium</option>
              <option value="low">Low Risk</option>
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={filterAgent}
              onChange={e => setFilterAgent(e.target.value)}
              className="pl-3 pr-7 py-1.5 text-xs border border-border rounded-lg bg-card outline-none appearance-none"
            >
              <option value="all">All Agents</option>
              {agents.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
          <div className="relative">
            <select
              value={filterWindow}
              onChange={e => setFilterWindow(e.target.value)}
              className="pl-3 pr-7 py-1.5 text-xs border border-border rounded-lg bg-card outline-none appearance-none"
            >
              <option value="all">All Windows</option>
              <option value="7">Within 7 days</option>
              <option value="30">Within 30 days</option>
              <option value="60">Within 60 days</option>
            </select>
            <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} properties</span>
        </div>

        {/* Property List */}
        <div className="space-y-3">
          {filtered.map(property => {
            const risk = riskConfig[property.riskScore];
            const isUrgent = property.daysUntilRenewal <= 7;
            return (
              <div
                key={property.id}
                className={`bg-card border rounded-xl p-4 hover:shadow-sm transition-all cursor-pointer ${
                  isUrgent ? 'border-red-500/40 bg-red-500/[0.02]' : 'border-border'
                }`}
                onClick={() => setSelectedProperty(property)}
              >
                <div className="flex items-start gap-4">
                  {/* Left: property info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Home size={13} className="text-muted-foreground shrink-0" />
                      <span className="text-sm font-semibold text-foreground truncate">{property.address}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{property.city}, {property.state}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                      <span className="flex items-center gap-1"><User size={10} />{property.ownerName}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1"><User size={10} />Agent: {property.assignedAgent}</span>
                      <span>·</span>
                      <span>Year {property.agreementYear} agreement</span>
                    </div>

                    {/* Risk factors */}
                    {property.riskFactors.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {property.riskFactors.map((f, i) => (
                          <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-orange-500/10 text-orange-600 text-[10px] font-medium rounded-full">
                            <AlertTriangle size={9} />
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right: metrics */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">Occupancy</p>
                      <p className={`text-sm font-bold ${property.occupancyTrend < -10 ? 'text-red-600' : property.occupancyTrend < 0 ? 'text-amber-600' : 'text-green-600'}`}>
                        {property.currentOccupancy}%
                      </p>
                      <p className={`text-[10px] ${property.occupancyTrend < 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {property.occupancyTrend > 0 ? '+' : ''}{property.occupancyTrend}%
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">Revenue</p>
                      <p className="text-sm font-bold text-foreground">{formatCurrency(property.monthlyRevenue)}</p>
                      <p className="text-[10px] text-muted-foreground">/mo</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground">Renewal</p>
                      <p className={`text-sm font-bold ${isUrgent ? 'text-red-600' : property.daysUntilRenewal <= 30 ? 'text-orange-600' : 'text-foreground'}`}>
                        {property.daysUntilRenewal}d
                      </p>
                      <p className="text-[10px] text-muted-foreground">{new Date(property.renewalDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                    </div>
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${risk.bg} ${risk.color}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${risk.dot}`} />
                      {risk.label}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setSelectedProperty(property); }}
                      className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                    >
                      <Eye size={14} className="text-muted-foreground" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <CheckCircle size={24} className="text-green-500" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">No renewals match your filters</p>
              <p className="text-xs text-muted-foreground">Adjust filters or check back as renewal dates approach</p>
            </div>
          )}
        </div>
      </div>

      {selectedProperty && (
        <DetailDrawer property={selectedProperty} onClose={() => setSelectedProperty(null)} />
      )}
    </AppLayout>
  );
}
