'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, PieChart, Pie, Cell, Funnel,  } from 'recharts';
import { MessageSquare, CheckCircle, Reply, MousePointerClick, DollarSign, XCircle, Clock, RefreshCw, ChevronRight, ArrowLeft, ThumbsUp, ThumbsDown, Send, Activity, BarChart2, Eye,  } from 'lucide-react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface SMSCampaign {
  id: string;
  campaign_name: string;
  status: string;
  total_recipients: number;
  total_sent: number;
  total_delivered: number;
  total_failed: number;
  total_replied: number;
  total_link_clicks: number;
  total_interested: number;
  total_not_interested: number;
  total_follow_up: number;
  total_pending: number;
  estimated_roi: number;
  cost_per_send: number;
  portfolio_state: string | null;
  sent_at: string | null;
  created_at: string;
}

interface AnalyticsEvent {
  id: string;
  lead_id: string | null;
  phone: string;
  event_type: string;
  reply_body: string | null;
  link_url: string | null;
  created_at: string;
}

interface HomeownerFunnelRow {
  lead_id: string | null;
  phone: string;
  contact_name: string | null;
  address: string | null;
  sent: boolean;
  delivered: boolean;
  replied: boolean;
  link_clicked: boolean;
  interested: boolean;
  not_interested: boolean;
  follow_up: boolean;
  conversion_stage: string;
}

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const STATUS_COLORS: Record<string, string> = {
  sent: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  sending: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  draft: 'bg-muted text-muted-foreground border-border',
  paused: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  cancelled: 'bg-destructive/10 text-destructive border-destructive/20',
};

