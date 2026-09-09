'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { HelpButton } from '@/components/OnboardingTourEngine';
import { MessageSquare, Mail, RefreshCw, TrendingUp, TrendingDown, Minus, AlertTriangle, Wifi, WifiOff, ChevronDown, ChevronUp } from 'lucide-react';
import { Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface SparkPoint { t: string; v: number; }

interface SMSKPIData {
  deliveryRate: number;
  carrierRejectionRate: number;
  dndOptOutRate: number;
  carrierCodes: { code: string; label: string; count: number; pct: number; color: string }[];
  hourlyTrend: SparkPoint[];
  delayAlerts: DelayAlert[];
  reliabilityTrend: { day: string; delivered: number; rejected: number; dnd: number }[];
}

interface EmailKPIData {
  deliveryRate: number;
  bounceRate: number;
  hardBounceRate: number;
  softBounceRate: number;
  spamComplaintRate: number;
  hourlyTrend: SparkPoint[];
  delayAlerts: DelayAlert[];
  reliabilityTrend: { day: string; delivered: number; bounced: number; spam: number }[];
  bounceTrend: { day: string; hard: number; soft: number }[];
}

interface DelayAlert {
  id: string;
  channel: 'sms' | 'email';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

function genSpark(base: number, variance: number, n = 24): SparkPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    t: `${String(i).padStart(2, '0')}:00`,
    v: Math.max(0, Math.min(100, base + (Math.random() - 0.5) * variance * 2)),
  }));
}

function genReliability(days = 14) {
  const baseDate = new Date('2026-08-18');
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - (days - 1 - i));
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const delivered = 85 + Math.random() * 12;
    const rejected = 2 + Math.random() * 5;
    const dnd = 1 + Math.random() * 3;
    return { day: label, delivered: +delivered.toFixed(1), rejected: +rejected.toFixed(1), dnd: +dnd.toFixed(1) };
  });
}

function genEmailReliability(days = 14) {
  const baseDate = new Date('2026-08-18');
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - (days - 1 - i));
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const delivered = 88 + Math.random() * 10;
    const bounced = 1 + Math.random() * 4;
    const spam = 0.1 + Math.random() * 0.8;
    return { day: label, delivered: +delivered.toFixed(1), bounced: +bounced.toFixed(1), spam: +spam.toFixed(2) };
  });
}

function genBounceTrend(days = 14) {
  const baseDate = new Date('2026-08-18');
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - (days - 1 - i));
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return {
      day: label,
      hard: +(0.5 + Math.random() * 1.5).toFixed(2),
      soft: +(0.8 + Math.random() * 2.5).toFixed(2),
    };
  });
}

function buildMockSMS(): SMSKPIData {
  return {
    deliveryRate: 91.4,
    carrierRejectionRate: 4.2,
    dndOptOutRate: 2.1,
    carrierCodes: [
      { code: '30003', label: 'Unreachable', count: 142, pct: 38, color: '#ef4444' },
      { code: '30005', label: 'Unknown Destination', count: 89, pct: 24, color: '#f97316' },
      { code: '30006', label: 'Landline / Unreachable', count: 67, pct: 18, color: '#eab308' },
      { code: '30007', label: 'Carrier Violation', count: 51, pct: 14, color: '#8b5cf6' },
      { code: '30008', label: 'Unknown Error', count: 22, pct: 6, color: '#6b7280' },
    ],
    hourlyTrend: genSpark(91, 6),
    delayAlerts: [
      { id: 'a1', channel: 'sms', severity: 'warning', message: 'Twilio delivery latency elevated: avg 4.2s (threshold 3s)', timestamp: '2 min ago', acknowledged: false },
      { id: 'a2', channel: 'sms', severity: 'info', message: 'Carrier 30003 rejection spike: +18% vs 7-day avg', timestamp: '14 min ago', acknowledged: false },
    ],
    reliabilityTrend: genReliability(),
  };
}

