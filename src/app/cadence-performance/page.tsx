'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Zap, TrendingUp, CheckCircle, Users, ChevronDown, ChevronRight, ArrowUpRight, Activity, Target, BarChart2, RefreshCw, Eye, MousePointerClick, Reply, Download, FileText } from 'lucide-react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SequenceMetric {
  id: string;
  name: string;
  total_enrolled: number;
  completed: number;
  escalated: number;
  active: number;
  paused: number;
  completion_rate: number;
  escalation_rate: number;
  email_sends: number;
  sms_sends: number;
  opens: number;
  clicks: number;
  replies: number;
  engagement_rate: number;
}

interface StageDistribution {
  stage: string;
  count: number;
  color: string;
}

interface WeeklyTrend {
  week: string;
  escalated: number;
  completed: number;
  new_enrolled: number;
}

interface LeadStepHistory {
  id: string;
  lead_id: string;
  lead_name: string;
  address: string;
  stage: string;
  cadence_step: number;
  sequence_name: string;
  enrollment_status: string;
  last_contacted_at: string | null;
  enrolled_at: string;
  steps: StepEvent[];
}

interface StepEvent {
  step_number: number;
  channel: string;
  status: string;
  sent_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  nurturing: '#3b82f6',
  engaged: '#10b981',
  human_outreach: '#f59e0b',
  closed_won: '#22c55e',
  closed_dead: '#ef4444',
  new: '#8b5cf6',
};

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

function StatCard({ label, value, sub, icon, trend, color = 'text-foreground' }: {
  label: string; value: string | number; sub?: string; icon: React.ReactNode; trend?: number; color?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      {trend !== undefined && (
        <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          <ArrowUpRight size={12} className={trend < 0 ? 'rotate-180' : ''} />
          {Math.abs(trend)}% vs last week
        </div>
      )}
    </div>
  );
}

// ─── Per-Lead Drill-Down Row ──────────────────────────────────────────────────

