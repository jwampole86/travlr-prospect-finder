'use client';

import React, { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';
import { DollarSign, Clock, CheckCircle, XCircle, AlertCircle, Filter, Download } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


interface Commission {
  id: string;
  leadAddress: string;
  amount: number;
  status: 'pending' | 'approved' | 'paid' | 'clawed_back';
  description: string;
  createdAt: string;
  paidAt?: string;
}

const statusConfig = {
  pending: { label: 'Pending', color: 'bg-warning-bg text-warning border border-warning-border', icon: Clock },
  approved: { label: 'Approved', color: 'bg-info-bg text-info border border-info-border', icon: CheckCircle },
  paid: { label: 'Paid', color: 'bg-success-bg text-success border border-success-border', icon: CheckCircle },
  clawed_back: { label: 'Clawed Back', color: 'bg-danger-bg text-danger border border-danger-border', icon: XCircle },
};

export default function AgentCommissionsPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'paid' | 'clawed_back'>('all');
  const [commissions, setCommissions] = useState<Commission[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    const supabase = createClient();
    supabase
      .from('commissions')
      .select('id, amount, status, description, created_at, paid_at, leads(address)')
      .eq('agent_user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setCommissions((data || []).map((commission: any) => ({
        id: commission.id,
        leadAddress: commission.leads?.address || 'Unlinked commission',
        amount: Number(commission.amount || 0),
        status: commission.status,
        description: commission.description || '',
        createdAt: commission.created_at,
        paidAt: commission.paid_at || undefined,
      }))));
  }, [user?.id]);

  const filtered = filter === 'all' ? commissions : commissions.filter(c => c.status === filter);

  const totals = {
    pending: commissions.filter(c => c.status === 'pending').reduce((s, c) => s + c.amount, 0),
    approved: commissions.filter(c => c.status === 'approved').reduce((s, c) => s + c.amount, 0),
    paid: commissions.filter(c => c.status === 'paid').reduce((s, c) => s + c.amount, 0),
    clawed_back: commissions.filter(c => c.status === 'clawed_back').reduce((s, c) => s + c.amount, 0),
  };

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">My Commissions</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Track your earnings and payout status</p>
          </div>
          <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted transition-all">
            <Download size={14} />
            Export
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Pending', amount: totals.pending, icon: Clock, color: 'text-warning', bg: 'bg-warning-bg' },
            { label: 'Approved', amount: totals.approved, icon: AlertCircle, color: 'text-info', bg: 'bg-info-bg' },
            { label: 'Paid Out', amount: totals.paid, icon: CheckCircle, color: 'text-success', bg: 'bg-success-bg' },
            { label: 'Clawed Back', amount: totals.clawed_back, icon: XCircle, color: 'text-danger', bg: 'bg-danger-bg' },
          ].map(({ label, amount, icon: Icon, color, bg }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
                <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                  <Icon size={15} className={color} />
                </div>
              </div>
              <p className="text-xl font-bold text-foreground font-mono-data">{fmt(amount)}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl w-fit">
          {(['all', 'pending', 'approved', 'paid', 'clawed_back'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all capitalize ${
                filter === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f === 'clawed_back' ? 'Clawed Back' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Commissions Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Property</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(c => {
                const cfg = statusConfig[c.status];
                const StatusIcon = cfg.icon;
                return (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{c.leadAddress}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-muted-foreground">{c.description}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-foreground font-mono-data">{fmt(c.amount)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                        <StatusIcon size={11} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-muted-foreground">{c.paidAt || c.createdAt}</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-12 text-center">
              <DollarSign size={32} className="mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No commissions found</p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
