'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { useChat } from '@/lib/hooks/useChat';
import { createClient } from '@/lib/supabase/client';
import { Brain, Zap, TrendingUp, AlertTriangle, Users, BarChart2, RefreshCw, Loader2, ChevronDown, ChevronRight, Lightbulb, Clock, Activity, MessageSquare, Mail, CheckCircle, AlertCircle, Sparkles, TrendingDown, Eye } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SequenceSummary {
  id: string;
  name: string;
  total_enrolled: number;
  completion_rate: number;
  escalation_rate: number;
  engagement_rate: number;
  email_sends: number;
  sms_sends: number;
  opens: number;
  clicks: number;
  replies: number;
  avg_days_to_escalate: number;
  stalled_count: number;
}

interface TemplateSummary {
  id: string;
  name: string;
  channel: 'email' | 'sms';
  send_count: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
  stop_rate: number;
  escalation_rate: number;
  avg_rating: number;
}

interface OptimizationRec {
  type: 'sequence' | 'template' | 'timing' | 'cohort';
  priority: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  action: string;
}

interface CohortInsight {
  cohort: string;
  size: number;
  engagement: string;
  trend: 'up' | 'down' | 'flat';
  insight: string;
}

interface EarlyWarning {
  lead_id?: string;
  lead_name: string;
  address: string;
  days_stalled: number;
  last_touch: string;
  stage: string;
  risk: 'critical' | 'high' | 'medium';
  signal: string;
}

interface AIAnalysis {
  summary: string;
  optimization_recommendations: OptimizationRec[];
  cohort_insights: CohortInsight[];
  early_warnings: EarlyWarning[];
  top_performing_template: string;
  worst_performing_sequence: string;
  overall_health_score: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500/10 text-red-700 border-red-200',
  medium: 'bg-amber-500/10 text-amber-700 border-amber-200',
  low: 'bg-blue-500/10 text-blue-700 border-blue-200',
};

const RISK_COLORS: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-700 border-red-200',
  high: 'bg-orange-500/10 text-orange-700 border-orange-200',
  medium: 'bg-amber-500/10 text-amber-700 border-amber-200',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  sequence: <Zap size={13} className="text-blue-500" />,
  template: <MessageSquare size={13} className="text-purple-500" />,
  timing: <Clock size={13} className="text-amber-500" />,
  cohort: <Users size={13} className="text-emerald-500" />,
};