function buildMockEmail(): EmailKPIData {
  return {
    deliveryRate: 94.7,
    bounceRate: 3.8,
    hardBounceRate: 1.2,
    softBounceRate: 2.6,
    spamComplaintRate: 0.18,
    hourlyTrend: genSpark(94, 4),
    delayAlerts: [
      { id: 'b1', channel: 'email', severity: 'critical', message: 'Resend domain reputation score dropped to 72 (threshold 80)', timestamp: '5 min ago', acknowledged: false },
      { id: 'b2', channel: 'email', severity: 'warning', message: 'Soft bounce rate trending up: +0.4% over last 48h', timestamp: '1 hr ago', acknowledged: false },
    ],
    reliabilityTrend: genEmailReliability(),
    bounceTrend: genBounceTrend(),
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TrendBadge({ value, good, suffix = '%' }: { value: number; good: boolean; suffix?: string }) {
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  const color = good ? 'text-emerald-500' : 'text-red-500';
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${color}`}>
      <Icon size={11} />
      {Math.abs(value).toFixed(1)}{suffix}
    </span>
  );
}

function KPICard({
  label, value, suffix = '%', trend, trendGood, sublabel, color = 'text-foreground',
}: {
  label: string; value: number; suffix?: string; trend?: number; trendGood?: boolean; sublabel?: string; color?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value.toFixed(1)}{suffix}</p>
      {sublabel && <p className="text-[11px] text-muted-foreground">{sublabel}</p>}
      {trend !== undefined && trendGood !== undefined && (
        <TrendBadge value={trend} good={trendGood} />
      )}
    </div>
  );
}

function AlertStrip({
  alerts,
  onAck,
}: {
  alerts: DelayAlert[];
  onAck: (id: string) => void;
}) {
  const active = alerts.filter((a) => !a.acknowledged);
  if (active.length === 0) return null;

  const severityStyle = {
    critical: 'bg-red-500/10 border-red-500/30 text-red-600',
    warning: 'bg-amber-500/10 border-amber-500/30 text-amber-600',
    info: 'bg-blue-500/10 border-blue-500/30 text-blue-600',
  };

  return (
    <div className="space-y-2">
      {active.map((a) => (
        <div key={a.id} className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border text-xs ${severityStyle[a.severity]}`}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={13} className="shrink-0" />
            <span className="font-medium">{a.message}</span>
            <span className="text-muted-foreground ml-1">{a.timestamp}</span>
          </div>
          <button
            onClick={() => onAck(a.id)}
            className="shrink-0 px-2 py-0.5 rounded-md border border-current text-[10px] font-semibold hover:opacity-70 transition-opacity"
          >
            Ack
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DeliveryKPIsPage() {
  const [sms, setSms] = useState<SMSKPIData>(() => buildMockSMS());
  const [email, setEmail] = useState<EmailKPIData>(() => buildMockEmail());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [lastRefreshStr, setLastRefreshStr] = useState('');
  const [activeTab, setActiveTab] = useState<'sms' | 'email'>('sms');
  const [expandCarrier, setExpandCarrier] = useState(true);
  const [expandBounce, setExpandBounce] = useState(true);

  useEffect(() => {
    const now = new Date();
    setLastRefresh(now);
    setLastRefreshStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  }, []);

  const refresh = useCallback(() => {
    setSms((prev) => ({
      ...prev,
      deliveryRate: +(prev.deliveryRate + (Math.random() - 0.5) * 0.8).toFixed(1),
      carrierRejectionRate: +(prev.carrierRejectionRate + (Math.random() - 0.5) * 0.3).toFixed(1),
      dndOptOutRate: +(prev.dndOptOutRate + (Math.random() - 0.5) * 0.2).toFixed(1),
      hourlyTrend: genSpark(91, 6),
    }));
    setEmail((prev) => ({
      ...prev,
      deliveryRate: +(prev.deliveryRate + (Math.random() - 0.5) * 0.5).toFixed(1),
      bounceRate: +(prev.bounceRate + (Math.random() - 0.5) * 0.2).toFixed(1),
      spamComplaintRate: +(prev.spamComplaintRate + (Math.random() - 0.5) * 0.05).toFixed(2),
      hourlyTrend: genSpark(94, 4),
    }));
    const now = new Date();
    setLastRefresh(now);
    setLastRefreshStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(refresh, 60 * 60 * 1000); // 1 hour
    return () => clearInterval(id);
  }, [autoRefresh, refresh]);

  const ackAlert = (id: string) => {
    setSms((prev) => ({ ...prev, delayAlerts: prev.delayAlerts.map((a) => a.id === id ? { ...a, acknowledged: true } : a) }));
    setEmail((prev) => ({ ...prev, delayAlerts: prev.delayAlerts.map((a) => a.id === id ? { ...a, acknowledged: true } : a) }));
  };

  const allAlerts = [...sms.delayAlerts, ...email.delayAlerts];

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground">Delivery KPIs</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Real-time SMS and email delivery health — carrier codes, bounce trends, and delay alerts</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <HelpButton screenId="ops-monitoring" />
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${autoRefresh ? 'border-primary/40 bg-primary/5 text-primary' : 'border-border bg-card text-muted-foreground'}`}
            >
              {autoRefresh ? <Wifi size={13} /> : <WifiOff size={13} />}
              {autoRefresh ? 'Live' : 'Paused'}
            </button>
            <button
              onClick={refresh}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              <RefreshCw size={13} />
              Refresh
            </button>
            <span className="text-[11px] text-muted-foreground">
              {lastRefreshStr ? `Updated ${lastRefreshStr}` : 'Loading…'}
            </span>
          </div>
        </div>

        {/* Delivery Delay Alerts */}
        {allAlerts.some((a) => !a.acknowledged) && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Delivery Delay Alerts</p>
            <AlertStrip alerts={allAlerts} onAck={ackAlert} />
          </div>
        )}

        {/* Channel Tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          {(['sms', 'email'] as const).map((ch) => (
            <button
              key={ch}
              onClick={() => setActiveTab(ch)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === ch
                  ? 'border-primary text-primary' :'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {ch === 'sms' ? <MessageSquare size={14} /> : <Mail size={14} />}
              {ch === 'sms' ? 'SMS Channel' : 'Email Channel'}
            </button>
          ))}
        </div>

        {/* SMS Tab */}
        {activeTab === 'sms' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard label="Delivery Rate" value={sms.deliveryRate} trend={0.3} trendGood={true} sublabel="Last 24 hours" color="text-emerald-600" />
              <KPICard label="Carrier Rejection Rate" value={sms.carrierRejectionRate} trend={0.2} trendGood={false} sublabel="All carriers" color="text-red-500" />
              <KPICard label="DND Opt-Out Rate" value={sms.dndOptOutRate} trend={-0.1} trendGood={true} sublabel="STOP replies" color="text-amber-500" />
              <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
                <p className="text-xs text-muted-foreground font-medium">24h Delivery Trend</p>
                <div className="flex-1 min-h-[60px]">
                  <ResponsiveContainer width="100%" height={60}>
                    <AreaChart data={sms.hourlyTrend}>
                      <defs>
                        <linearGradient id="smsGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="v" stroke="#22c55e" strokeWidth={1.5} fill="url(#smsGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Carrier Codes */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandCarrier((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <MessageSquare size={15} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">Carrier Error Codes</span>
                  <span className="text-xs text-muted-foreground">({sms.carrierCodes.reduce((s, c) => s + c.count, 0)} errors this week)</span>
                </div>
                {expandCarrier ? <ChevronUp size={15} className="text-muted-foreground" /> : <ChevronDown size={15} className="text-muted-foreground" />}
              </button>
              {expandCarrier && (
                <div className="px-5 pb-5">
                  <div className="space-y-3">
                    {sms.carrierCodes.map((c) => (
                      <div key={c.code} className="flex items-center gap-3">
                        <div className="w-16 shrink-0">
                          <span className="text-xs font-mono font-bold text-foreground">{c.code}</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground">{c.label}</span>
                            <span className="text-xs font-semibold text-foreground">{c.count} ({c.pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${c.pct}%`, backgroundColor: c.color }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Per-Channel Reliability Trend */}
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-sm font-semibold text-foreground mb-4">14-Day SMS Reliability Trend</p>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={sms.reliabilityTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="smsDelivered" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" unit="%" />
                  <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="delivered" name="Delivered %" stroke="#22c55e" strokeWidth={2} fill="url(#smsDelivered)" dot={false} />
                  <Line type="monotone" dataKey="rejected" name="Rejected %" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="dnd" name="DND Opt-Out %" stroke="#f97316" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Email Tab */}
        {activeTab === 'email' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPICard label="Delivery Rate" value={email.deliveryRate} trend={0.2} trendGood={true} sublabel="Last 24 hours" color="text-emerald-600" />
              <KPICard label="Bounce Rate" value={email.bounceRate} trend={0.1} trendGood={false} sublabel="Hard + Soft" color="text-red-500" />
              <KPICard label="Spam Complaint Rate" value={email.spamComplaintRate} trend={-0.02} trendGood={true} sublabel="ISP reported" color="text-amber-500" />
              <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-1">
                <p className="text-xs text-muted-foreground font-medium">24h Delivery Trend</p>
                <div className="flex-1 min-h-[60px]">
                  <ResponsiveContainer width="100%" height={60}>
                    <AreaChart data={email.hourlyTrend}>
                      <defs>
                        <linearGradient id="emailGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="v" stroke="#3b82f6" strokeWidth={1.5} fill="url(#emailGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Hard/Soft Bounce Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-foreground">Hard Bounce Rate</p>
                  <span className="text-lg font-bold text-red-500">{email.hardBounceRate.toFixed(1)}%</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Invalid addresses, domain not found, account closed</p>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min(email.hardBounceRate * 10, 100)}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">Threshold: 2.0% · {email.hardBounceRate > 2 ? '⚠️ Above threshold' : '✓ Within threshold'}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-foreground">Soft Bounce Rate</p>
                  <span className="text-lg font-bold text-amber-500">{email.softBounceRate.toFixed(1)}%</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Mailbox full, server temporarily unavailable, message too large</p>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(email.softBounceRate * 8, 100)}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">Threshold: 5.0% · {email.softBounceRate > 5 ? '⚠️ Above threshold' : '✓ Within threshold'}</p>
              </div>
            </div>

            {/* Bounce Trend */}
            {expandBounce && (
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-foreground">Hard / Soft Bounce Trend (14 days)</p>
                  <button onClick={() => setExpandBounce(false)} className="text-muted-foreground hover:text-foreground">
                    <ChevronUp size={15} />
                  </button>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={email.bounceTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                    <YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" unit="%" />
                    <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="hard" name="Hard Bounce %" fill="#ef4444" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="soft" name="Soft Bounce %" fill="#f97316" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Email Reliability Trend */}
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-sm font-semibold text-foreground mb-4">14-Day Email Reliability Trend</p>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={email.reliabilityTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="emailDelivered" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" unit="%" />
                  <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="delivered" name="Delivered %" stroke="#3b82f6" strokeWidth={2} fill="url(#emailDelivered)" dot={false} />
                  <Line type="monotone" dataKey="bounced" name="Bounced %" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="spam" name="Spam %" stroke="#f97316" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
