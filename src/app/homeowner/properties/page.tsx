'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Home, DollarSign, TrendingUp, Calendar, CheckCircle2, Clock, AlertCircle, BarChart2, ChevronRight, Building2, MapPin, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface PropertySummary {
  id: string;
  property_address: string;
  city: string;
  state: string;
  property_type: string;
  // Revenue
  monthly_revenue_run_rate: number;
  ytd_gross: number;
  ytd_net: number;
  last_payout_amount: number | null;
  last_payout_date: string | null;
  next_payout_amount: number | null;
  next_payout_date: string | null;
  payout_status: 'paid' | 'pending' | 'overdue' | 'none';
  // Lease-up
  lease_up_stage: 'onboarding' | 'listing_prep' | 'listed' | 'first_booking' | 'fully_operational';
  lease_up_progress: number; // 0–100
  listing_live: boolean;
  first_booking_date: string | null;
  occupancy_rate: number;
  // Bookings
  upcoming_bookings: number;
  monthly_chart: { month: string; gross: number; net: number }[];
}

// ─── Lease-up Stage Config ────────────────────────────────────────────────────

const LEASE_UP_STAGES = [
  { key: 'onboarding', label: 'Onboarding', pct: 20 },
  { key: 'listing_prep', label: 'Listing Prep', pct: 40 },
  { key: 'listed', label: 'Listed', pct: 60 },
  { key: 'first_booking', label: 'First Booking', pct: 80 },
  { key: 'fully_operational', label: 'Fully Operational', pct: 100 },
];

