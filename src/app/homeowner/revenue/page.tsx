'use client';

import React, { useState, useEffect } from 'react';
import HomeownerLayout from '../layout';
import { DollarSign, Download, TrendingUp, Calendar, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { createClient } from '@/lib/supabase/client';
import Icon from '@/components/ui/AppIcon';



interface Payout {
  id: string;
  period_start: string;
  period_end: string;
  gross_amount: number;
  net_amount: number;
  management_fee: number;
  status: string;
  statement_url?: string;
}

interface Booking {
  id: string;
  check_in: string;
  nights: number;
  gross_revenue: number;
}

const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;

const formatPeriod = (p: Payout) => {
  if (!p.period_start) return '—';
  const d = new Date(p.period_start);
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
};

const formatPeriodShort = (p: Payout) => {
  if (!p.period_start) return '—';
  const d = new Date(p.period_start);
  return d.toLocaleString('en-US', { month: 'short' });
};

export default function HomeownerRevenuePage() {
  const supabase = createClient();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) { setLoading(false); return; }

      // Get homeowner's lead_ids
      const { data: propLinks } = await supabase
        .from('property_homeowners')
        .select('lead_id')
        .eq('homeowner_user_id', userRes.user.id);

      const leadIds = (propLinks || []).map((p: any) => p.lead_id).filter(Boolean);
      if (leadIds.length === 0) { setLoading(false); return; }

      const [payoutsRes, bookingsRes] = await Promise.all([
        supabase
          .from('payouts')
          .select('*')
          .in('lead_id', leadIds)
          .order('period_start', { ascending: false })
          .limit(24),
        supabase
          .from('bookings')
          .select('id, check_in, nights, gross_revenue')
          .in('lead_id', leadIds)
          .order('check_in', { ascending: false })
          .limit(100),
      ]);

      if (payoutsRes.data) setPayouts(payoutsRes.data);
      if (bookingsRes.data) setBookings(bookingsRes.data);
      setLoading(false);
    };
    load();
  }, [supabase]);

  const ytdGross = payouts.reduce((s, p) => s + (p.gross_amount || 0), 0);
  const ytdNet = payouts.reduce((s, p) => s + (p.net_amount || 0), 0);
  const ytdFees = payouts.reduce((s, p) => s + (p.management_fee || (p.gross_amount - p.net_amount) || 0), 0);

  const chartData = payouts.slice(0, 8).reverse().map(p => ({
    month: formatPeriodShort(p),
    gross: p.gross_amount || 0,
    net: p.net_amount || 0,
    fee: p.management_fee || (p.gross_amount - p.net_amount) || 0,
  }));

  if (loading) {
    return (
      <HomeownerLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </HomeownerLayout>
    );
  }

  return (
    <HomeownerLayout>
      <div className="p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-foreground">Revenue & Financials</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Your earnings, payouts, and monthly statements</p>
          </div>
        </div>

        {/* YTD Summary — responsive: 1 col on mobile, 3 on sm+ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'YTD Gross Revenue', value: fmt(ytdGross), icon: DollarSign, color: 'text-primary', bg: 'bg-primary/10' },
            { label: 'YTD Net Payout', value: fmt(ytdNet), icon: TrendingUp, color: 'text-success', bg: 'bg-success/10' },
            { label: 'Management Fees', value: fmt(ytdFees), icon: Calendar, color: 'text-muted-foreground', bg: 'bg-muted' },
          ].map(({ label, value, icon: CardIcon, color, bg }) => {
            const Icon = CardIcon;
            return (
              <div key={label} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-muted-foreground">{label}</span>
                  <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                    <Icon size={15} className={color} />
                  </div>
                </div>
                <p className="text-xl font-bold text-foreground">{value}</p>
              </div>
            );
          })}
        </div>

        {/* Bar Chart */}
        <div className="bg-card border border-border rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Monthly Revenue Breakdown</h3>
          </div>
          {chartData.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No revenue data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any) => [`$${v.toLocaleString()}`, '']}
                />
                <Bar dataKey="gross" name="Gross" fill="var(--primary)" opacity={0.7} radius={[3, 3, 0, 0]} />
                <Bar dataKey="net" name="Net Payout" fill="var(--success)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Statements Table — scrollable on mobile */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Monthly Statements</h3>
          </div>
          {payouts.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No payout statements yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Period</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gross</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mgmt Fee</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Net Payout</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3"></th>
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
                      <td className="px-4 py-3">
                        {p.statement_url ? (
                          <a href={p.statement_url} download className="flex items-center gap-1 text-xs text-primary hover:underline">
                            <Download size={11} />
                            PDF
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </HomeownerLayout>
  );
}
