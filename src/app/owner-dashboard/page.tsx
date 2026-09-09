'use client';

import React, { useState, useEffect } from 'react';
import { Building2, TrendingUp, DollarSign, Activity, BarChart2, Home, ArrowUpRight, ArrowDownRight, Minus, RefreshCw, LogOut, Bell, ChevronRight, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface PortfolioProperty {
  id: string;
  address: string;
  city: string;
  state: string;
  property_type: string;
  bedrooms?: number;
  bathrooms?: number;
  estimated_revenue?: number;
  stage?: string;
  score?: number;
  created_at?: string;
}

interface KPICard {
  label: string;
  value: string;
  sub: string;
  trend: 'up' | 'down' | 'flat';
  trendValue: string;
  icon: React.ElementType;
  color: string;
}

// ─── Mock chart data ──────────────────────────────────────────────────────────

const REVENUE_TREND = [
  { month: 'Mar', revenue: 18400 },
  { month: 'Apr', revenue: 21200 },
  { month: 'May', revenue: 19800 },
  { month: 'Jun', revenue: 24600 },
  { month: 'Jul', revenue: 27100 },
  { month: 'Aug', revenue: 25900 },
];

const LEAD_ACTIVITY = [
  { day: 'Mon', new: 4, contacted: 7, converted: 2 },
  { day: 'Tue', new: 6, contacted: 5, converted: 1 },
  { day: 'Wed', new: 3, contacted: 9, converted: 3 },
  { day: 'Thu', new: 8, contacted: 6, converted: 2 },
  { day: 'Fri', new: 5, contacted: 8, converted: 4 },
  { day: 'Sat', new: 2, contacted: 3, converted: 1 },
  { day: 'Sun', new: 1, contacted: 2, converted: 0 },
];

const STAGE_COLORS: Record<string, string> = {
  new: 'bg-blue-500/15 text-blue-400',
  contacted: 'bg-amber-500/15 text-amber-400',
  qualified: 'bg-violet-500/15 text-violet-400',
  proposal: 'bg-cyan-500/15 text-cyan-400',
  closed: 'bg-emerald-500/15 text-emerald-400',
  lost: 'bg-rose-500/15 text-rose-400',
};

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'flat' }) {
  if (trend === 'up') return <ArrowUpRight size={13} className="text-emerald-500" />;
  if (trend === 'down') return <ArrowDownRight size={13} className="text-rose-500" />;
  return <Minus size={13} className="text-muted-foreground" />;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OwnerDashboardPage() {
  const { user, signOut, role, loading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [properties, setProperties] = useState<PortfolioProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [lastUpdatedStr, setLastUpdatedStr] = useState('');

  useEffect(() => {
    loadData();
  }, [user]);

  // Redirect admin/agent users away from the owner-only white-label dashboard
  useEffect(() => {
    if (!authLoading && user && role && role !== 'homeowner') {
      router.replace('/');
    }
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, role, router]);

  async function loadData(isRefresh = false) {
    if (!user) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data } = await supabase
        .from('leads')
        .select('id, address, city, state, property_type, bedrooms, bathrooms, estimated_revenue, stage, score, created_at')
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      setProperties((data as PortfolioProperty[]) ?? []);
      const now = new Date();
      setLastUpdated(now);
      setLastUpdatedStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // ─── Derived metrics ───────────────────────────────────────────────────────

  const totalProperties = properties.length;
  const totalRevenue = properties.reduce((sum, p) => sum + (p.estimated_revenue ?? 0), 0);
  const avgScore = properties.length > 0
    ? Math.round(properties.reduce((sum, p) => sum + (p.score ?? 0), 0) / properties.length)
    : 0;
  const closedCount = properties.filter((p) => p.stage === 'closed').length;
  const activeCount = properties.filter((p) => p.stage && !['closed', 'lost'].includes(p.stage)).length;
  const leaseUpRate = totalProperties > 0 ? Math.round((closedCount / totalProperties) * 100) : 0;

  const kpis: KPICard[] = [
    {
      label: 'Portfolio Properties',
      value: totalProperties.toString(),
      sub: `${activeCount} active in pipeline`,
      trend: 'up',
      trendValue: '+3 this month',
      icon: Building2,
      color: 'text-blue-500',
    },
    {
      label: 'Est. Revenue',
      value: `$${(totalRevenue / 1000).toFixed(1)}k`,
      sub: 'Across all properties',
      trend: 'up',
      trendValue: '+12% vs last month',
      icon: DollarSign,
      color: 'text-emerald-500',
    },
    {
      label: 'Lease-Up Rate',
      value: `${leaseUpRate}%`,
      sub: `${closedCount} of ${totalProperties} closed`,
      trend: leaseUpRate >= 50 ? 'up' : 'flat',
      trendValue: leaseUpRate >= 50 ? 'Above target' : 'On track',
      icon: TrendingUp,
      color: 'text-violet-500',
    },
    {
      label: 'Avg Prospect Score',
      value: avgScore.toString(),
      sub: 'Portfolio average',
      trend: avgScore >= 70 ? 'up' : avgScore >= 50 ? 'flat' : 'down',
      trendValue: avgScore >= 70 ? 'High quality' : avgScore >= 50 ? 'Moderate' : 'Needs attention',
      icon: BarChart2,
      color: 'text-amber-500',
    },
  ];

  // Stage distribution
  const stageCounts = properties.reduce<Record<string, number>>((acc, p) => {
    const s = p.stage ?? 'new';
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  const stageData = Object.entries(stageCounts).map(([stage, count]) => ({
    stage: stage.charAt(0).toUpperCase() + stage.slice(1),
    count,
  }));

  const recentProperties = properties.slice(0, 8);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={28} className="animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading your portfolio…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Home size={16} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Portfolio Dashboard</p>
            <p className="text-[10px] text-muted-foreground">
              {lastUpdatedStr ? `Updated ${lastUpdatedStr}` : 'Loading…'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-all"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Link
            href="/homeowner/profile"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <Bell size={15} />
          </Link>
          <button
            onClick={() => signOut?.()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-all"
          >
            <LogOut size={12} />
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Here&apos;s your portfolio performance at a glance.</p>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div key={kpi.label} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <Icon size={16} className={kpi.color} />
                  <div className="flex items-center gap-1">
                    <TrendIcon trend={kpi.trend} />
                    <span className={`text-[10px] font-medium ${kpi.trend === 'up' ? 'text-emerald-500' : kpi.trend === 'down' ? 'text-rose-500' : 'text-muted-foreground'}`}>
                      {kpi.trendValue}
                    </span>
                  </div>
                </div>
                <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
                <p className="text-xs font-medium text-foreground mt-0.5">{kpi.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.sub}</p>
              </div>
            );
          })}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Revenue Trend */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Revenue Trend</p>
                <p className="text-xs text-muted-foreground">6-month estimated revenue</p>
              </div>
              <DollarSign size={16} className="text-emerald-500" />
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={REVENUE_TREND}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: number) => [`$${v.toLocaleString()}`, 'Revenue']}
                />
                <Line type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3, fill: 'var(--primary)' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Lead Activity */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Lead Activity</p>
                <p className="text-xs text-muted-foreground">This week — new, contacted, converted</p>
              </div>
              <Activity size={16} className="text-blue-500" />
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={LEAD_ACTIVITY} barSize={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="new" fill="#3b82f6" radius={[3, 3, 0, 0]} name="New" />
                <Bar dataKey="contacted" fill="#f59e0b" radius={[3, 3, 0, 0]} name="Contacted" />
                <Bar dataKey="converted" fill="#10b981" radius={[3, 3, 0, 0]} name="Converted" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Lease-Up Status + Stage Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Lease-Up Progress */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={15} className="text-violet-500" />
              <p className="text-sm font-semibold text-foreground">Lease-Up Status</p>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Closed / Leased', count: closedCount, color: 'bg-emerald-500', pct: leaseUpRate },
                { label: 'Active Pipeline', count: activeCount, color: 'bg-blue-500', pct: totalProperties > 0 ? Math.round((activeCount / totalProperties) * 100) : 0 },
                { label: 'Lost / Inactive', count: properties.filter((p) => p.stage === 'lost').length, color: 'bg-rose-500', pct: totalProperties > 0 ? Math.round((properties.filter((p) => p.stage === 'lost').length / totalProperties) * 100) : 0 },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                    <span className="text-xs font-semibold text-foreground">{item.count} ({item.pct}%)</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stage Distribution */}
          <div className="bg-card border border-border rounded-xl p-5 lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 size={15} className="text-amber-500" />
              <p className="text-sm font-semibold text-foreground">Pipeline Stage Distribution</p>
            </div>
            {stageData.length > 0 ? (
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={stageData} barSize={28}>
                  <XAxis dataKey="stage" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} name="Properties" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-32">
                <p className="text-sm text-muted-foreground">No stage data available</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Properties Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Building2 size={15} className="text-blue-500" />
              <p className="text-sm font-semibold text-foreground">Recent Properties</p>
            </div>
            <Link href="/homeowner/properties" className="flex items-center gap-1 text-xs text-primary hover:underline">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          {recentProperties.length === 0 ? (
            <div className="text-center py-12">
              <Building2 size={28} className="text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No properties in your portfolio yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-5 py-3 text-xs font-medium text-muted-foreground">Property</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Stage</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Est. Revenue</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-muted-foreground">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentProperties.map((prop) => (
                    <tr key={prop.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-sm font-medium text-foreground truncate max-w-[200px]">{prop.address ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">{[prop.city, prop.state].filter(Boolean).join(', ') || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground capitalize">{prop.property_type ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ${STAGE_COLORS[prop.stage ?? 'new'] ?? 'bg-muted text-muted-foreground'}`}>
                          {prop.stage ?? 'new'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-medium text-foreground">
                          {prop.estimated_revenue ? `$${prop.estimated_revenue.toLocaleString()}` : '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={`text-sm font-semibold ${(prop.score ?? 0) >= 70 ? 'text-emerald-500' : (prop.score ?? 0) >= 50 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                          {prop.score ?? '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer note */}
        <div className="text-center pb-4">
          <p className="text-[10px] text-muted-foreground">
            This dashboard shows portfolio-level data only. For questions, contact your property manager.
          </p>
        </div>
      </main>
    </div>
  );
}