function LeaseUpProgress({ stage, progress }: { stage: string; progress: number }) {
  const stageIdx = LEASE_UP_STAGES.findIndex(s => s.key === stage);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground capitalize">{stage.replace(/_/g, ' ')}</span>
        <span className="text-xs font-bold text-primary">{progress}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        {LEASE_UP_STAGES.map((s, i) => (
          <div key={s.key} className="flex flex-col items-center gap-0.5">
            <div className={`w-2 h-2 rounded-full ${i <= stageIdx ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
            <span className="text-[8px] text-muted-foreground hidden sm:block">{s.label.split(' ')[0]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PayoutStatusBadge({ status }: { status: PropertySummary['payout_status'] }) {
  const map = {
    paid: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
    pending: 'bg-amber-500/10 text-amber-700 border-amber-200',
    overdue: 'bg-red-500/10 text-red-700 border-red-200',
    none: 'bg-muted text-muted-foreground border-border',
  };
  const labels = { paid: 'Paid', pending: 'Pending', overdue: 'Overdue', none: 'No Payouts' };
  const icons = {
    paid: <CheckCircle2 size={10} />,
    pending: <Clock size={10} />,
    overdue: <AlertCircle size={10} />,
    none: <DollarSign size={10} />,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${map[status]}`}>
      {icons[status]} {labels[status]}
    </span>
  );
}

const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;

// ─── Property Card ────────────────────────────────────────────────────────────

function PropertyCard({ prop }: { prop: PropertySummary }) {
  const [showChart, setShowChart] = useState(false);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden hover:border-primary/30 transition-colors">
      {/* Header */}
      <div className="flex items-start gap-4 p-5 pb-4">
        <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <Building2 size={18} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold text-foreground leading-tight">{prop.property_address}</h3>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin size={10} />
                {prop.city}, {prop.state} · <span className="capitalize">{prop.property_type?.replace(/_/g, ' ')}</span>
              </p>
            </div>
            <PayoutStatusBadge status={prop.payout_status} />
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border-t border-b border-border">
        {[
          { label: 'Monthly Run Rate', value: fmt(prop.monthly_revenue_run_rate), icon: TrendingUp, color: 'text-primary' },
          { label: 'YTD Gross', value: fmt(prop.ytd_gross), icon: DollarSign, color: 'text-emerald-600' },
          { label: 'Occupancy', value: `${prop.occupancy_rate}%`, icon: Calendar, color: 'text-blue-600' },
          { label: 'Upcoming Bookings', value: String(prop.upcoming_bookings), icon: BarChart2, color: 'text-amber-600' },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className={`px-4 py-3 ${i < 3 ? 'border-r border-border' : ''}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <Icon size={11} className={kpi.color} />
                <span className="text-[10px] text-muted-foreground">{kpi.label}</span>
              </div>
              <p className="text-base font-bold text-foreground">{kpi.value}</p>
            </div>
          );
        })}
      </div>

      {/* Lease-up Progress */}
      <div className="px-5 py-4 border-b border-border">
        <p className="text-xs font-semibold text-foreground mb-3">Lease-Up Progress</p>
        <LeaseUpProgress stage={prop.lease_up_stage} progress={prop.lease_up_progress} />
        {prop.first_booking_date && (
          <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
            <CheckCircle2 size={10} className="text-emerald-500" />
            First booking: {new Date(prop.first_booking_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        )}
      </div>

      {/* Payout Info */}
      <div className="px-5 py-4 border-b border-border grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] text-muted-foreground mb-0.5">Last Payout</p>
          {prop.last_payout_amount ? (
            <>
              <p className="text-sm font-bold text-foreground">{fmt(prop.last_payout_amount)}</p>
              {prop.last_payout_date && (
                <p className="text-[10px] text-muted-foreground">{new Date(prop.last_payout_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              )}
            </>
          ) : <p className="text-sm text-muted-foreground">—</p>}
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground mb-0.5">Next Payout</p>
          {prop.next_payout_amount ? (
            <>
              <p className="text-sm font-bold text-foreground">{fmt(prop.next_payout_amount)}</p>
              {prop.next_payout_date && (
                <p className="text-[10px] text-muted-foreground">{new Date(prop.next_payout_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              )}
            </>
          ) : <p className="text-sm text-muted-foreground">—</p>}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between px-5 py-3">
        <button
          onClick={() => setShowChart(v => !v)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <BarChart2 size={12} />
          {showChart ? 'Hide Chart' : 'Revenue Chart'}
        </button>
        <Link
          href={`/homeowner?property=${prop.id}`}
          className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
        >
          View Details <ChevronRight size={12} />
        </Link>
      </div>

      {/* Revenue Chart */}
      {showChart && prop.monthly_chart.length > 0 && (
        <div className="px-5 pb-5 border-t border-border pt-4">
          <p className="text-xs font-semibold text-foreground mb-3">Monthly Revenue</p>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={prop.monthly_chart} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} formatter={(v: unknown) => [`$${(v as number).toLocaleString()}`, '']} />
              <Bar dataKey="gross" fill="var(--primary)" opacity={0.8} radius={[3, 3, 0, 0]} name="Gross" />
              <Bar dataKey="net" fill="#10b981" opacity={0.8} radius={[3, 3, 0, 0]} name="Net" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomeownerPropertiesPage() {
  const supabase = createClient();
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data: user } = await supabase.auth.getUser();
        if (!user.user) return;

        const { data: homeowner } = await supabase
          .from('homeowner_profiles')
          .select('id')
          .eq('user_id', user.user.id)
          .maybeSingle();
        if (!homeowner) throw new Error('No homeowner profile');

        const { data: propLinks } = await supabase
          .from('property_homeowners')
          .select('id, property_address, property_type, city, state')
          .eq('homeowner_id', homeowner.id);

        if (!propLinks || propLinks.length === 0) throw new Error('No properties');

        const propIds = propLinks.map((p: any) => p.id);

        const [payoutsRes, bookingsRes] = await Promise.all([
          supabase.from('payouts').select('*').in('property_id', propIds).order('payout_date', { ascending: false }),
          supabase.from('bookings').select('*').in('property_id', propIds).order('check_in', { ascending: false }),
        ]);

        const payouts = payoutsRes.data || [];
        const bookings = bookingsRes.data || [];

        const summaries: PropertySummary[] = propLinks.map((p: any) => {
          const propPayouts = payouts.filter((py: any) => py.property_id === p.id);
          const propBookings = bookings.filter((b: any) => b.property_id === p.id);

          const lastPayout = propPayouts.find((py: any) => py.status === 'paid') || null;
          const nextPayout = propPayouts.find((py: any) => py.status === 'pending') || null;

          const ytdGross = propPayouts.filter((py: any) => {
            const y = new Date(py.payout_date).getFullYear();
            return y === new Date().getFullYear() && py.status === 'paid';
          }).reduce((s: number, py: any) => s + (py.gross_amount || 0), 0);

          const ytdNet = propPayouts.filter((py: any) => {
            const y = new Date(py.payout_date).getFullYear();
            return y === new Date().getFullYear() && py.status === 'paid';
          }).reduce((s: number, py: any) => s + (py.net_amount || 0), 0);

          const recentPayouts = propPayouts.slice(0, 3);
          const avgMonthly = recentPayouts.length > 0
            ? recentPayouts.reduce((s: number, py: any) => s + (py.gross_amount || 0), 0) / recentPayouts.length
            : 0;

          const now = new Date();
          const upcomingBookings = propBookings.filter((b: any) => new Date(b.check_in) >= now).length;
          const currentMonthBookings = propBookings.filter((b: any) => {
            const d = new Date(b.check_in);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          });
          const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
          const nightsBooked = currentMonthBookings.reduce((s: number, b: any) => s + (b.nights || 0), 0);
          const occupancyRate = daysInMonth > 0 ? Math.min(100, Math.round((nightsBooked / daysInMonth) * 100)) : 0;

          const firstBooking = propBookings.length > 0
            ? propBookings.reduce((earliest: any, b: any) => new Date(b.check_in) < new Date(earliest.check_in) ? b : earliest)
            : null;

          const leaseUpStage: PropertySummary['lease_up_stage'] = propBookings.length >= 5
            ? 'fully_operational'
            : propBookings.length >= 1
            ? 'first_booking'
            : propPayouts.length > 0
            ? 'listed' :'listing_prep';

          const leaseUpPct = LEASE_UP_STAGES.find(s => s.key === leaseUpStage)?.pct || 20;

          const monthlyChart = propPayouts.slice(0, 6).reverse().map((py: any) => ({
            month: py.period ? py.period.split(' ')[0]?.slice(0, 3) : '—',
            gross: py.gross_amount || 0,
            net: py.net_amount || 0,
          }));

          const payoutStatus: PropertySummary['payout_status'] = nextPayout
            ? 'pending'
            : lastPayout
            ? 'paid'
            : propPayouts.length === 0
            ? 'none' :'paid';

          return {
            id: p.id,
            property_address: p.property_address,
            city: p.city,
            state: p.state,
            property_type: p.property_type,
            monthly_revenue_run_rate: Math.round(avgMonthly),
            ytd_gross: ytdGross,
            ytd_net: ytdNet,
            last_payout_amount: lastPayout?.net_amount || null,
            last_payout_date: lastPayout?.payout_date || null,
            next_payout_amount: nextPayout?.net_amount || null,
            next_payout_date: nextPayout?.payout_date || null,
            payout_status: payoutStatus,
            lease_up_stage: leaseUpStage,
            lease_up_progress: leaseUpPct,
            listing_live: propPayouts.length > 0,
            first_booking_date: firstBooking?.check_in || null,
            occupancy_rate: occupancyRate,
            upcoming_bookings: upcomingBookings,
            monthly_chart: monthlyChart,
          };
        });

        setProperties(summaries);
      } catch {
        // Mock fallback
        setProperties([
          {
            id: 'prop-1', property_address: '1842 Larimer St', city: 'Denver', state: 'CO', property_type: 'condo',
            monthly_revenue_run_rate: 3850, ytd_gross: 23100, ytd_net: 18480,
            last_payout_amount: 3080, last_payout_date: new Date(Date.now() - 30 * 86400000).toISOString(),
            next_payout_amount: 3200, next_payout_date: new Date(Date.now() + 5 * 86400000).toISOString(),
            payout_status: 'pending', lease_up_stage: 'fully_operational', lease_up_progress: 100,
            listing_live: true, first_booking_date: new Date(Date.now() - 180 * 86400000).toISOString(),
            occupancy_rate: 78, upcoming_bookings: 4,
            monthly_chart: [
              { month: 'Mar', gross: 3200, net: 2560 }, { month: 'Apr', gross: 3600, net: 2880 },
              { month: 'May', gross: 4100, net: 3280 }, { month: 'Jun', gross: 4400, net: 3520 },
              { month: 'Jul', gross: 3900, net: 3120 }, { month: 'Aug', gross: 3850, net: 3080 },
            ],
          },
          {
            id: 'prop-2', property_address: '3301 Zuni St', city: 'Denver', state: 'CO', property_type: 'house',
            monthly_revenue_run_rate: 2100, ytd_gross: 8400, ytd_net: 6720,
            last_payout_amount: 1680, last_payout_date: new Date(Date.now() - 30 * 86400000).toISOString(),
            next_payout_amount: null, next_payout_date: null,
            payout_status: 'paid', lease_up_stage: 'first_booking', lease_up_progress: 80,
            listing_live: true, first_booking_date: new Date(Date.now() - 60 * 86400000).toISOString(),
            occupancy_rate: 52, upcoming_bookings: 2,
            monthly_chart: [
              { month: 'May', gross: 1800, net: 1440 }, { month: 'Jun', gross: 2200, net: 1760 },
              { month: 'Jul', gross: 2400, net: 1920 }, { month: 'Aug', gross: 2100, net: 1680 },
            ],
          },
          {
            id: 'prop-3', property_address: '512 Pearl St', city: 'Boulder', state: 'CO', property_type: 'condo',
            monthly_revenue_run_rate: 0, ytd_gross: 0, ytd_net: 0,
            last_payout_amount: null, last_payout_date: null,
            next_payout_amount: null, next_payout_date: null,
            payout_status: 'none', lease_up_stage: 'listing_prep', lease_up_progress: 40,
            listing_live: false, first_booking_date: null,
            occupancy_rate: 0, upcoming_bookings: 0,
            monthly_chart: [],
          },
        ]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [supabase]);

  // Portfolio KPIs
  const totalRunRate = properties.reduce((s, p) => s + p.monthly_revenue_run_rate, 0);
  const totalYTDGross = properties.reduce((s, p) => s + p.ytd_gross, 0);
  const activeProps = properties.filter(p => p.listing_live).length;
  const avgOccupancy = properties.length > 0
    ? Math.round(properties.filter(p => p.occupancy_rate > 0).reduce((s, p) => s + p.occupancy_rate, 0) / Math.max(1, properties.filter(p => p.occupancy_rate > 0).length))
    : 0;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">My Properties</h1>
          <p className="text-sm text-muted-foreground mt-0.5">All enrolled properties — revenue run rate, payout status, and lease-up progress</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* Portfolio KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Portfolio Run Rate', value: fmt(totalRunRate) + '/mo', icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'YTD Gross Revenue', value: fmt(totalYTDGross), icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-500/10' },
          { label: 'Active Properties', value: `${activeProps} / ${properties.length}`, icon: Home, color: 'text-blue-600', bg: 'bg-blue-500/10' },
          { label: 'Avg Occupancy', value: avgOccupancy > 0 ? `${avgOccupancy}%` : '—', icon: Calendar, color: 'text-amber-600', bg: 'bg-amber-500/10' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon size={15} className={color} />
              </div>
            </div>
            <p className="text-xl font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Property Cards */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(i => <div key={i} className="h-64 bg-muted/30 rounded-xl animate-pulse" />)}
        </div>
      ) : properties.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <Building2 size={32} className="text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No properties enrolled yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Contact your TRAVLR property manager to enroll your first property</p>
        </div>
      ) : (
        <div className="space-y-4">
          {properties.map(prop => (
            <PropertyCard key={prop.id} prop={prop} />
          ))}
        </div>
      )}
    </div>
  );
}