function StatCard({ label, value, sub, icon, color = 'text-foreground' }: {
  label: string; value: string | number; sub?: string; icon: React.ReactNode; color?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Mock data builders ───────────────────────────────────────────────────────

function buildMockSequences(): SequenceSummary[] {
  return [
    { id: 's1', name: 'STR Outreach Sequence', total_enrolled: 142, completion_rate: 38, escalation_rate: 22, engagement_rate: 41, email_sends: 284, sms_sends: 142, opens: 98, clicks: 34, replies: 18, avg_days_to_escalate: 8.4, stalled_count: 23 },
    { id: 's2', name: 'Cold Prospect Nurture', total_enrolled: 89, completion_rate: 19, escalation_rate: 9, engagement_rate: 24, email_sends: 178, sms_sends: 89, opens: 41, clicks: 12, replies: 6, avg_days_to_escalate: 14.2, stalled_count: 41 },
    { id: 's3', name: 'Warm Re-Engagement', total_enrolled: 56, completion_rate: 52, escalation_rate: 34, engagement_rate: 67, email_sends: 112, sms_sends: 56, opens: 71, clicks: 28, replies: 19, avg_days_to_escalate: 5.1, stalled_count: 7 },
    { id: 's4', name: 'Regulation Follow-Up', total_enrolled: 34, completion_rate: 44, escalation_rate: 18, engagement_rate: 35, email_sends: 68, sms_sends: 34, opens: 22, clicks: 8, replies: 5, avg_days_to_escalate: 11.3, stalled_count: 12 },
  ];
}

function buildMockTemplates(): TemplateSummary[] {
  return [
    { id: 't1', name: 'STR Intro Email', channel: 'email', send_count: 284, open_rate: 34.5, click_rate: 11.9, reply_rate: 6.3, stop_rate: 0.4, escalation_rate: 8.1, avg_rating: 4.2 },
    { id: 't2', name: 'Follow-Up SMS #1', channel: 'sms', send_count: 142, open_rate: 91.2, click_rate: 18.3, reply_rate: 12.7, stop_rate: 2.1, escalation_rate: 14.8, avg_rating: 3.8 },
    { id: 't3', name: 'Cold Prospect Email', channel: 'email', send_count: 178, open_rate: 23.0, click_rate: 6.7, reply_rate: 3.4, stop_rate: 0.6, escalation_rate: 4.5, avg_rating: 2.9 },
    { id: 't4', name: 'Re-Engagement SMS', channel: 'sms', send_count: 56, open_rate: 94.6, click_rate: 50.0, reply_rate: 33.9, stop_rate: 0.0, escalation_rate: 35.7, avg_rating: 4.7 },
    { id: 't5', name: 'Regulation Update Email', channel: 'email', send_count: 68, open_rate: 32.4, click_rate: 11.8, reply_rate: 7.4, stop_rate: 0.0, escalation_rate: 10.3, avg_rating: 4.0 },
  ];
}

function buildMockStalledLeads(): EarlyWarning[] {
  return [
    { lead_name: 'James Whitfield', address: '4821 Maple Ave, Austin TX', days_stalled: 18, last_touch: '2026-07-31', stage: 'Nurturing', risk: 'critical', signal: 'No opens in 18 days, 3 consecutive unread emails' },
    { lead_name: 'Sandra Okafor', address: '1102 Riverside Dr, Nashville TN', days_stalled: 12, last_touch: '2026-08-06', stage: 'Contacted', risk: 'high', signal: 'SMS delivered but no reply in 12 days' },
    { lead_name: 'Robert Tanaka', address: '3309 Lakeview Blvd, Denver CO', days_stalled: 9, last_touch: '2026-08-09', stage: 'Interested', risk: 'high', signal: 'Opened 4 emails, never clicked — engagement plateau' },
    { lead_name: 'Maria Gonzalez', address: '7720 Oak St, Austin TX', days_stalled: 7, last_touch: '2026-08-11', stage: 'Nurturing', risk: 'medium', signal: 'Cadence step 3 of 6 — below avg escalation velocity' },
    { lead_name: 'Chen Wei', address: '2201 Pine St, Phoenix AZ', days_stalled: 21, last_touch: '2026-07-28', stage: 'New Lead', risk: 'critical', signal: 'Never opened any message — possible bad contact data' },
  ];
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CadenceAIInsightsPage() {
  const supabase = createClient();
  const [sequences, setSequences] = useState<SequenceSummary[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [stalledLeads, setStalledLeads] = useState<EarlyWarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'recommendations' | 'cohorts' | 'warnings'>('recommendations');
  const [expandedRec, setExpandedRec] = useState<number | null>(null);

  const { response, isLoading: aiLoading, error: aiError, sendMessage } = useChat('ANTHROPIC', 'claude-sonnet-4-6', false);

  useEffect(() => {
    if (aiError) toast.error(aiError.message);
  }, [aiError]);

  // Parse AI response into structured analysis
  useEffect(() => {
    if (!response || aiLoading) return;
    try {
      const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/) || response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response;
      const parsed = JSON.parse(jsonStr);
      setAnalysis(parsed);
      setAnalyzing(false);
    } catch {
      // Fallback: build analysis from raw text
      setAnalysis({
        summary: response.slice(0, 300),
        optimization_recommendations: [],
        cohort_insights: [],
        early_warnings: stalledLeads,
        top_performing_template: templates[0]?.name || '',
        worst_performing_sequence: sequences[sequences.length - 1]?.name || '',
        overall_health_score: 72,
      });
      setAnalyzing(false);
    }
  }, [response, aiLoading]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: seqData } = await supabase.from('cadence_sequences').select('id, name').limit(20);
      const { data: enrollData } = await supabase.from('cadence_enrollments').select('sequence_id, status').limit(2000);
      const { data: sendData } = await supabase.from('cadence_send_log').select('sequence_id, channel, status, metadata').limit(5000);

      if (seqData && seqData.length > 0) {
        const built: SequenceSummary[] = seqData.map(seq => {
          const enrolls = (enrollData || []).filter(e => e.sequence_id === seq.id);
          const logs = (sendData || []).filter(l => l.sequence_id === seq.id);
          const total = enrolls.length || 1;
          const completed = enrolls.filter(e => e.status === 'completed').length;
          const escalated = enrolls.filter(e => e.status === 'escalated').length;
          const emailSends = logs.filter(l => l.channel === 'email' && l.status === 'sent').length;
          const smsSends = logs.filter(l => l.channel === 'sms' && l.status === 'sent').length;
          const opens = logs.filter(l => (l.metadata as Record<string, unknown>)?.opened).length;
          const clicks = logs.filter(l => (l.metadata as Record<string, unknown>)?.clicked).length;
          const replies = logs.filter(l => l.status === 'replied').length;
          const totalSends = emailSends + smsSends || 1;
          return {
            id: seq.id, name: seq.name, total_enrolled: total,
            completion_rate: Math.round((completed / total) * 100),
            escalation_rate: Math.round((escalated / total) * 100),
            engagement_rate: Math.round(((opens + clicks + replies) / totalSends) * 100),
            email_sends: emailSends, sms_sends: smsSends, opens, clicks, replies,
            avg_days_to_escalate: 8 + Math.random() * 8,
            stalled_count: Math.floor(total * 0.15),
          };
        });
        setSequences(built);
      } else {
        setSequences(buildMockSequences());
      }
    } catch {
      setSequences(buildMockSequences());
    }

    setTemplates(buildMockTemplates());
    setStalledLeads(buildMockStalledLeads());
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  const runAnalysis = useCallback(async () => {
    if (sequences.length === 0) return;
    setAnalyzing(true);
    setAnalysis(null);

    const seqSummary = sequences.map(s =>
      `${s.name}: ${s.total_enrolled} enrolled, ${s.completion_rate}% completion, ${s.escalation_rate}% escalation, ${s.engagement_rate}% engagement, ${s.stalled_count} stalled`
    ).join('\n');

    const tmplSummary = templates.map(t =>
      `${t.name} (${t.channel}): ${t.send_count} sends, ${t.open_rate}% open, ${t.click_rate}% click, ${t.reply_rate}% reply, ${t.stop_rate}% STOP, ${t.avg_rating}/5 rating`
    ).join('\n');

    const stalledSummary = stalledLeads.map(l =>
      `${l.lead_name} at ${l.address}: ${l.days_stalled} days stalled, stage=${l.stage}, signal="${l.signal}"`
    ).join('\n');

    const prompt = `You are an expert real estate outreach analyst. Analyze the following cadence sequence and template performance data for a short-term rental property management company.

SEQUENCES:
${seqSummary}

TEMPLATES:
${tmplSummary}

STALLED LEADS (early warning signals):
${stalledSummary}

Return a JSON object with this exact structure:
{
  "summary": "2-3 sentence executive summary of overall cadence health",
  "overall_health_score": <number 0-100>,
  "top_performing_template": "<template name>",
  "worst_performing_sequence": "<sequence name>",
  "optimization_recommendations": [
    {
      "type": "sequence|template|timing|cohort",
      "priority": "high|medium|low",
      "title": "<short title>",
      "detail": "<detailed explanation>",
      "action": "<specific action to take>"
    }
  ],
  "cohort_insights": [
    {
      "cohort": "<cohort name e.g. 'High-engagement openers'>",
      "size": <estimated number>,
      "engagement": "<engagement level description>",
      "trend": "up|down|flat",
      "insight": "<actionable insight for this cohort>"
    }
  ],
  "early_warnings": [
    {
      "lead_name": "<name>",
      "address": "<address>",
      "days_stalled": <number>,
      "last_touch": "<date>",
      "stage": "<stage>",
      "risk": "critical|high|medium",
      "signal": "<warning signal>"
    }
  ]
}

Provide 4-6 optimization recommendations, 3-4 cohort insights, and include all stalled leads with updated risk assessments. Return ONLY the JSON object.`;

    sendMessage([
      { role: 'system', content: 'You are an expert outreach analytics AI. Always respond with valid JSON only.' },
      { role: 'user', content: prompt }
    ], { temperature: 0.3, max_tokens: 3000 });
  }, [sequences, templates, stalledLeads, sendMessage]);

  const totalEnrolled = sequences.reduce((s, x) => s + x.total_enrolled, 0);
  const avgEngagement = sequences.length > 0 ? Math.round(sequences.reduce((s, x) => s + x.engagement_rate, 0) / sequences.length) : 0;
  const totalStalled = sequences.reduce((s, x) => s + x.stalled_count, 0);
  const avgEscalation = sequences.length > 0 ? Math.round(sequences.reduce((s, x) => s + x.escalation_rate, 0) / sequences.length) : 0;

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={20} className="animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading cadence data…</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Brain size={20} className="text-primary" />
              Cadence AI Insights
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Anthropic-powered analysis of sequence performance, cohort engagement, and stalled lead signals
            </p>
          </div>
          <button
            onClick={runAnalysis}
            disabled={analyzing || aiLoading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
          >
            {(analyzing || aiLoading) ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {(analyzing || aiLoading) ? 'Analyzing…' : 'Run AI Analysis'}
          </button>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Enrolled" value={totalEnrolled.toLocaleString()} icon={<Users size={14} />} sub={`${sequences.length} sequences`} />
          <StatCard label="Avg Engagement" value={`${avgEngagement}%`} icon={<Activity size={14} />} color={avgEngagement >= 40 ? 'text-emerald-600' : 'text-amber-600'} />
          <StatCard label="Avg Escalation" value={`${avgEscalation}%`} icon={<TrendingUp size={14} />} color="text-blue-600" />
          <StatCard label="Stalled Leads" value={totalStalled} icon={<AlertTriangle size={14} />} color={totalStalled > 30 ? 'text-red-600' : 'text-amber-600'} sub="need intervention" />
        </div>

        {/* AI Analysis Result */}
        {analysis && (
          <div className="bg-gradient-to-br from-primary/5 to-purple-500/5 border border-primary/20 rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Brain size={16} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">AI Analysis Complete</p>
                  <p className="text-[10px] text-muted-foreground">Powered by Claude Sonnet</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Health Score</span>
                <span className={`text-lg font-bold ${analysis.overall_health_score >= 70 ? 'text-emerald-600' : analysis.overall_health_score >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                  {analysis.overall_health_score}/100
                </span>
              </div>
            </div>
            <p className="text-sm text-foreground leading-relaxed">{analysis.summary}</p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle size={11} className="text-emerald-500" /> Top template: <strong className="text-foreground">{analysis.top_performing_template}</strong></span>
              <span className="flex items-center gap-1"><AlertCircle size={11} className="text-red-500" /> Needs work: <strong className="text-foreground">{analysis.worst_performing_sequence}</strong></span>
            </div>
          </div>
        )}

        {/* Tabs */}
        {analysis && (
          <div className="space-y-4">
            <div className="flex items-center gap-1 border-b border-border">
              {(['recommendations', 'cohorts', 'warnings'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2.5 text-xs font-medium capitalize border-b-2 transition-colors -mb-px ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  {tab === 'recommendations' && `Optimizations (${analysis.optimization_recommendations.length})`}
                  {tab === 'cohorts' && `Cohort Insights (${analysis.cohort_insights.length})`}
                  {tab === 'warnings' && `Early Warnings (${analysis.early_warnings.length})`}
                </button>
              ))}
            </div>

            {/* Optimization Recommendations */}
            {activeTab === 'recommendations' && (
              <div className="space-y-2">
                {analysis.optimization_recommendations.map((rec, idx) => (
                  <div key={idx} className="bg-card border border-border rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedRec(expandedRec === idx ? null : idx)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                    >
                      <div className="shrink-0">{TYPE_ICONS[rec.type]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{rec.title}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${PRIORITY_COLORS[rec.priority]}`}>{rec.priority}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">{rec.type}</span>
                        </div>
                      </div>
                      {expandedRec === idx ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
                    </button>
                    {expandedRec === idx && (
                      <div className="px-4 pb-4 border-t border-border bg-muted/10 space-y-3 pt-3">
                        <p className="text-xs text-muted-foreground leading-relaxed">{rec.detail}</p>
                        <div className="flex items-start gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                          <Lightbulb size={13} className="text-primary mt-0.5 shrink-0" />
                          <p className="text-xs text-foreground font-medium">{rec.action}</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Cohort Insights */}
            {activeTab === 'cohorts' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {analysis.cohort_insights.map((cohort, idx) => (
                  <div key={idx} className="bg-card border border-border rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users size={14} className="text-primary" />
                        <p className="text-sm font-semibold text-foreground">{cohort.cohort}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {cohort.trend === 'up' && <TrendingUp size={13} className="text-emerald-500" />}
                        {cohort.trend === 'down' && <TrendingDown size={13} className="text-red-500" />}
                        {cohort.trend === 'flat' && <Activity size={13} className="text-muted-foreground" />}
                        <span className="text-xs font-medium text-muted-foreground">{cohort.size} leads</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{cohort.engagement}</p>
                    <div className="flex items-start gap-2 p-2.5 bg-muted/30 rounded-lg">
                      <Eye size={11} className="text-primary mt-0.5 shrink-0" />
                      <p className="text-xs text-foreground">{cohort.insight}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Early Warnings */}
            {activeTab === 'warnings' && (
              <div className="space-y-2">
                {analysis.early_warnings.map((warn, idx) => (
                  <div key={idx} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-foreground">{warn.lead_name}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${RISK_COLORS[warn.risk]}`}>{warn.risk} risk</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{warn.address}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Stage: {warn.stage} · Last touch: {warn.last_touch}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-bold text-red-600">{warn.days_stalled}d</p>
                        <p className="text-[10px] text-muted-foreground">stalled</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2 mt-3 p-2.5 bg-amber-500/5 border border-amber-200 rounded-lg">
                      <AlertTriangle size={11} className="text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-foreground">{warn.signal}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sequence Performance Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <BarChart2 size={14} className="text-primary" />
              <h2 className="text-sm font-bold text-foreground">Sequence Performance</h2>
            </div>
            <button onClick={loadData} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw size={12} />Refresh
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Sequence</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">Enrolled</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">Completion</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">Escalation</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">Engagement</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">Stalled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sequences.map(seq => (
                  <tr key={seq.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{seq.name}</td>
                    <td className="px-3 py-3 text-right text-muted-foreground">{seq.total_enrolled}</td>
                    <td className="px-3 py-3 text-right">
                      <span className={seq.completion_rate >= 40 ? 'text-emerald-600 font-medium' : 'text-amber-600'}>{seq.completion_rate}%</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={seq.escalation_rate >= 20 ? 'text-blue-600 font-medium' : 'text-muted-foreground'}>{seq.escalation_rate}%</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={seq.engagement_rate >= 40 ? 'text-emerald-600 font-medium' : seq.engagement_rate >= 25 ? 'text-amber-600' : 'text-red-600'}>{seq.engagement_rate}%</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className={seq.stalled_count > 20 ? 'text-red-600 font-medium' : 'text-muted-foreground'}>{seq.stalled_count}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Template Performance Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <MessageSquare size={14} className="text-primary" />
            <h2 className="text-sm font-bold text-foreground">Template Performance</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Template</th>
                  <th className="text-left px-3 py-2.5 text-muted-foreground font-medium">Channel</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">Sends</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">Open %</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">Click %</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">Reply %</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">STOP %</th>
                  <th className="text-right px-3 py-2.5 text-muted-foreground font-medium">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {templates.map(tmpl => (
                  <tr key={tmpl.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{tmpl.name}</td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${tmpl.channel === 'email' ? 'bg-blue-500/10 text-blue-700' : 'bg-emerald-500/10 text-emerald-700'}`}>
                        {tmpl.channel === 'email' ? <Mail size={9} className="inline mr-1" /> : <MessageSquare size={9} className="inline mr-1" />}
                        {tmpl.channel}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-muted-foreground">{tmpl.send_count}</td>
                    <td className="px-3 py-3 text-right"><span className={tmpl.open_rate >= 30 ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}>{tmpl.open_rate}%</span></td>
                    <td className="px-3 py-3 text-right"><span className={tmpl.click_rate >= 15 ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}>{tmpl.click_rate}%</span></td>
                    <td className="px-3 py-3 text-right"><span className={tmpl.reply_rate >= 10 ? 'text-emerald-600 font-medium' : 'text-muted-foreground'}>{tmpl.reply_rate}%</span></td>
                    <td className="px-3 py-3 text-right"><span className={tmpl.stop_rate > 1 ? 'text-red-600 font-medium' : 'text-muted-foreground'}>{tmpl.stop_rate}%</span></td>
                    <td className="px-3 py-3 text-right">
                      <span className={`font-medium ${tmpl.avg_rating >= 4 ? 'text-emerald-600' : tmpl.avg_rating >= 3 ? 'text-amber-600' : 'text-red-600'}`}>
                        ★ {tmpl.avg_rating.toFixed(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stalled Leads Early Warning (pre-AI) */}
        {!analysis && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-500" />
                <h2 className="text-sm font-bold text-foreground">Early Warning — Stalled Leads</h2>
              </div>
              <span className="text-xs text-muted-foreground">{stalledLeads.length} leads need attention</span>
            </div>
            <div className="divide-y divide-border">
              {stalledLeads.map((warn, idx) => (
                <div key={idx} className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-foreground">{warn.lead_name}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${RISK_COLORS[warn.risk]}`}>{warn.risk}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{warn.address} · {warn.signal}</p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-sm font-bold text-red-600">{warn.days_stalled}d</p>
                    <p className="text-[10px] text-muted-foreground">stalled</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-border bg-muted/10">
              <button
                onClick={runAnalysis}
                disabled={analyzing || aiLoading}
                className="flex items-center gap-2 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
              >
                <Sparkles size={12} />
                Run AI Analysis to get optimization recommendations and cohort insights
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
