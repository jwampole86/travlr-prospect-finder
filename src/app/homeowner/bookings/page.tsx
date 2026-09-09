'use client';

import React, { useState, useEffect } from 'react';
import HomeownerLayout from '../layout';
import { Calendar, ChevronLeft, ChevronRight, Users, DollarSign, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Icon from '@/components/ui/AppIcon';



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

const statusConfig: Record<string, string> = {
  confirmed: 'bg-success/10 text-success border border-success/20',
  pending: 'bg-warning/10 text-warning border border-warning/20',
  completed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-danger/10 text-danger border border-danger/20',
};

const fmt = (n: number) => `$${n.toLocaleString('en-US')}`;

export default function HomeownerBookingsPage() {
  const supabase = createClient();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'completed'>('all');
  const [calMonth, setCalMonth] = useState(new Date());

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) { setLoading(false); return; }

      const { data: propLinks } = await supabase
        .from('property_homeowners')
        .select('lead_id')
        .eq('homeowner_user_id', userRes.user.id);

      const leadIds = (propLinks || []).map((p: any) => p.lead_id).filter(Boolean);
      if (leadIds.length === 0) { setLoading(false); return; }

      const { data } = await supabase
        .from('bookings')
        .select('*')
        .in('lead_id', leadIds)
        .order('check_in', { ascending: false })
        .limit(100);

      if (data) setBookings(data);
      setLoading(false);
    };
    load();
  }, [supabase]);

  const filtered = filter === 'upcoming'
    ? bookings.filter(b => b.status === 'confirmed' || b.status === 'pending')
    : filter === 'completed'
    ? bookings.filter(b => b.status === 'completed')
    : bookings;

  const totalRevenue = filtered.reduce((s, b) => s + (b.gross_revenue || 0), 0);
  const totalNights = filtered.reduce((s, b) => s + (b.nights || 0), 0);

  const calYear = calMonth.getFullYear();
  const calMonthIdx = calMonth.getMonth();
  const firstDay = new Date(calYear, calMonthIdx, 1).getDay();
  const daysInMonth = new Date(calYear, calMonthIdx + 1, 0).getDate();

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
        {/* Header — stacks on mobile */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Bookings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">View-only access to your property bookings</p>
          </div>
          <div className="flex items-center gap-1 bg-muted p-1 rounded-lg w-fit">
            {(['list', 'calendar'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${
                  view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Summary — 1 col on mobile, 3 on sm+ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Total Bookings', value: filtered.length, icon: Calendar },
            { label: 'Total Nights', value: totalNights, icon: Users },
            { label: 'Total Revenue', value: fmt(totalRevenue), icon: DollarSign },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon size={14} className="text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">{label}</span>
              </div>
              <p className="text-xl font-bold text-foreground">{value}</p>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl w-fit">
          {(['all', 'upcoming', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all capitalize ${
                filter === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {view === 'list' && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No bookings found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Guest</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Check-in</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Check-out</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nights</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Platform</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Revenue</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map(b => (
                      <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-foreground whitespace-nowrap">{b.guest_name || 'Guest'}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{b.check_in}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">{b.check_out}</td>
                        <td className="px-4 py-3 text-sm text-center text-muted-foreground">{b.nights}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">{b.platform}</td>
                        <td className="px-4 py-3 text-sm text-right font-mono font-semibold text-foreground">{fmt(b.gross_revenue || 0)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize whitespace-nowrap ${statusConfig[b.status] || statusConfig.completed}`}>
                            {b.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {view === 'calendar' && (
          <div className="bg-card border border-border rounded-xl p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">
                {calMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
              </h3>
              <div className="flex items-center gap-1">
                <button onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="p-1.5 rounded-lg hover:bg-muted transition-all"><ChevronLeft size={14} /></button>
                <button onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="p-1.5 rounded-lg hover:bg-muted transition-all"><ChevronRight size={14} /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} className="text-center text-[10px] sm:text-xs font-medium text-muted-foreground py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }, (_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const date = i + 1;
                const dateStr = `${calYear}-${String(calMonthIdx + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
                const isBooked = bookings.some(b => {
                  return dateStr >= b.check_in && dateStr < b.check_out;
                });
                return (
                  <div
                    key={date}
                    className={`aspect-square flex items-center justify-center rounded-lg text-xs transition-all ${
                      isBooked ? 'bg-primary/15 text-primary font-medium' : 'hover:bg-muted text-foreground'
                    }`}
                  >
                    {date}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-primary/15" /><span className="text-xs text-muted-foreground">Booked</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-muted" /><span className="text-xs text-muted-foreground">Available</span></div>
            </div>
          </div>
        )}
      </div>
    </HomeownerLayout>
  );
}
