'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Users, RefreshCw, Plus, LayoutGrid, List, Search, Filter, User, Calendar, TrendingUp, ArrowRight, GripVertical, CheckCircle, XCircle, Clock, AlertCircle, FileText, BarChart2, ArrowUpDown, Eye, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

type PipelineStatus = 'READY_TO_INTERVIEW' | 'INTERVIEWED' | 'FOLLOW_UP' | 'HOLD' | 'MOVE_FORWARD' | 'HIRED' | 'NOT_MOVING_FORWARD';

interface PipelineCandidate {
  id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  candidate_rank?: number;
  interview_priority?: string;
  candidate_status?: string;
  pipeline_status: PipelineStatus;
  current_title?: string;
  current_company?: string;
  city?: string;
  state?: string;
  resume_file_name?: string;
  resume_parsed_at?: string;
  first_interview_at?: string;
  latest_interview_at?: string;
  next_interview_at?: string;
  next_interview_type?: string;
  interview_count?: number;
  latest_scorecard_average?: number;
  average_score_across_interviews?: number;
  top_strength?: string;
  main_area_to_validate?: string;
  consistency_report_status?: string;
  next_action?: string;
  seed_fit_notes?: string;
  seed_concerns?: string;
  vacation_rental_experience?: boolean;
  outbound_calling_experience?: boolean;
}

interface PipelineCounts {
  total: number;
  READY_TO_INTERVIEW: number;
  INTERVIEWED: number;
  FOLLOW_UP: number;
  HOLD: number;
  MOVE_FORWARD: number;
  HIRED: number;
  NOT_MOVING_FORWARD: number;
}

// ─── Stage Config ─────────────────────────────────────────────────────────────

const PIPELINE_STAGES: Array<{
  id: PipelineStatus;
  label: string;
  color: string;
  headerBg: string;
  headerText: string;
  dotColor: string;
  icon: React.ElementType;
}> = [
  { id: 'READY_TO_INTERVIEW', label: 'Ready to Interview', color: 'bg-slate-50 border-slate-200', headerBg: 'bg-slate-100', headerText: 'text-slate-700', dotColor: 'bg-slate-400', icon: Clock },
  { id: 'INTERVIEWED', label: 'Interviewed', color: 'bg-blue-50 border-blue-200', headerBg: 'bg-blue-100', headerText: 'text-blue-700', dotColor: 'bg-blue-500', icon: CheckCircle },
  { id: 'FOLLOW_UP', label: 'Follow-Up', color: 'bg-amber-50 border-amber-200', headerBg: 'bg-amber-100', headerText: 'text-amber-700', dotColor: 'bg-amber-500', icon: ArrowRight },
  { id: 'HOLD', label: 'Hold', color: 'bg-gray-50 border-gray-200', headerBg: 'bg-gray-100', headerText: 'text-gray-600', dotColor: 'bg-gray-400', icon: AlertCircle },
  { id: 'MOVE_FORWARD', label: 'Move Forward', color: 'bg-green-50 border-green-200', headerBg: 'bg-green-100', headerText: 'text-green-700', dotColor: 'bg-green-500', icon: TrendingUp },
  { id: 'HIRED', label: 'Hired', color: 'bg-emerald-50 border-emerald-200', headerBg: 'bg-emerald-100', headerText: 'text-emerald-700', dotColor: 'bg-emerald-500', icon: CheckCircle },
  { id: 'NOT_MOVING_FORWARD', label: 'Not Moving Forward', color: 'bg-red-50 border-red-200', headerBg: 'bg-red-100', headerText: 'text-red-700', dotColor: 'bg-red-400', icon: XCircle },
];

const PRIORITY_COLORS: Record<string, string> = {
  HIGHEST: 'bg-red-100 text-red-700',
  VERY_HIGH: 'bg-orange-100 text-orange-700',
  HIGH: 'bg-amber-100 text-amber-700',
  VERY_STRONG: 'bg-yellow-100 text-yellow-700',
  STRONG_SECONDARY: 'bg-lime-100 text-lime-700',
  SOLID_MID_TIER: 'bg-green-100 text-green-700',
  STANDARD: 'bg-gray-100 text-gray-600',
};

function formatDate(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ScoreBadge({ score }: { score?: number }) {
  if (!score) return null;
  const color = score >= 8 ? 'text-green-700 bg-green-50' : score >= 6 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>
      <BarChart2 className="w-3 h-3" />
      {score.toFixed(1)}
    </span>
  );
}

