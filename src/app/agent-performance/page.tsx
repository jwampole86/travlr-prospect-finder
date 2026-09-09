'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, TrendingUp, Clock, BarChart2, RefreshCw, ArrowUp, ArrowDown, Minus, ChevronDown, ChevronUp, Loader2, Phone, PlayCircle, FileText, CheckCircle, XCircle, AlertCircle, ChevronLeft, ChevronRight, ThumbsUp, ThumbsDown, Star } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';


// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentPerf {
  id: string;
  name: string;
  email: string;
  sentCount: number;
  replyRate: number;
  bounceRate: number;
  avgResponseTimeHours: number;
  topTemplate: string;
  pipelineStages: Record<string, number>;
  trend7d: TrendPoint[];
  trend30d: TrendPoint[];
}

interface TrendPoint {
  date: string;
  sent: number;
  replies: number;
}

interface TemplatePerf {
  name: string;
  sends: number;
  replyRate: number;
}

interface CallRecording {
  id: string;
  lead_id: string;
  lead_name: string;
  started_at: string;
  duration_seconds: number | null;
  recording_url: string | null;
  transcript: string | null;
  script_compliance_score: number | null;
  outcome: string | null;
  cadence_template_id?: string | null;
  cadence_template_name?: string | null;
}

interface TranscriptPage {
  page: number;
  lines: string[];
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const PIPELINE_STAGES = ['New Lead', 'Contacted', 'Interested', 'Proposal Sent', 'Under Contract', 'Live'];
const TRANSCRIPT_PAGE_SIZE = 8; // lines per page

function makeTrend(days: number): TrendPoint[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      sent: Math.floor(Math.random() * 15) + 2,
      replies: Math.floor(Math.random() * 4),
    };
  });
}

const MOCK_AGENTS: AgentPerf[] = [
  {
    id: 'agent-1', name: 'Sarah Mitchell', email: 'sarah@travlr.com',
    sentCount: 284, replyRate: 18, bounceRate: 3, avgResponseTimeHours: 14,
    topTemplate: 'Check-In — Luxury Markets',
    pipelineStages: { 'New Lead': 42, 'Contacted': 31, 'Interested': 18, 'Proposal Sent': 9, 'Under Contract': 4, 'Live': 2 },
    trend7d: makeTrend(7), trend30d: makeTrend(30),
  },
  {
    id: 'agent-2', name: 'James Torres', email: 'james@travlr.com',
    sentCount: 197, replyRate: 12, bounceRate: 6, avgResponseTimeHours: 22,
    topTemplate: 'Initial Outreach — Denver',
    pipelineStages: { 'New Lead': 55, 'Contacted': 28, 'Interested': 10, 'Proposal Sent': 5, 'Under Contract': 2, 'Live': 1 },
    trend7d: makeTrend(7), trend30d: makeTrend(30),
  },
  {
    id: 'agent-3', name: 'Priya Nair', email: 'priya@travlr.com',
    sentCount: 341, replyRate: 21, bounceRate: 2, avgResponseTimeHours: 9,
    topTemplate: 'Revenue Estimate Offer',
    pipelineStages: { 'New Lead': 38, 'Contacted': 44, 'Interested': 26, 'Proposal Sent': 14, 'Under Contract': 7, 'Live': 5 },
    trend7d: makeTrend(7), trend30d: makeTrend(30),
  },
  {
    id: 'agent-4', name: 'Marcus Webb', email: 'marcus@travlr.com',
    sentCount: 156, replyRate: 9, bounceRate: 8, avgResponseTimeHours: 31,
    topTemplate: 'Follow-Up #1',
    pipelineStages: { 'New Lead': 68, 'Contacted': 22, 'Interested': 8, 'Proposal Sent': 3, 'Under Contract': 1, 'Live': 0 },
    trend7d: makeTrend(7), trend30d: makeTrend(30),
  },
];

