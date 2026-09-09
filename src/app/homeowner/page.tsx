'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { DollarSign, TrendingUp, Calendar, Home, ChevronRight, FileText, Plus, AlertCircle, Building2, ChevronDown, RefreshCw } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from 'recharts';

import HomeownerWalkthrough from '@/components/HomeownerWalkthrough';
import { HomeownerDashboardSkeleton, EmptyBookingsState, NetworkErrorBanner } from '@/components/ui/LoadingSkeleton';
import Icon from '@/components/ui/AppIcon';




interface Property {
  id: string;
  lead_id: string;
  property_address: string;
  city: string;
  state: string;
}

interface Booking {
  id: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  nights: number;
  platform: string;
  gross_revenue: number;
  status: string;
}

interface Payout {
  id: string;
  period_start: string;
  period_end: string;
  gross_amount: number;
  net_amount: number;
  management_fee: number;
  status: string;
}

interface SpecialRequest {
  id: string;
  category: string;
  description: string;
  status: string;
  created_at: string;
}

const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;

const formatPeriod = (p: Payout) => {
  if (!p.period_start) return '—';
  const d = new Date(p.period_start);
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
};

export default function HomeownerDashboardPage() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'revenue' | 'bookings' | 'requests' | 'documents'>('overview');
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [requests, setRequests] = useState<SpecialRequest[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showPropertySwitcher, setShowPropertySwitcher] = useState(false);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [newRequest, setNewRequest] = useState({ category: 'maintenance', description: '' });
  const [dateRange, setDateRange] = useState('6m');
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [networkError, setNetworkError] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);

  useEffect(() => {
    const fetchProperties = async () => {
      setLoadingData(true);
      setNetworkError(false);
      try {
        const { data: userRes } = await supabase.auth.getUser();
        if (!userRes.user) { setLoadingData(false); return; }
        setCurrentUserId(userRes.user.id);

      // property_homeowners links homeowner_user_id -> lead_id
      // Join leads to get address details
      const { data: propLinks } = await supabase
        .from('property_homeowners')
        .select('id, lead_id, leads(id, property_address, city, state)')
        .eq('homeowner_user_id', userRes.user.id);

      if (propLinks && propLinks.length > 0) {
        const mapped: Property[] = propLinks.map((pl: any) => ({
          id: pl.id,
          lead_id: pl.lead_id,
          property_address: pl.leads?.property_address || pl.lead_id,
          city: pl.leads?.city || '',
          state: pl.leads?.state || '',
        }));
        setProperties(mapped);
        setSelectedProperty(mapped[0]);
      }

      // Check onboarding
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('onboarding_completed')
        .eq('id', userRes.user.id)
        .maybeSingle();
      if (!profile?.onboarding_completed) {
        setShowWalkthrough(true);
      }
      } catch (err) {
        const isNetworkErr = err instanceof TypeError && (err as TypeError).message.includes('fetch');
        if (isNetworkErr) setNetworkError(true);
      } finally {
        setLoadingData(false);
      }
    };
    fetchProperties();
  }, [supabase]);

  useEffect(() => {
    if (!selectedProperty?.lead_id) return;
    const leadId = selectedProperty.lead_id;
    const fetchPropertyData = async () => {
      const [bookingsRes, payoutsRes, requestsRes] = await Promise.all([
        supabase
          .from('bookings')
          .select('*')
          .eq('lead_id', leadId)
          .order('check_in', { ascending: false })
          .limit(20),
        supabase
          .from('payouts')
          .select('*')
          .eq('lead_id', leadId)
          .order('period_start', { ascending: false })
          .limit(12),
        supabase
          .from('special_requests')
          .select('*')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false }),
      ]);
      if (bookingsRes.data) setBookings(bookingsRes.data);
      if (payoutsRes.data) setPayouts(payoutsRes.data);
      if (requestsRes.data) setRequests(requestsRes.data);
    };
    fetchPropertyData();
  }, [selectedProperty, supabase]);

  const handleSubmitRequest = useCallback(async () => {
    if (!newRequest.description.trim() || !selectedProperty?.lead_id || !currentUserId) return;
    setSubmitLoading(true);
    const { data, error } = await supabase.from('special_requests').insert({
      lead_id: selectedProperty.lead_id,
      homeowner_user_id: currentUserId,
      category: newRequest.category,
      description: newRequest.description,
      status: 'submitted',
    }).select().single();
    setSubmitLoading(false);
    if (!error && data) {
      setRequests(prev => [data, ...prev]);
      setNewRequest({ category: 'maintenance', description: '' });
      setShowNewRequest(false);
    }
  }, [newRequest, selectedProperty, currentUserId, supabase]);

  // Derive real KPI values from fetched data
  const latestPayout = payouts[0] ?? null;
  const nextPayout = payouts.find(p => p.status === 'pending') ?? null;
  const currentMonthBookings = bookings.filter(b => {
    const checkIn = new Date(b.check_in);
    const now = new Date();
    return checkIn.getMonth() === now.getMonth() && checkIn.getFullYear() === now.getFullYear();
  });
  const totalNightsInMonth = currentMonthBookings.reduce((s, b) => s + (b.nights || 0), 0);
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const occupancyRate = daysInMonth > 0 ? Math.round((totalNightsInMonth / daysInMonth) * 100) : 0;
  const grossRevenue = latestPayout?.gross_amount ?? 0;
  const netRevenue = latestPayout?.net_amount ?? 0;

  // Build revenue chart data from real payouts (last 6)
  const revenueChartData = payouts.slice(0, 6).reverse().map(p => ({
    month: formatPeriod(p).split(' ')[0]?.slice(0, 3) || '—',
    gross: p.gross_amount,
    net: p.net_amount,
  }));

  // Build occupancy chart data from real bookings grouped by month
  const occupancyChartData = (() => {
    const monthMap: Record<string, { nights: number; days: number }> = {};
    bookings.forEach(b => {
      const d = new Date(b.check_in);
      const key = d.toLocaleString('en-US', { month: 'short' });
      const daysInM = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      if (!monthMap[key]) monthMap[key] = { nights: 0, days: daysInM };
      monthMap[key].nights += b.nights || 0;
    });
    return Object.entries(monthMap).slice(-6).map(([month, val]) => ({
      month,
      rate: val.days > 0 ? Math.min(100, Math.round((val.nights / val.days) * 100)) : 0,
    }));
  })();

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'revenue', label: 'Revenue' },
    { key: 'bookings', label: 'Bookings' },
    { key: 'requests', label: 'Requests' },
    { key: 'documents', label: 'Documents' },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {showWalkthrough && (
        <HomeownerWalkthrough
          forceShow={true}
          onClose={() => setShowWalkthrough(false)}
        />
      )}
      {/* Network error banner */}
      {networkError && (
        <NetworkErrorBanner
          onRetry={() => {
            setNetworkError(false);
            setLoadingData(true);
            supabase.auth.getUser().then(({ data }) => {
              if (data.user) setCurrentUserId(data.user.id);
            }).finally(() => setLoadingData(false));
          }}
        />
      )}
      {/* Loading skeleton */}
      {loadingData ? (
        <HomeownerDashboardSkeleton />
      ) : (
      <div className="space-y-5">
      {/* Header with Property Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your TRAVLR property dashboard</p>
        </div>
        {properties.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowPropertySwitcher(v => !v)}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg bg-card hover:bg-muted transition-colors text-sm"
            >
              <Building2 size={14} className="text-primary" />
              <span className="font-medium text-foreground truncate max-w-[200px]">
                {selectedProperty?.property_address || 'Select Property'}
              </span>
              <ChevronDown size={13} className="text-muted-foreground" />
            </button>
            {showPropertySwitcher && properties.length > 1 && (
              <div className="absolute top-full right-0 mt-1 bg-card border border-border rounded-xl shadow-lg z-50 min-w-[280px] overflow-hidden">
                {properties.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedProperty(p); setShowPropertySwitcher(false); }}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted transition-colors ${p.id === selectedProperty?.id ? 'bg-primary/5' : ''}`}
                  >
                    <Home size={14} className="text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{p.property_address}</p>
                      <p className="text-xs text-muted-foreground">{p.city}, {p.state}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Gross Revenue', value: grossRevenue > 0 ? fmt(grossRevenue) : '—', sub: latestPayout ? formatPeriod(latestPayout) : 'No payouts yet', icon: DollarSign, color: 'text-primary', bg: 'bg-primary/10', positive: grossRevenue > 0 ? true : null },
              { label: 'Net Payout', value: netRevenue > 0 ? fmt(netRevenue) : '—', sub: 'After fees & costs', icon: TrendingUp, color: 'text-success', bg: 'bg-success/10', positive: netRevenue > 0 ? true : null },
              { label: 'Next Payout', value: nextPayout ? new Date(nextPayout.period_end || nextPayout.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—', sub: nextPayout ? `${fmt(nextPayout.net_amount)} estimated` : 'No pending payout', icon: Calendar, color: 'text-warning', bg: 'bg-warning/10', positive: null },
              { label: 'Occupancy', value: occupancyRate > 0 ? `${occupancyRate}%` : '—', sub: `${totalNightsInMonth} of ${daysInMonth} nights`, icon: Home, color: 'text-secondary', bg: 'bg-secondary/10', positive: occupancyRate > 60 ? true : null },
            ].map(({ label, value, sub, icon: Icon, color, bg, positive }) => (
              <div key={label} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground">{label}</span>
                  <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                    <Icon size={15} className={color} />
                  </div>
                </div>
                <p className="text-xl font-bold text-foreground">{value}</p>
                <p className={`text-xs mt-1 ${positive === true ? 'text-success' : positive === false ? 'text-danger' : 'text-muted-foreground'}`}>{sub}</p>
              </div>
            ))}
          </div>

          {/* Revenue Chart */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Revenue Overview</h3>
                <p className="text-xs text-muted-foreground">Last 6 payouts · Gross vs Net</p>
              </div>
              <button onClick={() => setActiveTab('revenue')} className="text-xs text-primary hover:underline flex items-center gap-1">
                View details <ChevronRight size={12} />
              </button>
            </div>
            {revenueChartData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">No payout data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={revenueChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="grossGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--success)" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v: unknown) => [`$${(v as number).toLocaleString()}`, '']} />
                  <Area type="monotone" dataKey="gross" stroke="var(--primary)" strokeWidth={2} fill="url(#grossGrad)" name="Gross" />
                  <Area type="monotone" dataKey="net" stroke="var(--success)" strokeWidth={2} fill="url(#netGrad)" name="Net" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Upcoming Bookings Preview */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Upcoming Bookings</h3>
              <button onClick={() => setActiveTab('bookings')} className="text-xs text-primary hover:underline">View all</button>
            </div>
            <div className="divide-y divide-border">
              {bookings.length === 0 ? (
                <EmptyBookingsState />
              ) : bookings.slice(0, 3).map(b => (
                <div key={b.id} className="px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-foreground">{b.guest_name || 'Guest'}</p>
                    <p className="text-xs text-muted-foreground">{b.check_in} – {b.check_out} · {b.platform}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{fmt(b.gross_revenue || 0)}</p>
                    <span className="text-xs text-success bg-success/10 px-2 py-0.5 rounded-full capitalize">{b.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Payouts */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Recent Payouts</h3>
              <button onClick={() => setActiveTab('revenue')} className="text-xs text-primary hover:underline">View statements</button>
            </div>
            <div className="divide-y divide-border">
              {payouts.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">No payout history yet</div>
              ) : payouts.slice(0, 3).map(p => (
                <div key={p.id} className="px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-foreground">{formatPeriod(p)}</p>
                    <p className="text-xs text-muted-foreground">Gross {fmt(p.gross_amount)} · Net {fmt(p.net_amount)}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${p.status === 'paid' ? 'bg-success/10 text-success border border-success/20' : 'bg-warning/10 text-warning border border-warning/20'}`}>
                    {p.status === 'paid' ? 'Paid' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Revenue Tab */}
      {activeTab === 'revenue' && (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            {['1m', '3m', '6m', '1y'].map(r => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${dateRange === r ? 'bg-primary text-white' : 'border border-border text-muted-foreground hover:border-primary/30'}`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Revenue by Month</h3>
            {revenueChartData.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">No revenue data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={revenueChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v: unknown) => [`$${(v as number).toLocaleString()}`, '']} />
                  <Bar dataKey="gross" fill="var(--primary)" opacity={0.8} radius={[4, 4, 0, 0]} name="Gross" />
                  <Bar dataKey="net" fill="var(--success)" opacity={0.8} radius={[4, 4, 0, 0]} name="Net" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Occupancy Rate</h3>
            {occupancyChartData.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">No occupancy data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={occupancyChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} formatter={(v: unknown) => [`${v}%`, 'Occupancy']} />
                  <Area type="monotone" dataKey="rate" stroke="var(--primary)" strokeWidth={2} fill="var(--primary)" fillOpacity={0.1} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Payout history table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Payout History</h3>
            </div>
            {payouts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No payout history yet</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Period</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gross</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mgmt Fee</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Net Payout</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {payouts.map(p => (
                      <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-foreground whitespace-nowrap">{formatPeriod(p)}</td>
                        <td className="px-4 py-3 text-sm text-right font-mono text-foreground">{fmt(p.gross_amount)}</td>
                        <td className="px-4 py-3 text-sm text-right font-mono text-muted-foreground">{fmt(p.management_fee || (p.gross_amount - p.net_amount))}</td>
                        <td className="px-4 py-3 text-sm text-right font-mono font-semibold text-foreground">{fmt(p.net_amount)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${
                            p.status === 'paid' ? 'bg-success/10 text-success border border-success/20' : 'bg-warning/10 text-warning border border-warning/20'
                          }`}>
                            {p.status === 'paid' ? 'Paid' : 'Pending'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Cost Breakdown from latest payout */}
          {latestPayout && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Itemized Deductions ({formatPeriod(latestPayout)})</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Gross Revenue</span>
                  <span className="text-sm font-medium text-foreground">{fmt(latestPayout.gross_amount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Management Fee</span>
                  <span className="text-sm font-medium text-danger">-{fmt(latestPayout.management_fee || (latestPayout.gross_amount - latestPayout.net_amount))}</span>
                </div>
                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Net Payout</span>
                  <span className="text-sm font-bold text-success">{fmt(latestPayout.net_amount)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bookings Tab */}
      {activeTab === 'bookings' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
            <AlertCircle size={14} className="text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700">You can view bookings but cannot modify live guest reservations. Contact your TRAVLR property manager for changes.</p>
          </div>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Guest</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Dates</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground hidden sm:table-cell">Platform</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Revenue</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bookings.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">No bookings found</td></tr>
                  ) : bookings.map(b => (
                    <tr key={b.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{b.guest_name || 'Guest'}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{b.check_in} – {b.check_out}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">{b.platform}</td>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{fmt(b.gross_revenue || 0)}</td>
                      <td className="px-4 py-3"><span className="text-xs text-success bg-success/10 px-2 py-0.5 rounded-full capitalize">{b.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Requests Tab */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Submit requests to your TRAVLR property manager</p>
            <button
              onClick={() => setShowNewRequest(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus size={14} /> New Request
            </button>
          </div>

          {showNewRequest && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">New Request</h3>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Category</label>
                <select value={newRequest.category} onChange={e => setNewRequest(r => ({ ...r, category: e.target.value }))} className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none">
                  <option value="maintenance">Maintenance Request</option>
                  <option value="personal_use">Personal Use Block-out</option>
                  <option value="property_concern">Property Concern</option>
                  <option value="house_rules">House Rules Request</option>
                  <option value="pricing">Pricing/Amenity Request</option>
                  <option value="general">General Question</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
                <textarea value={newRequest.description} onChange={e => setNewRequest(r => ({ ...r, description: e.target.value }))} rows={4} placeholder="Describe your request..." className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none resize-none" />
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button onClick={() => setShowNewRequest(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                <button onClick={handleSubmitRequest} disabled={submitLoading} className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                  {submitLoading && <RefreshCw size={12} className="animate-spin" />}
                  {submitLoading ? 'Submitting…' : 'Submit Request'}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {requests.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
                No requests yet. Submit a request above.
              </div>
            ) : requests.map(r => (
              <div key={r.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-foreground capitalize">{r.category.replace(/_/g, ' ')}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        r.status === 'completed' ? 'bg-success/10 text-success' :
                        r.status === 'in_review' ? 'bg-blue-100 text-blue-700' :
                        r.status === 'approved'? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      }`}>{r.status.replace(/_/g, ' ')}</span>
                    </div>
                    <p className="text-sm text-foreground">{r.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(r.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Property Documents</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Visit the <a href="/homeowner/documents" className="text-primary hover:underline">Documents page</a> for full DocuSign signing and document management.</p>
            </div>
            <div className="px-4 py-8 text-center">
              <FileText size={32} className="text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">Manage your documents</p>
              <p className="text-xs text-muted-foreground mb-4">View and sign your Partnership Agreement, download statements, and manage all property documents.</p>
              <a href="/homeowner/documents" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors">
                <FileText size={14} />
                Open Documents
              </a>
            </div>
          </div>
        </div>
      )}
      </div>
      )}
    </div>
  );
}