function ReportStatusBadge({ status }: { status?: string }) {
  if (!status || status === 'PENDING') return <span className="text-xs text-gray-400">—</span>;
  if (status === 'COMPLETED') return <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />Report Ready</span>;
  if (status === 'FAILED') return <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" />Failed</span>;
  return <span className="text-xs text-gray-400">{status}</span>;
}

// ─── Candidate Card (Kanban) ──────────────────────────────────────────────────

function CandidateCard({
  candidate,
  onDragStart,
  onStatusChange,
  currentStageIndex,
}: {
  candidate: PipelineCandidate;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onStatusChange: (id: string, status: PipelineStatus) => void;
  currentStageIndex: number;
}) {
  const nextStage = currentStageIndex < PIPELINE_STAGES.length - 1 ? PIPELINE_STAGES[currentStageIndex + 1] : null;

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, candidate.id)}
      className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm hover:shadow-md hover:border-gray-300 transition-all cursor-grab active:cursor-grabbing group select-none"
    >
      {/* Header */}
      <div className="flex items-start gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center flex-shrink-0 text-xs font-bold text-gray-600">
          {candidate.candidate_rank ? `#${candidate.candidate_rank}` : <User className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{candidate.full_name}</p>
          <p className="text-xs text-gray-500 truncate">{candidate.current_title || candidate.current_company || 'No title'}</p>
        </div>
        <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Priority + Score */}
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        {candidate.interview_priority && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${PRIORITY_COLORS[candidate.interview_priority] || 'bg-gray-100 text-gray-600'}`}>
            {candidate.interview_priority.replace(/_/g, ' ')}
          </span>
        )}
        <ScoreBadge score={candidate.latest_scorecard_average} />
        <ReportStatusBadge status={candidate.consistency_report_status} />
      </div>

      {/* Top strength */}
      {candidate.top_strength && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-2 py-1.5 mb-2 line-clamp-2">
          <span className="font-medium text-gray-700">Strength: </span>{candidate.top_strength}
        </p>
      )}

      {/* Dates */}
      <div className="flex items-center gap-3 text-[11px] text-gray-400 mb-2.5">
        {candidate.latest_interview_at && (
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Interviewed {formatDate(candidate.latest_interview_at)}</span>
        )}
        {candidate.next_interview_at && (
          <span className="flex items-center gap-1 text-blue-600"><Calendar className="w-3 h-3" />Next {formatDate(candidate.next_interview_at)}</span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <div className="flex items-center gap-1.5">
          {candidate.interview_count && candidate.interview_count > 0 && (
            <span className="text-[11px] text-gray-400">{candidate.interview_count} interview{candidate.interview_count > 1 ? 's' : ''}</span>
          )}
        </div>
        {nextStage && nextStage.id !== 'NOT_MOVING_FORWARD' && (
          <button
            onClick={() => onStatusChange(candidate.id, nextStage.id)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-900 text-white text-[11px] font-semibold hover:bg-gray-700 transition-colors"
          >
            {nextStage.label.split(' ')[0]}
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanColumn({
  stage,
  candidates,
  stageIndex,
  onDragStart,
  onDrop,
  onDragOver,
  onStatusChange,
  isDragOver,
}: {
  stage: typeof PIPELINE_STAGES[0];
  candidates: PipelineCandidate[];
  stageIndex: number;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, status: PipelineStatus) => void;
  onDragOver: (e: React.DragEvent) => void;
  onStatusChange: (id: string, status: PipelineStatus) => void;
  isDragOver: boolean;
}) {
  const StageIcon = stage.icon;
  return (
    <div
      className={`flex flex-col rounded-2xl border-2 transition-all min-w-[220px] flex-1 ${isDragOver ? 'border-gray-400 bg-gray-100 scale-[1.01]' : stage.color}`}
      onDrop={e => onDrop(e, stage.id)}
      onDragOver={e => { onDragOver(e); }}
    >
      <div className={`flex items-center justify-between px-3 py-2.5 rounded-t-xl ${stage.headerBg} ${stage.headerText}`}>
        <div className="flex items-center gap-2">
          <StageIcon className="w-4 h-4" />
          <span className="text-xs font-bold">{stage.label}</span>
        </div>
        <span className="w-5 h-5 rounded-full bg-white/60 flex items-center justify-center text-xs font-bold">{candidates.length}</span>
      </div>
      <div className="flex-1 p-2 space-y-2 min-h-[100px]">
        {candidates.length === 0 && (
          <div className="flex items-center justify-center h-16 text-xs text-gray-400 italic">Drop here</div>
        )}
        {candidates.map(c => (
          <CandidateCard
            key={c.id}
            candidate={c}
            onDragStart={onDragStart}
            onStatusChange={onStatusChange}
            currentStageIndex={stageIndex}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Table View ───────────────────────────────────────────────────────────────

function TableView({
  candidates,
  onStatusChange,
}: {
  candidates: PipelineCandidate[];
  onStatusChange: (id: string, status: PipelineStatus) => void;
}) {
  const [sortField, setSortField] = useState<string>('candidate_rank');
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = [...candidates].sort((a, b) => {
    const av = (a as Record<string, unknown>)[sortField];
    const bv = (b as Record<string, unknown>)[sortField];
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return sortAsc ? av - bv : bv - av;
    return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  const toggleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <th
      className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-800 whitespace-nowrap"
      onClick={() => toggleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className="w-3 h-3 opacity-50" />
      </div>
    </th>
  );

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <SortHeader field="candidate_rank" label="Rank" />
              <SortHeader field="full_name" label="Candidate" />
              <SortHeader field="pipeline_status" label="Status" />
              <SortHeader field="interview_priority" label="Priority" />
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Resume</th>
              <SortHeader field="latest_interview_at" label="Interview Date" />
              <SortHeader field="latest_scorecard_average" label="Latest Score" />
              <SortHeader field="average_score_across_interviews" label="Avg Score" />
              <SortHeader field="interview_count" label="Interviews" />
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Top Strength</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Consistency</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Next Action</th>
              <SortHeader field="next_interview_at" label="Next Interview" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map(c => {
              const stage = PIPELINE_STAGES.find(s => s.id === c.pipeline_status);
              return (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-3 text-xs font-bold text-gray-500">
                    {c.candidate_rank ? `#${c.candidate_rank}` : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-gray-900 text-sm">{c.full_name}</div>
                    <div className="text-xs text-gray-500">{c.current_title || c.current_company || ''}</div>
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={c.pipeline_status}
                      onChange={e => onStatusChange(c.id, e.target.value as PipelineStatus)}
                      className={`text-xs font-semibold px-2 py-1 rounded-lg border-0 cursor-pointer ${stage?.headerBg || 'bg-gray-100'} ${stage?.headerText || 'text-gray-700'}`}
                    >
                      {PIPELINE_STAGES.map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    {c.interview_priority && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${PRIORITY_COLORS[c.interview_priority] || 'bg-gray-100 text-gray-600'}`}>
                        {c.interview_priority.replace(/_/g, ' ')}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {c.resume_file_name ? (
                      <span className="flex items-center gap-1 text-xs text-green-700"><FileText className="w-3 h-3" />Ready</span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-600">{formatDate(c.latest_interview_at) || '—'}</td>
                  <td className="px-3 py-3"><ScoreBadge score={c.latest_scorecard_average} /></td>
                  <td className="px-3 py-3"><ScoreBadge score={c.average_score_across_interviews} /></td>
                  <td className="px-3 py-3 text-xs text-gray-600 text-center">{c.interview_count || 0}</td>
                  <td className="px-3 py-3 text-xs text-gray-600 max-w-[160px] truncate">{c.top_strength || c.seed_fit_notes?.slice(0, 60) || '—'}</td>
                  <td className="px-3 py-3"><ReportStatusBadge status={c.consistency_report_status} /></td>
                  <td className="px-3 py-3 text-xs text-gray-600 max-w-[140px] truncate">{c.next_action || '—'}</td>
                  <td className="px-3 py-3 text-xs text-gray-600">{formatDate(c.next_interview_at) || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CandidatePipelinePage() {
  const supabase = createClient();
  const router = useRouter();
  const [candidates, setCandidates] = useState<PipelineCandidate[]>([]);
  const [counts, setCounts] = useState<PipelineCounts>({ total: 0, READY_TO_INTERVIEW: 0, INTERVIEWED: 0, FOLLOW_UP: 0, HOLD: 0, MOVE_FORWARD: 0, HIRED: 0, NOT_MOVING_FORWARD: 0 });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [dragOverStage, setDragOverStage] = useState<PipelineStatus | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const [stageOverrides, setStageOverrides] = useState<Record<string, PipelineStatus>>({});

  const loadPipeline = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'ALL') params.set('status', filterStatus);
      if (search) params.set('search', search);

      const res = await fetch(`/api/candidates/pipeline?${params}`);
      const data = await res.json();
      setCandidates(data.candidates || []);
      setCounts(data.counts || {});
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [filterStatus, search]);

  useEffect(() => { loadPipeline(); }, [loadPipeline]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('pipeline-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates' }, () => {
        loadPipeline();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, loadPipeline]);

  const getStage = (c: PipelineCandidate): PipelineStatus => {
    return stageOverrides[c.id] ?? c.pipeline_status ?? 'READY_TO_INTERVIEW';
  };

  const handleStatusChange = async (id: string, newStatus: PipelineStatus) => {
    setStageOverrides(prev => ({ ...prev, [id]: newStatus }));
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, pipeline_status: newStatus } : c));

    const res = await fetch('/api/candidates/pipeline', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: id, newStatus }),
    });
    const data = await res.json().catch(() => null);

    if (newStatus === 'HIRED') {
      const url = data?.offerDraftUrl || `/offer-letters?candidateId=${encodeURIComponent(id)}&source=hired`;
      router.push(url);
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    dragIdRef.current = id;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: PipelineStatus) => {
    e.preventDefault();
    setDragOverStage(null);
    const id = dragIdRef.current;
    if (!id) return;
    dragIdRef.current = null;
    await handleStatusChange(id, targetStatus);
  };

  // Group by stage
  const grouped: Record<PipelineStatus, PipelineCandidate[]> = {
    READY_TO_INTERVIEW: [], INTERVIEWED: [], FOLLOW_UP: [], HOLD: [], MOVE_FORWARD: [], NOT_MOVING_FORWARD: [],
  };
  for (const c of candidates) {
    const stage = getStage(c);
    if (stage in grouped) grouped[stage].push(c);
  }

  const countBadge = (key: keyof PipelineCounts) => counts[key] || 0;

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-5 h-5 text-gray-700" />
              <h1 className="text-2xl font-bold text-gray-900">Candidate Pipeline</h1>
            </div>
            <p className="text-sm text-gray-500">{counts.total} total candidates · Human decisions only for final status</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadPipeline} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors">
              <RefreshCw className="w-4 h-4 text-gray-500" />
            </button>
            <div className="flex items-center bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => setView('kanban')} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors ${view === 'kanban' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                <LayoutGrid className="w-3.5 h-3.5" />Kanban
              </button>
              <button onClick={() => setView('table')} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors ${view === 'table' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                <List className="w-3.5 h-3.5" />Table
              </button>
            </div>
            <Link href="/teleprompter/interview" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors">
              <Plus className="w-4 h-4" />New Interview
            </Link>
          </div>
        </div>

        {/* Pipeline Counts */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-5">
          {PIPELINE_STAGES.map(stage => (
            <button
              key={stage.id}
              onClick={() => setFilterStatus(filterStatus === stage.id ? 'ALL' : stage.id)}
              className={`rounded-xl border px-3 py-2.5 flex items-center gap-2 transition-all ${filterStatus === stage.id ? 'ring-2 ring-gray-900 ' + stage.color : stage.color} hover:opacity-80`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${stage.dotColor}`} />
              <div className="min-w-0 text-left">
                <p className="text-[10px] text-gray-500 truncate">{stage.label}</p>
                <p className="text-lg font-bold text-gray-900">{countBadge(stage.id as keyof PipelineCounts)}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search candidates..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          {filterStatus !== 'ALL' && (
            <button onClick={() => setFilterStatus('ALL')} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
              <XCircle className="w-3.5 h-3.5" />Clear Filter
            </button>
          )}
          <Link href="/candidate-profiles" className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
            <Eye className="w-3.5 h-3.5" />Profiles
          </Link>
          <Link href="/interview-mode-qa" className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
            <Zap className="w-3.5 h-3.5" />Batch QA
          </Link>
        </div>

        {/* Board / Table */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
          </div>
        ) : view === 'kanban' ? (
          <>
            <div className="flex gap-3 overflow-x-auto pb-4">
              {PIPELINE_STAGES.map((stage, idx) => (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  stageIndex={idx}
                  candidates={grouped[stage.id]}
                  onDragStart={handleDragStart}
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setDragOverStage(stage.id); }}
                  onStatusChange={handleStatusChange}
                  isDragOver={dragOverStage === stage.id}
                />
              ))}
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-gray-400">
              <GripVertical className="w-3.5 h-3.5" />
              Drag cards between columns · Status changes require human authorization for Move Forward / Not Moving Forward
            </p>
          </>
        ) : (
          <TableView candidates={candidates} onStatusChange={handleStatusChange} />
        )}
      </div>
    </AppLayout>
  );
}