function pct(num: number, denom: number): string {
  if (!denom) return '0%';
  return `${Math.round((num / denom) * 100)}%`;
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({
  label, value, sub, icon: Icon, color = 'text-foreground', bg = 'bg-card',
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color?: string; bg?: string;
}) {
  return (
    <div className={`${bg} rounded-xl border border-border p-4 flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
        <Icon size={14} className={color} />
      </div>
      <p className={`font-mono-data text-2xl font-bold leading-none ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Funnel Bar ───────────────────────────────────────────────────────────────

function FunnelBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pctVal = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono-data font-semibold">{count.toLocaleString()} <span className="text-muted-foreground font-normal">({pctVal}%)</span></span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pctVal}%` }} />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SMSCampaignAnalyticsPage() {
  const [campaigns, setCampaigns] = useState<SMSCampaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<SMSCampaign | null>(null);
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [funnelRows, setFunnelRows] = useState<HomeownerFunnelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [drillLead, setDrillLead] = useState<HomeownerFunnelRow | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'funnel' | 'timeline'>('overview');

  const supabase = createClient();

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('sms_campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setCampaigns((data as SMSCampaign[]) ?? []);
    setLoading(false);
  }, []);

  const loadCampaignDetail = useCallback(async (campaign: SMSCampaign) => {
    setSelectedCampaign(campaign);
    setEventsLoading(true);
    setActiveTab('overview');

    const { data: evData } = await supabase
      .from('sms_analytics_events')
      .select('id,lead_id,phone,event_type,reply_body,link_url,created_at')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: false })
      .limit(500);

    const evList = (evData as AnalyticsEvent[]) ?? [];
    setEvents(evList);

    // Build per-homeowner funnel
    const phoneMap = new Map<string, HomeownerFunnelRow>();
    for (const ev of evList) {
      const key = ev.phone;
      if (!phoneMap.has(key)) {
        phoneMap.set(key, {
          lead_id: ev.lead_id,
          phone: ev.phone,
          contact_name: null,
          address: null,
          sent: false, delivered: false, replied: false,
          link_clicked: false, interested: false, not_interested: false, follow_up: false,
          conversion_stage: 'Sent',
        });
      }
      const row = phoneMap.get(key)!;
      if (ev.event_type === 'sent') row.sent = true;
      if (ev.event_type === 'delivered') row.delivered = true;
      if (ev.event_type === 'replied') row.replied = true;
      if (ev.event_type === 'link_click') row.link_clicked = true;
      if (ev.event_type === 'interested') { row.interested = true; row.conversion_stage = 'Interested'; }
      if (ev.event_type === 'not_interested') { row.not_interested = true; row.conversion_stage = 'Not Interested'; }
      if (ev.event_type === 'follow_up') { row.follow_up = true; row.conversion_stage = 'Follow-Up'; }
    }

    // Enrich with lead data
    const leadIds = [...phoneMap.values()].map(r => r.lead_id).filter(Boolean) as string[];
    if (leadIds.length > 0) {
      const { data: leads } = await supabase
        .from('leads')
        .select('id,contact_name,address,city,state')
        .in('id', leadIds.slice(0, 100));
      const leadMap = new Map((leads ?? []).map((l: { id: string; contact_name: string | null; address: string | null; city: string | null; state: string | null }) => [l.id, l]));
      for (const row of phoneMap.values()) {
        if (row.lead_id && leadMap.has(row.lead_id)) {
          const l = leadMap.get(row.lead_id)!;
          row.contact_name = l.contact_name;
          row.address = l.address ? `${l.address}, ${l.city ?? ''} ${l.state ?? ''}`.trim() : null;
        }
      }
    }

    setFunnelRows([...phoneMap.values()]);
    setEventsLoading(false);
  }, []);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  // ── Aggregate metrics for selected campaign ──────────────────────────────
  const c = selectedCampaign;
  const deliveryRate = c ? (c.total_sent > 0 ? Math.round((c.total_delivered / c.total_sent) * 100) : 0) : 0;
  const replyRate = c ? (c.total_delivered > 0 ? Math.round((c.total_replied / c.total_delivered) * 100) : 0) : 0;
  const ctr = c ? (c.total_delivered > 0 ? Math.round((c.total_link_clicks / c.total_delivered) * 100) : 0) : 0;
  const interestedRatio = c ? (c.total_replied > 0 ? Math.round((c.total_interested / c.total_replied) * 100) : 0) : 0;
  const totalCost = c ? c.total_sent * (c.cost_per_send ?? 0.0075) : 0;
  const roi = c && totalCost > 0 ? Math.round(((c.estimated_roi - totalCost) / totalCost) * 100) : 0;

  // Timeline data from events
  const timelineMap = new Map<string, { date: string; sent: number; delivered: number; replied: number; clicks: number }>();
  for (const ev of events) {
    const d = new Date(ev.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!timelineMap.has(d)) timelineMap.set(d, { date: d, sent: 0, delivered: 0, replied: 0, clicks: 0 });
    const row = timelineMap.get(d)!;
    if (ev.event_type === 'sent') row.sent++;
    if (ev.event_type === 'delivered') row.delivered++;
    if (ev.event_type === 'replied') row.replied++;
    if (ev.event_type === 'link_click') row.clicks++;
  }
  const timelineData = [...timelineMap.values()].slice(-14);

  const funnelChartData = c ? [
    { name: 'Sent', value: c.total_sent, fill: '#6366f1' },
    { name: 'Delivered', value: c.total_delivered, fill: '#10b981' },
    { name: 'Replied', value: c.total_replied, fill: '#f59e0b' },
    { name: 'Interested', value: c.total_interested, fill: '#22c55e' },
  ] : [];

  const conversionPieData = c ? [
    { name: 'Interested', value: c.total_interested },
    { name: 'Not Interested', value: c.total_not_interested },
    { name: 'Follow-Up', value: c.total_follow_up },
    { name: 'Pending', value: c.total_pending },
  ].filter(d => d.value > 0) : [];

  // ── Campaign list view ───────────────────────────────────────────────────
  if (!selectedCampaign) {
    return (
      <AppLayout>
        <div className="px-4 sm:px-6 py-5 max-w-screen-2xl mx-auto space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground">SMS Campaign Analytics</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Post-send performance metrics, delivery rates, and ROI per campaign</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/sms-inbound-threads" className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity">
                <MessageSquare size={14} />
                Inbound Threads
              </Link>
              <button onClick={loadCampaigns} className="p-2 rounded-lg border border-border hover:bg-muted transition-colors">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Aggregate KPIs across all campaigns */}
          {campaigns.length > 0 && (() => {
            const totals = campaigns.reduce((acc, c) => ({
              sent: acc.sent + c.total_sent,
              delivered: acc.delivered + c.total_delivered,
              replied: acc.replied + c.total_replied,
              clicks: acc.clicks + c.total_link_clicks,
              interested: acc.interested + c.total_interested,
              roi: acc.roi + c.estimated_roi,
            }), { sent: 0, delivered: 0, replied: 0, clicks: 0, interested: 0, roi: 0 });
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <KPICard label="Total Sent" value={totals.sent.toLocaleString()} icon={Send} color="text-primary" />
                <KPICard label="Delivered" value={totals.delivered.toLocaleString()} sub={pct(totals.delivered, totals.sent) + ' rate'} icon={CheckCircle} color="text-emerald-500" />
                <KPICard label="Replied" value={totals.replied.toLocaleString()} sub={pct(totals.replied, totals.delivered) + ' rate'} icon={Reply} color="text-amber-500" />
                <KPICard label="Link Clicks" value={totals.clicks.toLocaleString()} sub={pct(totals.clicks, totals.delivered) + ' CTR'} icon={MousePointerClick} color="text-blue-500" />
                <KPICard label="Interested" value={totals.interested.toLocaleString()} sub={pct(totals.interested, totals.replied) + ' of replies'} icon={ThumbsUp} color="text-success" />
                <KPICard label="Est. ROI" value={fmtCurrency(totals.roi)} icon={DollarSign} color="text-emerald-500" />
              </div>
            );
          })()}

          {/* Campaign Table */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">All Campaigns</h2>
            </div>
            {loading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading campaigns…</div>
            ) : campaigns.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No SMS campaigns found. Send your first campaign from Lead Management.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {['Campaign', 'Status', 'Sent', 'Delivered', 'Reply Rate', 'CTR', 'Interested', 'ROI', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map(camp => {
                      const dr = camp.total_sent > 0 ? Math.round((camp.total_delivered / camp.total_sent) * 100) : 0;
                      const rr = camp.total_delivered > 0 ? Math.round((camp.total_replied / camp.total_delivered) * 100) : 0;
                      const ct = camp.total_delivered > 0 ? Math.round((camp.total_link_clicks / camp.total_delivered) * 100) : 0;
                      return (
                        <tr key={camp.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-foreground max-w-[220px] truncate">{camp.campaign_name}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {camp.sent_at ? new Date(camp.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not sent'}
                              {camp.portfolio_state ? ` · ${camp.portfolio_state}` : ''}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize ${STATUS_COLORS[camp.status] ?? 'bg-muted text-muted-foreground border-border'}`}>
                              {camp.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono-data text-foreground">{camp.total_sent.toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <span className="font-mono-data text-foreground">{camp.total_delivered.toLocaleString()}</span>
                            <span className="text-[11px] text-muted-foreground ml-1">({dr}%)</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-mono-data font-semibold ${rr >= 15 ? 'text-emerald-500' : rr >= 8 ? 'text-amber-500' : 'text-muted-foreground'}`}>{rr}%</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-mono-data font-semibold ${ct >= 10 ? 'text-blue-500' : 'text-muted-foreground'}`}>{ct}%</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono-data text-emerald-500 font-semibold">{camp.total_interested}</span>
                            <span className="text-[11px] text-muted-foreground ml-1">/ {camp.total_replied} replies</span>
                          </td>
                          <td className="px-4 py-3 font-mono-data text-emerald-500 font-semibold">{fmtCurrency(camp.estimated_roi)}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => loadCampaignDetail(camp)}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                            >
                              <BarChart2 size={12} />
                              Analytics
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  // ── Campaign Detail View ─────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="px-4 sm:px-6 py-5 max-w-screen-2xl mx-auto space-y-5">
        {/* Back + Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <button onClick={() => setSelectedCampaign(null)} className="mt-0.5 p-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
              <ArrowLeft size={14} />
            </button>
            <div>
              <h1 className="text-lg font-bold text-foreground">{c!.campaign_name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border capitalize ${STATUS_COLORS[c!.status] ?? ''}`}>
                  {c!.status}
                </span>
                {c!.sent_at && (
                  <span className="text-[11px] text-muted-foreground">
                    Sent {new Date(c!.sent_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
                {c!.portfolio_state && (
                  <span className="text-[11px] text-muted-foreground">· {c!.portfolio_state}</span>
                )}
              </div>
            </div>
          </div>
          <Link href={`/sms-inbound-threads?campaign=${c!.id}`} className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity">
            <MessageSquare size={14} />
            View Threads
          </Link>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <KPICard label="Sent" value={c!.total_sent.toLocaleString()} icon={Send} color="text-primary" />
          <KPICard label="Delivered" value={c!.total_delivered.toLocaleString()} sub={`${deliveryRate}% rate`} icon={CheckCircle} color="text-emerald-500" />
          <KPICard label="Failed" value={c!.total_failed.toLocaleString()} icon={XCircle} color="text-destructive" />
          <KPICard label="Replied" value={c!.total_replied.toLocaleString()} sub={`${replyRate}% rate`} icon={Reply} color="text-amber-500" />
          <KPICard label="Link Clicks" value={c!.total_link_clicks.toLocaleString()} sub={`${ctr}% CTR`} icon={MousePointerClick} color="text-blue-500" />
          <KPICard label="Interested" value={c!.total_interested.toLocaleString()} sub={`${interestedRatio}% of replies`} icon={ThumbsUp} color="text-success" />
          <KPICard label="Not Interested" value={c!.total_not_interested.toLocaleString()} icon={ThumbsDown} color="text-destructive" />
          <KPICard label="Est. ROI" value={fmtCurrency(c!.estimated_roi)} sub={`${roi > 0 ? '+' : ''}${roi}% ROI`} icon={DollarSign} color="text-emerald-500" />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          {(['overview', 'funnel', 'timeline'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {tab === 'overview' ? 'Overview' : tab === 'funnel' ? 'Homeowner Funnel' : 'Timeline'}
            </button>
          ))}
        </div>

        {eventsLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
            <RefreshCw size={16} className="animate-spin mr-2" /> Loading analytics…
          </div>
        ) : (
          <>
            {/* ── Overview Tab ── */}
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Delivery Funnel */}
                <div className="bg-card rounded-xl border border-border p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Delivery Funnel</h3>
                  <div className="space-y-3">
                    <FunnelBar label="Sent" count={c!.total_sent} total={c!.total_sent} color="bg-primary" />
                    <FunnelBar label="Delivered" count={c!.total_delivered} total={c!.total_sent} color="bg-emerald-500" />
                    <FunnelBar label="Replied" count={c!.total_replied} total={c!.total_sent} color="bg-amber-500" />
                    <FunnelBar label="Link Clicks" count={c!.total_link_clicks} total={c!.total_sent} color="bg-blue-500" />
                    <FunnelBar label="Interested" count={c!.total_interested} total={c!.total_sent} color="bg-success" />
                  </div>
                </div>

                {/* Reply Breakdown Pie */}
                <div className="bg-card rounded-xl border border-border p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Reply Outcome Breakdown</h3>
                  {conversionPieData.length > 0 ? (
                    <div className="flex items-center gap-6">
                      <ResponsiveContainer width={160} height={160}>
                        <PieChart>
                          <Pie data={conversionPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={2}>
                            {conversionPieData.map((_, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => [v.toLocaleString(), '']} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2 flex-1">
                        {conversionPieData.map((d, i) => (
                          <div key={d.name} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                              <span className="text-muted-foreground">{d.name}</span>
                            </div>
                            <span className="font-mono-data font-semibold">{d.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">No reply data yet</div>
                  )}
                </div>

                {/* Pending Follow-Up + Not Interested */}
                <div className="bg-card rounded-xl border border-border p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Conversion Summary</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Interested', val: c!.total_interested, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                      { label: 'Not Interested', val: c!.total_not_interested, color: 'text-destructive', bg: 'bg-destructive/10' },
                      { label: 'Follow-Up', val: c!.total_follow_up, color: 'text-amber-500', bg: 'bg-amber-500/10' },
                      { label: 'Pending', val: c!.total_pending, color: 'text-muted-foreground', bg: 'bg-muted' },
                    ].map(item => (
                      <div key={item.label} className={`${item.bg} rounded-lg p-3`}>
                        <p className={`text-xl font-bold font-mono-data ${item.color}`}>{item.val}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{item.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ROI Card */}
                <div className="bg-card rounded-xl border border-border p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Campaign ROI</h3>
                  <div className="space-y-2 text-sm">
                    {[
                      { label: 'Total Messages Sent', val: c!.total_sent.toLocaleString() },
                      { label: 'Cost per SMS', val: `$${(c!.cost_per_send ?? 0.0075).toFixed(4)}` },
                      { label: 'Total Send Cost', val: fmtCurrency(totalCost) },
                      { label: 'Estimated Revenue', val: fmtCurrency(c!.estimated_roi) },
                      { label: 'Net ROI', val: `${roi > 0 ? '+' : ''}${roi}%` },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className="font-mono-data font-semibold text-foreground">{row.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Homeowner Funnel Tab ── */}
            {activeTab === 'funnel' && (
              <div className="space-y-4">
                {drillLead ? (
                  <div className="bg-card rounded-xl border border-border p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <button onClick={() => setDrillLead(null)} className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
                        <ArrowLeft size={13} />
                      </button>
                      <div>
                        <h3 className="text-sm font-semibold">{drillLead.contact_name ?? drillLead.phone}</h3>
                        {drillLead.address && <p className="text-xs text-muted-foreground">{drillLead.address}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Sent', active: drillLead.sent, color: 'text-primary' },
                        { label: 'Delivered', active: drillLead.delivered, color: 'text-emerald-500' },
                        { label: 'Replied', active: drillLead.replied, color: 'text-amber-500' },
                        { label: 'Link Clicked', active: drillLead.link_clicked, color: 'text-blue-500' },
                        { label: 'Interested', active: drillLead.interested, color: 'text-success' },
                        { label: 'Not Interested', active: drillLead.not_interested, color: 'text-destructive' },
                        { label: 'Follow-Up', active: drillLead.follow_up, color: 'text-amber-500' },
                      ].map(step => (
                        <div key={step.label} className={`rounded-lg border p-3 flex items-center gap-2 ${step.active ? 'border-success/30 bg-success/5' : 'border-border bg-muted/20'}`}>
                          {step.active ? <CheckCircle size={14} className="text-success shrink-0" /> : <Clock size={14} className="text-muted-foreground shrink-0" />}
                          <span className={`text-xs font-medium ${step.active ? step.color : 'text-muted-foreground'}`}>{step.label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Conversion stage: <span className="font-semibold text-foreground">{drillLead.conversion_stage}</span>
                    </div>
                    {drillLead.lead_id && (
                      <Link href={`/lead-profile?id=${drillLead.lead_id}`} className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                        <Eye size={12} /> View Lead Profile
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="bg-card rounded-xl border border-border overflow-hidden">
                    <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Per-Homeowner Conversion Funnel</h3>
                      <span className="text-xs text-muted-foreground">{funnelRows.length} recipients</span>
                    </div>
                    {funnelRows.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground text-sm">No recipient data available for this campaign.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border bg-muted/30">
                              {['Homeowner', 'Phone', 'Sent', 'Delivered', 'Replied', 'Link Click', 'Outcome', ''].map(h => (
                                <th key={h} className="px-4 py-3 text-left font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {funnelRows.map((row, i) => (
                              <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-2.5">
                                  <div className="font-medium text-foreground">{row.contact_name ?? '—'}</div>
                                  {row.address && <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">{row.address}</div>}
                                </td>
                                <td className="px-4 py-2.5 font-mono-data text-muted-foreground">{row.phone}</td>
                                {[row.sent, row.delivered, row.replied, row.link_clicked].map((v, j) => (
                                  <td key={j} className="px-4 py-2.5 text-center">
                                    {v ? <CheckCircle size={13} className="text-emerald-500 mx-auto" /> : <XCircle size={13} className="text-muted-foreground/40 mx-auto" />}
                                  </td>
                                ))}
                                <td className="px-4 py-2.5">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                                    row.interested ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : row.not_interested ?'bg-destructive/10 text-destructive border-destructive/20': row.follow_up ?'bg-amber-500/10 text-amber-600 border-amber-500/20': 'bg-muted text-muted-foreground border-border'
                                  }`}>
                                    {row.conversion_stage}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5">
                                  <button onClick={() => setDrillLead(row)} className="p-1 rounded hover:bg-muted transition-colors">
                                    <ChevronRight size={13} className="text-muted-foreground" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Timeline Tab ── */}
            {activeTab === 'timeline' && (
              <div className="bg-card rounded-xl border border-border p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Daily Activity Timeline</h3>
                {timelineData.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">No timeline data available.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={timelineData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="sent" stroke="#6366f1" strokeWidth={2} dot={false} name="Sent" />
                      <Line type="monotone" dataKey="delivered" stroke="#10b981" strokeWidth={2} dot={false} name="Delivered" />
                      <Line type="monotone" dataKey="replied" stroke="#f59e0b" strokeWidth={2} dot={false} name="Replied" />
                      <Line type="monotone" dataKey="clicks" stroke="#3b82f6" strokeWidth={2} dot={false} name="Link Clicks" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