const MOCK_TEMPLATES: Record<string, TemplatePerf[]> = {
  'agent-1': [
    { name: 'Check-In — Luxury Markets', sends: 67, replyRate: 21 },
    { name: 'Initial Outreach', sends: 140, replyRate: 14 },
    { name: 'Proposal Email', sends: 45, replyRate: 9 },
  ],
  'agent-2': [
    { name: 'Initial Outreach — Denver', sends: 98, replyRate: 12 },
    { name: 'Follow-Up #1', sends: 62, replyRate: 8 },
    { name: 'Revenue Estimate Offer', sends: 37, replyRate: 6 },
  ],
  'agent-3': [
    { name: 'Revenue Estimate Offer', sends: 112, replyRate: 24 },
    { name: 'Check-In — Luxury Markets', sends: 89, replyRate: 19 },
    { name: 'Proposal Email', sends: 71, replyRate: 15 },
  ],
  'agent-4': [
    { name: 'Follow-Up #1', sends: 78, replyRate: 9 },
    { name: 'Initial Outreach', sends: 55, replyRate: 7 },
    { name: 'Check-In', sends: 23, replyRate: 5 },
  ],
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPIChip({
  label, value, sub, icon: Icon, iconBg, iconColor, trend,
}: {
  label: string; value: string; sub?: string; icon: React.ElementType;
  iconBg: string; iconColor: string; trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon size={13} className={iconColor} />
        </div>
      </div>
      <p className="text-xl font-bold text-foreground leading-none">{value}</p>
      {sub && (
        <div className="flex items-center gap-1 mt-1">
          {trend === 'up' && <ArrowUp size={9} className="text-emerald-500" />}
          {trend === 'down' && <ArrowDown size={9} className="text-red-500" />}
          {trend === 'neutral' && <Minus size={9} className="text-muted-foreground" />}
          <p className="text-[10px] text-muted-foreground">{sub}</p>
        </div>
      )}
    </div>
  );
}

function PipelineBar({ stages }: { stages: Record<string, number> }) {
  const total = Object.values(stages).reduce((a, b) => a + b, 0) || 1;
  const colors = ['bg-slate-400', 'bg-blue-400', 'bg-amber-400', 'bg-purple-400', 'bg-orange-400', 'bg-emerald-500'];
  return (
    <div className="space-y-1.5">
      {PIPELINE_STAGES.map((stage, i) => {
        const count = stages[stage] ?? 0;
        const pct = Math.round((count / total) * 100);
        return (
          <div key={stage} className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-28 truncate shrink-0">{stage}</span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${colors[i]}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] font-semibold text-foreground w-6 text-right">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Paginated Transcript ─────────────────────────────────────────────────────

function PaginatedTranscript({ transcript, recordingId, templateId, templateName }: {
  transcript: string;
  recordingId: string;
  templateId?: string | null;
  templateName?: string | null;
}) {
  const supabase = createClient();
  const lines = transcript.split('\n').filter(l => l.trim().length > 0);
  const totalPages = Math.ceil(lines.length / TRANSCRIPT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const [rating, setRating] = useState<'effective' | 'needs_refinement' | null>(null);
  const [submittingRating, setSubmittingRating] = useState(false);

  const pageLines = lines.slice((page - 1) * TRANSCRIPT_PAGE_SIZE, page * TRANSCRIPT_PAGE_SIZE);

  async function submitRating(r: 'effective' | 'needs_refinement') {
    if (rating) return;
    setSubmittingRating(true);
    try {
      await supabase.from('template_ratings').upsert({
        call_session_id: recordingId,
        template_id: templateId || null,
        template_name: templateName || null,
        rating: r,
        rated_at: new Date().toISOString(),
      }, { onConflict: 'call_session_id' });
      setRating(r);
      toast.success(r === 'effective' ? 'Marked as Effective ✓' : 'Feedback recorded — Needs Refinement');
    } catch {
      toast.error('Failed to save rating');
    } finally {
      setSubmittingRating(false);
    }
  }

  return (
    <div className="space-y-2">
      {/* Transcript lines */}
      <div className="font-mono text-xs text-foreground leading-relaxed bg-muted/20 rounded-lg p-3 min-h-[80px]">
        {pageLines.map((line, i) => {
          const isAgent = line.toLowerCase().startsWith('agent:');
          const isLead = line.toLowerCase().startsWith('lead:');
          return (
            <p key={i} className={`mb-1 ${isAgent ? 'text-blue-700' : isLead ? 'text-emerald-700' : 'text-foreground'}`}>
              {line}
            </p>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 px-2 py-1 text-[10px] border border-border rounded-md hover:bg-muted disabled:opacity-40 transition-colors"
          >
            <ChevronLeft size={10} /> Prev
          </button>
          <span className="text-[10px] text-muted-foreground">
            Page {page} of {totalPages} · {lines.length} lines
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 px-2 py-1 text-[10px] border border-border rounded-md hover:bg-muted disabled:opacity-40 transition-colors"
          >
            Next <ChevronRight size={10} />
          </button>
        </div>
      )}

      {/* Template Rating */}
      <div className="flex items-center gap-2 pt-1 border-t border-border/50">
        <Star size={11} className="text-amber-500 shrink-0" />
        <span className="text-[10px] text-muted-foreground flex-1">
          {templateName ? `Rate cadence template: "${templateName}"` : 'Rate this call script'}
        </span>
        {rating ? (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${rating === 'effective' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
            {rating === 'effective' ? '✓ Effective' : '⚠ Needs Refinement'}
          </span>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={() => submitRating('effective')}
              disabled={submittingRating}
              className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 text-emerald-700 border border-emerald-200 text-[10px] rounded-md hover:bg-emerald-500/20 transition-colors font-medium disabled:opacity-50"
            >
              <ThumbsUp size={9} /> Effective
            </button>
            <button
              onClick={() => submitRating('needs_refinement')}
              disabled={submittingRating}
              className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-700 border border-amber-200 text-[10px] rounded-md hover:bg-amber-500/20 transition-colors font-medium disabled:opacity-50"
            >
              <ThumbsDown size={9} /> Needs Refinement
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Call Recordings Panel (Lazy-load + Pagination + Audio Cache) ─────────────

const PAGE_SIZE = 5;

function CallRecordingsPanel({ agentId }: { agentId: string }) {
  const supabase = createClient();
  const [recordings, setRecordings] = useState<CallRecording[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [expandedTranscript, setExpandedTranscript] = useState<string | null>(null);
  // Audio cache: recordingId → decoded blob URL
  const audioCache = useRef<Map<string, string>>(new Map());

  // Lazy-load: only fetch when user clicks "Load Recordings"
  const loadRecordings = useCallback(async (pageNum: number) => {
    setLoading(true);
    try {
      const from = (pageNum - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, count } = await supabase
        .from('call_sessions')
        .select('id, lead_id, started_at, duration_seconds, recording_url, transcript, script_compliance_score, outcome, cadence_template_id, leads(first_name, last_name)', { count: 'exact' })
        .eq('agent_id', agentId)
        .not('recording_url', 'is', null)
        .order('started_at', { ascending: false })
        .range(from, to);

      if (data && data.length > 0) {
        setRecordings(data.map((r: any) => ({
          id: r.id,
          lead_id: r.lead_id,
          lead_name: r.leads ? [r.leads.first_name, r.leads.last_name].filter(Boolean).join(' ') || 'Unknown Lead' : 'Unknown Lead',
          started_at: r.started_at,
          duration_seconds: r.duration_seconds,
          recording_url: r.recording_url,
          transcript: r.transcript,
          script_compliance_score: r.script_compliance_score,
          outcome: r.outcome,
          cadence_template_id: r.cadence_template_id || null,
          cadence_template_name: null,
        })));
        setTotalCount(count ?? 0);
      } else {
        // Mock fallback
        setRecordings([
          {
            id: 'rec-1', lead_id: 'l1', lead_name: 'James Whitfield',
            started_at: new Date(Date.now() - 86400000).toISOString(),
            duration_seconds: 247, recording_url: '#',
            transcript: 'Agent: Hi James, this is Sarah from TRAVLR. I wanted to follow up on your property at 4821 Maple Ave...\nLead: Oh yes, I\'ve been thinking about it. What kind of revenue could I expect?\nAgent: Based on comparable properties in your area, we\'re seeing $3,200–$4,100 per month in gross revenue...\nLead: That\'s more than I expected. Can we schedule a walkthrough?\nAgent: Absolutely. I have Thursday at 2pm or Friday morning available.\nLead: Thursday works for me.\nAgent: Perfect, I\'ll send you a calendar invite right now.\nLead: Great, looking forward to it.',
            script_compliance_score: 92, outcome: 'interested',
            cadence_template_id: 'tpl-1', cadence_template_name: 'Check-In — Luxury Markets',
          },
          {
            id: 'rec-2', lead_id: 'l2', lead_name: 'Sandra Okafor',
            started_at: new Date(Date.now() - 86400000 * 2).toISOString(),
            duration_seconds: 183, recording_url: '#',
            transcript: 'Agent: Hi Sandra, calling from TRAVLR about your Nashville property...\nLead: I\'m not really interested right now.\nAgent: I completely understand. Would it be okay if I sent over a quick revenue estimate so you have the numbers when you\'re ready?\nLead: Sure, that\'s fine.\nAgent: Great, I\'ll send that over today. What email should I use?\nLead: The one you already have is fine.',
            script_compliance_score: 78, outcome: 'callback',
            cadence_template_id: 'tpl-2', cadence_template_name: 'Follow-Up #1',
          },
          {
            id: 'rec-3', lead_id: 'l3', lead_name: 'Robert Tanaka',
            started_at: new Date(Date.now() - 86400000 * 3).toISOString(),
            duration_seconds: 312, recording_url: '#',
            transcript: 'Agent: Robert, thanks for taking my call. I saw you clicked on our revenue estimate email...\nLead: Yeah, I was curious. I have a place in Denver that\'s been sitting empty.\nAgent: Perfect timing. Denver is one of our strongest markets right now...\nLead: What kind of numbers are we talking?\nAgent: For a property like yours, typically $2,800 to $3,500 per month net.\nLead: That\'s actually pretty good. What\'s the process?\nAgent: We handle everything — listing, screening, maintenance coordination.\nLead: Send me the details.',
            script_compliance_score: 88, outcome: 'proposal_sent',
            cadence_template_id: 'tpl-1', cadence_template_name: 'Revenue Estimate Offer',
          },
        ]);
        setTotalCount(3);
      }
    } catch {
      setRecordings([]);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [agentId, supabase]);

  // Cache and return audio URL (decoded blob URL for reuse)
  async function getCachedAudioUrl(recordingId: string, url: string): Promise<string> {
    if (audioCache.current.has(recordingId)) {
      return audioCache.current.get(recordingId)!;
    }
    if (url === '#') return '#';
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      audioCache.current.set(recordingId, blobUrl);
      return blobUrl;
    } catch {
      return url;
    }
  }

  async function handlePlay(rec: CallRecording) {
    if (!rec.recording_url || rec.recording_url === '#') {
      toast.info('No audio file available for this recording');
      return;
    }
    const url = await getCachedAudioUrl(rec.id, rec.recording_url);
    if (url !== '#') {
      window.open(url, '_blank');
    }
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    loadRecordings(newPage);
  }

  function fmtDuration(secs: number | null) {
    if (!secs) return '—';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function complianceColor(score: number | null) {
    if (!score) return 'text-muted-foreground';
    if (score >= 85) return 'text-emerald-600';
    if (score >= 70) return 'text-amber-600';
    return 'text-red-600';
  }

  function complianceBg(score: number | null) {
    if (!score) return 'bg-muted/40';
    if (score >= 85) return 'bg-emerald-500/10 border-emerald-200';
    if (score >= 70) return 'bg-amber-500/10 border-amber-200';
    return 'bg-red-500/10 border-red-200';
  }

  const outcomeIcon = (outcome: string | null) => {
    if (outcome === 'interested' || outcome === 'proposal_sent') return <CheckCircle size={11} className="text-emerald-500" />;
    if (outcome === 'not_interested') return <XCircle size={11} className="text-red-500" />;
    return <AlertCircle size={11} className="text-amber-500" />;
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Not yet loaded — show lazy-load trigger
  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-6">
        <button
          onClick={() => loadRecordings(1)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <PlayCircle size={12} />}
          {loading ? 'Loading recordings…' : 'Load Call Recordings'}
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2].map(i => <div key={i} className="h-14 bg-muted/30 rounded-lg animate-pulse" />)}
      </div>
    );
  }

  if (recordings.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-muted-foreground">
        <Phone size={20} className="mx-auto mb-2 text-muted-foreground/30" />
        No recorded calls yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {recordings.map(rec => (
        <div key={rec.id} className="border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-3 px-3 py-2.5 bg-muted/10">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <Phone size={12} className="text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{rec.lead_name}</p>
              <p className="text-[10px] text-muted-foreground">
                {new Date(rec.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {fmtDuration(rec.duration_seconds)}
              </p>
            </div>
            {/* Compliance Score */}
            {rec.script_compliance_score !== null && (
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${complianceBg(rec.script_compliance_score)}`}>
                <span className={complianceColor(rec.script_compliance_score)}>{rec.script_compliance_score}% compliant</span>
              </div>
            )}
            {/* Outcome */}
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground capitalize">
              {outcomeIcon(rec.outcome)}
              {rec.outcome?.replace(/_/g, ' ') || 'unknown'}
            </div>
            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => handlePlay(rec)}
                className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-[10px] rounded-md hover:bg-blue-700 transition-colors font-medium"
              >
                <PlayCircle size={10} /> Play
              </button>
              {rec.transcript && (
                <button
                  onClick={() => setExpandedTranscript(expandedTranscript === rec.id ? null : rec.id)}
                  className="flex items-center gap-1 px-2 py-1 border border-border text-[10px] rounded-md hover:bg-muted transition-colors text-muted-foreground"
                >
                  <FileText size={10} /> {expandedTranscript === rec.id ? 'Hide' : 'Transcript'}
                </button>
              )}
            </div>
          </div>
          {/* Paginated Transcript + Rating */}
          {expandedTranscript === rec.id && rec.transcript && (
            <div className="px-3 py-3 bg-muted/5 border-t border-border">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Call Transcript</p>
              <PaginatedTranscript
                transcript={rec.transcript}
                recordingId={rec.id}
                templateId={rec.cadence_template_id}
                templateName={rec.cadence_template_name}
              />
            </div>
          )}
        </div>
      ))}

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
            className="flex items-center gap-1 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted disabled:opacity-40 transition-colors"
          >
            <ChevronLeft size={12} /> Previous
          </button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {totalCount} recordings
          </span>
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page === totalPages}
            className="flex items-center gap-1 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted disabled:opacity-40 transition-colors"
          >
            Next <ChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

function AgentRow({ agent, period, expanded, onToggle }: {
  agent: AgentPerf; period: '7d' | '30d'; expanded: boolean; onToggle: () => void;
}) {
  const trendData = period === '7d' ? agent.trend7d : agent.trend30d;
  const templates = MOCK_TEMPLATES[agent.id] ?? [];
  const avgHoursDisplay = agent.avgResponseTimeHours < 24
    ? `${agent.avgResponseTimeHours}h`
    : `${Math.round(agent.avgResponseTimeHours / 24)}d`;

  const perfScore = agent.replyRate * 2 - agent.bounceRate;
  const perfLabel = perfScore >= 30 ? 'Top Performer' : perfScore >= 18 ? 'Strong' : perfScore >= 10 ? 'Average' : 'Needs Coaching';
  const perfColor = perfScore >= 30 ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
    : perfScore >= 18 ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
    : perfScore >= 10 ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' :'bg-red-500/10 text-red-600 border-red-500/20';

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Agent summary row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors text-left"
      >
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-primary">
            {agent.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </span>
        </div>
        {/* Name */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{agent.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">{agent.email}</p>
        </div>
        {/* KPIs */}
        <div className="hidden md:flex items-center gap-6">
          <div className="text-center">
            <p className="text-base font-bold text-foreground">{agent.sentCount}</p>
            <p className="text-[10px] text-muted-foreground">Sent</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-foreground">{agent.replyRate}%</p>
            <p className="text-[10px] text-muted-foreground">Reply Rate</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-foreground">{agent.bounceRate}%</p>
            <p className="text-[10px] text-muted-foreground">Bounce</p>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-foreground">{avgHoursDisplay}</p>
            <p className="text-[10px] text-muted-foreground">Avg Response</p>
          </div>
        </div>
        {/* Badge */}
        <span className={`hidden lg:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${perfColor}`}>
          {perfLabel}
        </span>
        {expanded ? <ChevronUp size={14} className="text-muted-foreground shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border px-5 py-5 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Trend chart */}
            <div className="lg:col-span-1">
              <p className="text-xs font-semibold text-foreground mb-3">
                {period === '7d' ? '7-Day' : '30-Day'} Outreach Trend
              </p>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)' }} />
                  <Line type="monotone" dataKey="sent" stroke="#6366f1" strokeWidth={2} dot={false} name="Sent" />
                  <Line type="monotone" dataKey="replies" stroke="#10b981" strokeWidth={2} dot={false} name="Replies" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Pipeline stage completion */}
            <div className="lg:col-span-1">
              <p className="text-xs font-semibold text-foreground mb-3">Pipeline Stage Completion</p>
              <PipelineBar stages={agent.pipelineStages} />
            </div>

            {/* Top templates */}
            <div className="lg:col-span-1">
              <p className="text-xs font-semibold text-foreground mb-3">Top Templates by Reply Rate</p>
              <div className="space-y-2">
                {templates.map((tpl, i) => (
                  <div key={tpl.name} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-muted-foreground w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{tpl.name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${tpl.replyRate * 3}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-8 text-right">{tpl.replyRate}%</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{tpl.sends} sent</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Call Recordings & Transcripts — lazy-loaded on demand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Phone size={13} className="text-blue-500" />
              <p className="text-xs font-semibold text-foreground">Call Recordings & Transcripts</p>
              <span className="text-[10px] text-muted-foreground ml-1">· Lazy-loaded · paginated · audio cached · rate templates inline</span>
            </div>
            <CallRecordingsPanel agentId={agent.id} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentPerformancePage() {
  const [agents, setAgents] = useState<AgentPerf[]>(MOCK_AGENTS);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'7d' | '30d'>('30d');
  const [expandedId, setExpandedId] = useState<string | null>(MOCK_AGENTS[0]?.id ?? null);
  const supabase = createClient();
  const { user } = useAuth();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: agentData } = await supabase
        .from('agent_profiles')
        .select('id, full_name, email')
        .order('full_name');

      if (agentData && agentData.length > 0) {
        const since = new Date();
        since.setDate(since.getDate() - (period === '7d' ? 7 : 30));

        const { data: outreach } = await supabase
          .from('outreach_history')
          .select('agent_id, status, reply_detected, sent_at, replied_at, channel')
          .gte('sent_at', since.toISOString());

        const { data: leads } = await supabase
          .from('leads')
          .select('agent_id, stage');

        const merged: AgentPerf[] = agentData.map((a: any) => {
          const rows = (outreach ?? []).filter((r: any) => r.agent_id === a.id);
          const total = rows.length;
          const replied = rows.filter((r: any) => r.reply_detected || r.status === 'replied').length;
          const bounced = rows.filter((r: any) => r.status === 'bounced').length;
          const responseTimes = rows
            .filter((r: any) => r.replied_at && r.sent_at)
            .map((r: any) => (new Date(r.replied_at).getTime() - new Date(r.sent_at).getTime()) / 3600000);
          const avgHours = responseTimes.length > 0
            ? Math.round(responseTimes.reduce((x: number, y: number) => x + y, 0) / responseTimes.length)
            : 18;

          const agentLeads = (leads ?? []).filter((l: any) => l.agent_id === a.id);
          const pipelineStages: Record<string, number> = {};
          PIPELINE_STAGES.forEach(s => { pipelineStages[s] = agentLeads.filter((l: any) => l.stage === s).length; });

          const mockAgent = MOCK_AGENTS.find(m => m.name === a.full_name) ?? MOCK_AGENTS[0];

          return {
            id: a.id,
            name: a.full_name,
            email: a.email ?? '',
            sentCount: total || mockAgent.sentCount,
            replyRate: total > 0 ? Math.round((replied / total) * 100) : mockAgent.replyRate,
            bounceRate: total > 0 ? Math.round((bounced / total) * 100) : mockAgent.bounceRate,
            avgResponseTimeHours: avgHours,
            topTemplate: mockAgent.topTemplate,
            pipelineStages: Object.values(pipelineStages).some(v => v > 0) ? pipelineStages : mockAgent.pipelineStages,
            trend7d: mockAgent.trend7d,
            trend30d: mockAgent.trend30d,
          };
        });
        setAgents(merged);
      } else {
        setAgents(MOCK_AGENTS);
      }
    } catch {
      setAgents(MOCK_AGENTS);
    } finally {
      setLoading(false);
    }
  }, [supabase, period]);

  useEffect(() => { loadData(); }, [loadData]);

  // Aggregate KPIs
  const totalSent = agents.reduce((a, b) => a + b.sentCount, 0);
  const avgReplyRate = agents.length > 0 ? Math.round(agents.reduce((a, b) => a + b.replyRate, 0) / agents.length) : 0;
  const avgBounceRate = agents.length > 0 ? Math.round(agents.reduce((a, b) => a + b.bounceRate, 0) / agents.length) : 0;
  const avgResponseTime = agents.length > 0 ? Math.round(agents.reduce((a, b) => a + b.avgResponseTimeHours, 0) / agents.length) : 0;
  const avgResponseDisplay = avgResponseTime < 24 ? `${avgResponseTime}h` : `${Math.round(avgResponseTime / 24)}d`;

  // Comparison bar chart data
  const comparisonData = agents.map(a => ({
    name: a.name.split(' ')[0],
    sent: a.sentCount,
    replyRate: a.replyRate,
    bounceRate: a.bounceRate,
  }));

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Agent Performance</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Multi-agent outreach metrics, pipeline completion, call recordings, and coaching insights
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
              {(['7d', '30d'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    period === p ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p === '7d' ? '7 Days' : '30 Days'}
                </button>
              ))}
            </div>
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Aggregate KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPIChip label="Total Sent" value={totalSent.toLocaleString()} sub={`Across ${agents.length} agents`} icon={Mail} iconBg="bg-blue-500/10" iconColor="text-blue-500" trend="up" />
          <KPIChip label="Avg Reply Rate" value={`${avgReplyRate}%`} sub="Team average" icon={TrendingUp} iconBg="bg-emerald-500/10" iconColor="text-emerald-500" trend="up" />
          <KPIChip label="Avg Bounce Rate" value={`${avgBounceRate}%`} sub="Lower is better" icon={BarChart2} iconBg="bg-red-500/10" iconColor="text-red-500" trend="neutral" />
          <KPIChip label="Avg Response Time" value={avgResponseDisplay} sub="Time to first reply" icon={Clock} iconBg="bg-amber-500/10" iconColor="text-amber-500" trend="neutral" />
        </div>

        {/* Comparison chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Agent Comparison — Sent vs Reply Rate</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={comparisonData} margin={{ top: 4, right: 16, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="%" />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="sent" fill="#6366f1" name="Sent" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="right" dataKey="replyRate" fill="#10b981" name="Reply Rate %" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Per-agent rows */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Per-Agent Detail</h2>
            <span className="text-xs text-muted-foreground">{agents.length} agents · click to expand · recordings lazy-loaded on demand</span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {agents.map(agent => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  period={period}
                  expanded={expandedId === agent.id}
                  onToggle={() => setExpandedId(prev => prev === agent.id ? null : agent.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