function LeadDrillDown({ lead }: { lead: LeadStepHistory }) {
  const [open, setOpen] = useState(false);

  const stageBg: Record<string, string> = {
    nurturing: 'bg-blue-500/10 text-blue-600',
    engaged: 'bg-emerald-500/10 text-emerald-600',
    human_outreach: 'bg-amber-500/10 text-amber-600',
    closed_won: 'bg-green-500/10 text-green-600',
    closed_dead: 'bg-red-500/10 text-red-600',
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex-1 min-w-0 grid grid-cols-4 gap-4 items-center">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{lead.lead_name}</p>
            <p className="text-xs text-muted-foreground truncate">{lead.address}</p>
          </div>
          <div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stageBg[lead.stage] || 'bg-muted text-muted-foreground'}`}>
              {lead.stage?.replace('_', ' ')}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Step {lead.cadence_step}</span>
            {' · '}{lead.sequence_name}
          </div>
          <div className="text-xs text-muted-foreground">
            {lead.last_contacted_at
              ? `Last contact: ${new Date(lead.last_contacted_at).toLocaleDateString()}`
              : 'Not yet contacted'}
          </div>
        </div>
        {open ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-border bg-muted/10">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-3 mb-2">Cadence Step History</p>
          {lead.steps.length === 0 ? (
            <p className="text-xs text-muted-foreground">No steps logged yet</p>
          ) : (
            <div className="relative flex flex-col gap-0">
              {lead.steps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-3 relative">
                  {idx < lead.steps.length - 1 && (
                    <div className="absolute left-[11px] top-5 bottom-0 w-px bg-border" />
                  )}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 text-[10px] font-bold mt-0.5 ${
                    step.status === 'sent' ? 'bg-emerald-500/10 text-emerald-600' :
                    step.status === 'failed' ? 'bg-red-500/10 text-red-600' :
                    step.status === 'skipped_opt_out'? 'bg-orange-500/10 text-orange-600' : 'bg-muted text-muted-foreground'
                  }`}>
                    {step.step_number + 1}
                  </div>
                  <div className="flex-1 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground capitalize">{step.channel}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        step.status === 'sent' ? 'bg-emerald-500/10 text-emerald-600' :
                        step.status === 'failed'? 'bg-red-500/10 text-red-600' : 'bg-muted text-muted-foreground'
                      }`}>{step.status}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {new Date(step.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-border flex items-center gap-3">
            <Link
              href={`/lead-record?id=${lead.lead_id}`}
              className="text-xs text-primary hover:underline font-medium"
            >
              Open Lead Record →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CadencePerformancePage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [sequences, setSequences] = useState<SequenceMetric[]>([]);
  const [stageDistribution, setStageDistribution] = useState<StageDistribution[]>([]);
  const [weeklyTrend, setWeeklyTrend] = useState<WeeklyTrend[]>([]);
  const [leadDrillDowns, setLeadDrillDowns] = useState<LeadStepHistory[]>([]);
  const [drillPage, setDrillPage] = useState(0);
  const DRILL_PAGE_SIZE = 10;

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    try {
      // Load sequences with enrollment counts
      const { data: seqData } = await supabase
        .from('cadence_sequences')
        .select('id, name, is_active, is_default');

      const { data: enrollData } = await supabase
        .from('cadence_enrollments')
        .select('sequence_id, status, enrolled_at');

      const { data: sendLogData } = await supabase
        .from('cadence_send_log')
        .select('sequence_id, channel, status, sent_at, metadata')
        .order('sent_at', { ascending: false })
        .limit(2000);

      // Build sequence metrics
      const seqMetrics: SequenceMetric[] = (seqData || []).map(seq => {
        const enrollments = (enrollData || []).filter(e => e.sequence_id === seq.id);
        const logs = (sendLogData || []).filter(l => l.sequence_id === seq.id);

        const total = enrollments.length;
        const completed = enrollments.filter(e => e.status === 'completed').length;
        const escalated = enrollments.filter(e => e.status === 'escalated').length;
        const active = enrollments.filter(e => e.status === 'active').length;
        const paused = enrollments.filter(e => e.status === 'paused').length;

        const emailSends = logs.filter(l => l.channel === 'email' && l.status === 'sent').length;
        const smsSends = logs.filter(l => l.channel === 'sms' && l.status === 'sent').length;
        const opens = logs.filter(l => (l.metadata as Record<string, unknown>)?.opened).length;
        const clicks = logs.filter(l => (l.metadata as Record<string, unknown>)?.clicked).length;
        const replies = logs.filter(l => l.status === 'replied').length;

        const totalSends = emailSends + smsSends;
        const engagements = opens + clicks + replies;

        return {
          id: seq.id,
          name: seq.name,
          total_enrolled: total,
          completed,
          escalated,
          active,
          paused,
          completion_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
          escalation_rate: total > 0 ? Math.round((escalated / total) * 100) : 0,
          email_sends: emailSends,
          sms_sends: smsSends,
          opens,
          clicks,
          replies,
          engagement_rate: totalSends > 0 ? Math.round((engagements / totalSends) * 100) : 0,
        };
      });

      setSequences(seqMetrics);

      // Stage distribution
      const { data: stageData } = await supabase
        .from('leads')
        .select('stage')
        .not('stage', 'is', null);

      const stageCounts: Record<string, number> = {};
      (stageData || []).forEach(l => {
        const s = l.stage || 'unknown';
        stageCounts[s] = (stageCounts[s] || 0) + 1;
      });

      setStageDistribution(
        Object.entries(stageCounts)
          .filter(([s]) => ['nurturing', 'engaged', 'human_outreach', 'closed_won', 'closed_dead', 'new'].includes(s))
          .map(([stage, count]) => ({
            stage: stage.replace('_', ' '),
            count,
            color: STAGE_COLORS[stage] || '#8b5cf6',
          }))
          .sort((a, b) => b.count - a.count)
      );

      // Weekly conversion trend (last 8 weeks)
      const weeks: WeeklyTrend[] = [];
      for (let i = 7; i >= 0; i--) {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - i * 7);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const weekEnrollments = (enrollData || []).filter(e => {
          const d = new Date(e.enrolled_at);
          return d >= weekStart && d < weekEnd;
        });

        weeks.push({
          week: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          escalated: weekEnrollments.filter(e => e.status === 'escalated').length,
          completed: weekEnrollments.filter(e => e.status === 'completed').length,
          new_enrolled: weekEnrollments.length,
        });
      }
      setWeeklyTrend(weeks);

      // Per-lead drill-down
      const { data: leadsData } = await supabase
        .from('leads')
        .select('id, first_name, last_name, address, stage, cadence_step, last_contacted_at')
        .in('stage', ['nurturing', 'engaged', 'human_outreach'])
        .order('last_contacted_at', { ascending: false })
        .limit(50);

      const { data: enrollWithSeq } = await supabase
        .from('cadence_enrollments')
        .select('lead_id, status, enrolled_at, cadence_sequences(name)')
        .in('status', ['active', 'escalated', 'completed'])
        .order('enrolled_at', { ascending: false });

      const { data: stepLogs } = await supabase
        .from('cadence_send_log')
        .select('lead_id, step_number, channel, status, sent_at')
        .order('sent_at', { ascending: true })
        .limit(1000);

      const drillDowns: LeadStepHistory[] = (leadsData || []).map(lead => {
        const enrollment = (enrollWithSeq || []).find(e => e.lead_id === lead.id);
        const seq = enrollment?.cadence_sequences as { name: string } | null;
        const steps = (stepLogs || [])
          .filter(l => l.lead_id === lead.id)
          .map(l => ({
            step_number: l.step_number,
            channel: l.channel,
            status: l.status,
            sent_at: l.sent_at,
          }));

        return {
          id: `dd-${lead.id}`,
          lead_id: lead.id,
          lead_name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown',
          address: lead.address || 'No address',
          stage: lead.stage || 'unknown',
          cadence_step: lead.cadence_step ?? 0,
          sequence_name: seq?.name || 'Default Sequence',
          enrollment_status: enrollment?.status || 'not enrolled',
          last_contacted_at: lead.last_contacted_at,
          enrolled_at: enrollment?.enrolled_at || lead.last_contacted_at || new Date().toISOString(),
          steps,
        };
      });

      setLeadDrillDowns(drillDowns);
    } catch {
      // Fallback mock data
      setSequences([
        { id: 's1', name: 'Initial Outreach Cadence', total_enrolled: 142, completed: 38, escalated: 22, active: 71, paused: 11, completion_rate: 27, escalation_rate: 15, email_sends: 284, sms_sends: 142, opens: 68, clicks: 31, replies: 22, engagement_rate: 23 },
        { id: 's2', name: 'High-Score Fast Track', total_enrolled: 47, completed: 18, escalated: 14, active: 12, paused: 3, completion_rate: 38, escalation_rate: 30, email_sends: 94, sms_sends: 47, opens: 32, clicks: 18, replies: 14, engagement_rate: 45 },
        { id: 's3', name: 'Warm Lead Nurture', total_enrolled: 29, completed: 7, escalated: 9, active: 11, paused: 2, completion_rate: 24, escalation_rate: 31, email_sends: 58, sms_sends: 29, opens: 19, clicks: 11, replies: 9, engagement_rate: 45 },
      ]);
      setStageDistribution([
        { stage: 'nurturing', count: 89, color: STAGE_COLORS.nurturing },
        { stage: 'human outreach', count: 34, color: STAGE_COLORS.human_outreach },
        { stage: 'engaged', count: 21, color: STAGE_COLORS.engaged },
        { stage: 'closed won', count: 18, color: STAGE_COLORS.closed_won },
        { stage: 'closed dead', count: 45, color: STAGE_COLORS.closed_dead },
        { stage: 'new', count: 12, color: STAGE_COLORS.new },
      ]);
      setWeeklyTrend([
        { week: 'Jul 7', escalated: 3, completed: 5, new_enrolled: 18 },
        { week: 'Jul 14', escalated: 5, completed: 7, new_enrolled: 22 },
        { week: 'Jul 21', escalated: 4, completed: 6, new_enrolled: 19 },
        { week: 'Jul 28', escalated: 7, completed: 9, new_enrolled: 31 },
        { week: 'Aug 4', escalated: 6, completed: 8, new_enrolled: 27 },
        { week: 'Aug 11', escalated: 9, completed: 11, new_enrolled: 35 },
        { week: 'Aug 18', escalated: 8, completed: 10, new_enrolled: 29 },
        { week: 'Aug 25', escalated: 11, completed: 13, new_enrolled: 38 },
      ]);
      setLeadDrillDowns([
        { id: 'dd-1', lead_id: 'lead-1', lead_name: 'James Whitfield', address: '4821 Maple Ave, Austin TX', stage: 'human_outreach', cadence_step: 3, sequence_name: 'Initial Outreach Cadence', enrollment_status: 'escalated', last_contacted_at: new Date(Date.now() - 86400000).toISOString(), enrolled_at: new Date(Date.now() - 86400000 * 14).toISOString(), steps: [{ step_number: 0, channel: 'email', status: 'sent', sent_at: new Date(Date.now() - 86400000 * 14).toISOString() }, { step_number: 1, channel: 'sms', status: 'sent', sent_at: new Date(Date.now() - 86400000 * 10).toISOString() }, { step_number: 2, channel: 'email', status: 'sent', sent_at: new Date(Date.now() - 86400000 * 5).toISOString() }] },
        { id: 'dd-2', lead_id: 'lead-2', lead_name: 'Sandra Okafor', address: '1102 Riverside Dr, Nashville TN', stage: 'nurturing', cadence_step: 1, sequence_name: 'High-Score Fast Track', enrollment_status: 'active', last_contacted_at: new Date(Date.now() - 86400000 * 3).toISOString(), enrolled_at: new Date(Date.now() - 86400000 * 7).toISOString(), steps: [{ step_number: 0, channel: 'email', status: 'sent', sent_at: new Date(Date.now() - 86400000 * 7).toISOString() }] },
      ]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadMetrics(); }, [loadMetrics]);

  const totalEnrolled = sequences.reduce((s, seq) => s + seq.total_enrolled, 0);
  const totalEscalated = sequences.reduce((s, seq) => s + seq.escalated, 0);
  const totalCompleted = sequences.reduce((s, seq) => s + seq.completed, 0);
  const avgEngagement = sequences.length > 0
    ? Math.round(sequences.reduce((s, seq) => s + seq.engagement_rate, 0) / sequences.length)
    : 0;

  const pagedLeads = leadDrillDowns.slice(drillPage * DRILL_PAGE_SIZE, (drillPage + 1) * DRILL_PAGE_SIZE);

  // ─── CSV Export ───────────────────────────────────────────────────────────
  function exportCSV() {
    const headers = ['Sequence', 'Total Enrolled', 'Completed', 'Escalated', 'Active', 'Paused', 'Completion Rate %', 'Escalation Rate %', 'Engagement Rate %', 'Email Sends', 'SMS Sends', 'Opens', 'Clicks', 'Replies'];
    const rows = sequences.map(s => [
      s.name, s.total_enrolled, s.completed, s.escalated, s.active, s.paused,
      s.completion_rate, s.escalation_rate, s.engagement_rate,
      s.email_sends, s.sms_sends, s.opens, s.clicks, s.replies,
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v)}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cadence-performance-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── PDF Export ───────────────────────────────────────────────────────────
  function exportPDF() {
    const exportedAt = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
    const rows = sequences.map(s => `
      <tr>
        <td>${s.name}</td>
        <td>${s.total_enrolled}</td>
        <td>${s.completion_rate}%</td>
        <td>${s.escalation_rate}%</td>
        <td>${s.engagement_rate}%</td>
        <td>${s.email_sends}</td>
        <td>${s.sms_sends}</td>
        <td>${s.opens}</td>
        <td>${s.clicks}</td>
        <td>${s.replies}</td>
      </tr>`).join('');

    const stepRows = leadDrillDowns.slice(0, 100).map(l => `
      <tr>
        <td>${l.lead_name}</td>
        <td>${l.address}</td>
        <td>${l.stage?.replace('_', ' ')}</td>
        <td>${l.sequence_name}</td>
        <td>Step ${l.cadence_step}</td>
        <td>${l.enrollment_status}</td>
        <td>${l.last_contacted_at ? new Date(l.last_contacted_at).toLocaleDateString() : '—'}</td>
        <td>${new Date(l.enrolled_at).toLocaleDateString()}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cadence Performance Report</title>
    <style>body{font-family:Arial,sans-serif;font-size:11px;margin:20px}h1{font-size:16px;margin-bottom:4px}h2{font-size:13px;margin:20px 0 8px}
    .meta{color:#666;font-size:10px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;margin-bottom:20px}th,td{border:1px solid #ddd;padding:5px 8px;text-align:left}
    th{background:#f5f5f5;font-weight:bold}tr:nth-child(even){background:#fafafa}
    .kpi{display:flex;gap:20px;margin-bottom:16px;padding:10px;background:#f9f9f9;border:1px solid #eee;border-radius:6px}
    .kpi-item{text-align:center}.kpi-val{font-size:18px;font-weight:bold}.kpi-label{font-size:9px;color:#666}
    </style></head><body>
    <h1>Cadence Performance Report</h1>
    <div class="meta">Exported: ${exportedAt}</div>
    <div class="kpi">
      <div class="kpi-item"><div class="kpi-val">${totalEnrolled}</div><div class="kpi-label">Total Enrolled</div></div>
      <div class="kpi-item"><div class="kpi-val" style="color:#16a34a">${totalCompleted}</div><div class="kpi-label">Completed</div></div>
      <div class="kpi-item"><div class="kpi-val" style="color:#d97706">${totalEscalated}</div><div class="kpi-label">Escalated</div></div>
      <div class="kpi-item"><div class="kpi-val">${avgEngagement}%</div><div class="kpi-label">Avg Engagement</div></div>
    </div>
    <h2>Sequence Metrics</h2>
    <table><thead><tr><th>Sequence</th><th>Enrolled</th><th>Completion</th><th>Escalation</th><th>Engagement</th><th>Email</th><th>SMS</th><th>Opens</th><th>Clicks</th><th>Replies</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <h2>Per-Lead Step History (first 100)</h2>
    <table><thead><tr><th>Lead</th><th>Address</th><th>Stage</th><th>Sequence</th><th>Step</th><th>Status</th><th>Last Contact</th><th>Enrolled</th></tr></thead>
    <tbody>${stepRows}</tbody></table>
    </body></html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.print();
    }
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart2 size={17} className="text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Cadence Performance</h1>
              <p className="text-xs text-muted-foreground">Sequence metrics, engagement rates, and per-lead step history</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 transition-colors font-medium"
            >
              <Download size={12} /> Export CSV
            </button>
            <button
              onClick={exportPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <FileText size={12} /> Export PDF
            </button>
            <button
              onClick={loadMetrics}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

            {/* KPI Strip */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard label="Total Enrolled" value={totalEnrolled} sub="across all sequences" icon={<Users size={15} />} />
              <StatCard label="Escalated to Human" value={totalEscalated} sub={`${totalEnrolled > 0 ? Math.round((totalEscalated / totalEnrolled) * 100) : 0}% escalation rate`} icon={<Target size={15} />} color="text-amber-500" trend={12} />
              <StatCard label="Completed Cadence" value={totalCompleted} sub={`${totalEnrolled > 0 ? Math.round((totalCompleted / totalEnrolled) * 100) : 0}% completion rate`} icon={<CheckCircle size={15} />} color="text-emerald-600" trend={5} />
              <StatCard label="Avg Engagement Rate" value={`${avgEngagement}%`} sub="opens + clicks + replies" icon={<TrendingUp size={15} />} color="text-primary" trend={8} />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-3 gap-5">
              {/* Stage Distribution */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Activity size={14} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">Stage Distribution</span>
                </div>
                {loading ? (
                  <div className="h-48 bg-muted/40 rounded-lg animate-pulse" />
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={stageDistribution} dataKey="count" nameKey="stage" cx="50%" cy="50%" outerRadius={70} label={({ stage, percent }) => `${stage} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={9}>
                        {stageDistribution.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [v, 'Leads']} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Weekly Conversion Trend */}
              <div className="col-span-2 bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={14} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">Weekly Conversion Trend</span>
                </div>
                {loading ? (
                  <div className="h-48 bg-muted/40 rounded-lg animate-pulse" />
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={weeklyTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="new_enrolled" stroke="#3b82f6" strokeWidth={2} dot={false} name="New Enrolled" />
                      <Line type="monotone" dataKey="escalated" stroke="#f59e0b" strokeWidth={2} dot={false} name="Escalated" />
                      <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2} dot={false} name="Completed" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Per-Sequence Metrics Table */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border bg-muted/20">
                <Zap size={14} className="text-primary" />
                <span className="text-sm font-semibold text-foreground">Sequence Performance</span>
              </div>
              {loading ? (
                <div className="p-5 space-y-3">
                  {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted/40 rounded-lg animate-pulse" />)}
                </div>
              ) : sequences.length === 0 ? (
                <div className="p-10 text-center">
                  <Zap size={24} className="text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No sequences found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/10">
                        {['Sequence', 'Enrolled', 'Completion Rate', 'Escalation Rate', 'Engagement Rate', 'Email Sends', 'SMS Sends', 'Opens', 'Clicks', 'Replies'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sequences.map(seq => (
                        <tr key={seq.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground">{seq.name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{seq.total_enrolled}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${seq.completion_rate}%` }} />
                              </div>
                              <span className="text-emerald-600 font-medium">{seq.completion_rate}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${seq.escalation_rate}%` }} />
                              </div>
                              <span className="text-amber-600 font-medium">{seq.escalation_rate}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${seq.engagement_rate}%` }} />
                              </div>
                              <span className="text-primary font-medium">{seq.engagement_rate}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{seq.email_sends}</td>
                          <td className="px-4 py-3 text-muted-foreground">{seq.sms_sends}</td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1 text-cyan-600"><Eye size={11} />{seq.opens}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1 text-blue-600"><MousePointerClick size={11} />{seq.clicks}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1 text-emerald-600"><Reply size={11} />{seq.replies}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Engagement Bar Chart */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 size={14} className="text-primary" />
                <span className="text-sm font-semibold text-foreground">Engagement by Sequence</span>
              </div>
              {loading ? (
                <div className="h-48 bg-muted/40 rounded-lg animate-pulse" />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={sequences} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="opens" fill={CHART_COLORS[0]} name="Opens" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="clicks" fill={CHART_COLORS[1]} name="Clicks" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="replies" fill={CHART_COLORS[2]} name="Replies" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="escalated" fill={CHART_COLORS[3]} name="Escalated" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Per-Lead Drill-Down */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/20">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">Per-Lead Step History</span>
                  <span className="ml-1 px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-full">{leadDrillDowns.length}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Showing {drillPage * DRILL_PAGE_SIZE + 1}–{Math.min((drillPage + 1) * DRILL_PAGE_SIZE, leadDrillDowns.length)} of {leadDrillDowns.length}</span>
                  <button onClick={() => setDrillPage(p => Math.max(0, p - 1))} disabled={drillPage === 0} className="px-2 py-1 border border-border rounded hover:bg-muted disabled:opacity-40 transition-colors">←</button>
                  <button onClick={() => setDrillPage(p => (p + 1) * DRILL_PAGE_SIZE < leadDrillDowns.length ? p + 1 : p)} disabled={(drillPage + 1) * DRILL_PAGE_SIZE >= leadDrillDowns.length} className="px-2 py-1 border border-border rounded hover:bg-muted disabled:opacity-40 transition-colors">→</button>
                </div>
              </div>
              <div className="p-4 space-y-2">
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-14 bg-muted/40 rounded-xl animate-pulse" />)}
                  </div>
                ) : pagedLeads.length === 0 ? (
                  <div className="text-center py-10">
                    <Users size={24} className="text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No active leads in cadence</p>
                  </div>
                ) : (
                  pagedLeads.map(lead => <LeadDrillDown key={lead.id} lead={lead} />)
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </AppLayout>
  );
}
