'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { User, Briefcase, Calendar, CheckCircle, XCircle, Star, TrendingUp, GripVertical, Plus, RefreshCw, Phone, MessageSquare, ArrowRight, Users, Kanban,  } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

type KanbanStage = 'submitted' | 'interviewed' | 'offered' | 'hired' | 'rejected';

interface KanbanCandidate {
  id: string;
  candidate_name: string;
  role_title: string;
  role_id: string;
  interview_date: string;
  overall_score: 'strong_yes' | 'yes' | 'maybe' | 'no' | null;
  follow_up_status: 'pending' | 'scheduled' | 'completed' | 'rejected' | 'hired';
  notes: string;
  questions_covered: number;
  questions_total: number;
  tags: string[];
  callback_date?: string | null;
  callback_notes?: string | null;
  created_at: string;
}

// ─── Stage Config ─────────────────────────────────────────────────────────────

const STAGES: { id: KanbanStage; label: string; color: string; headerColor: string; dotColor: string; icon: React.ElementType }[] = [
  { id: 'submitted',  label: 'Submitted',  color: 'bg-slate-50 border-slate-200',  headerColor: 'bg-slate-100 text-slate-700',  dotColor: 'bg-slate-400',  icon: Users },
  { id: 'interviewed', label: 'Interviewed', color: 'bg-blue-50 border-blue-200',   headerColor: 'bg-blue-100 text-blue-700',   dotColor: 'bg-blue-500',   icon: MessageSquare },
  { id: 'offered',    label: 'Offered',    color: 'bg-amber-50 border-amber-200',  headerColor: 'bg-amber-100 text-amber-700', dotColor: 'bg-amber-500',  icon: Star },
  { id: 'hired',      label: 'Hired',      color: 'bg-green-50 border-green-200',  headerColor: 'bg-green-100 text-green-700', dotColor: 'bg-green-500',  icon: CheckCircle },
  { id: 'rejected',   label: 'Rejected',   color: 'bg-red-50 border-red-200',      headerColor: 'bg-red-100 text-red-700',     dotColor: 'bg-red-400',    icon: XCircle },
];

const SCORE_LABELS: Record<string, string> = {
  strong_yes: 'Strong Yes',
  yes: 'Yes',
  maybe: 'Maybe',
  no: 'No',
};

const SCORE_COLORS: Record<string, string> = {
  strong_yes: 'bg-green-100 text-green-700',
  yes: 'bg-emerald-100 text-emerald-700',
  maybe: 'bg-amber-100 text-amber-700',
  no: 'bg-red-100 text-red-700',
};

// Map follow_up_status → kanban stage
function statusToStage(status: KanbanCandidate['follow_up_status'], score: KanbanCandidate['overall_score']): KanbanStage {
  if (status === 'hired') return 'hired';
  if (status === 'rejected') return 'rejected';
  if (status === 'completed') return 'interviewed';
  if (status === 'scheduled') return 'submitted';
  if (status === 'pending') {
    // If they have a score, they've been interviewed
    if (score) return 'interviewed';
    return 'submitted';
  }
  return 'submitted';
}

// Map kanban stage → follow_up_status
function stageToStatus(stage: KanbanStage): KanbanCandidate['follow_up_status'] {
  if (stage === 'hired') return 'hired';
  if (stage === 'rejected') return 'rejected';
  if (stage === 'offered') return 'scheduled';
  if (stage === 'interviewed') return 'completed';
  return 'pending';
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Candidate Card ───────────────────────────────────────────────────────────

function CandidateKanbanCard({
  candidate,
  onDragStart,
  onAdvance,
  currentStage,
}: {
  candidate: KanbanCandidate;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onAdvance: (id: string, nextStage: KanbanStage) => void;
  currentStage: KanbanStage;
}) {
  const stageIndex = STAGES.findIndex(s => s.id === currentStage);
  const nextStage = stageIndex < STAGES.length - 1 ? STAGES[stageIndex + 1] : null;
  const coveragePct = candidate.questions_total > 0
    ? Math.round((candidate.questions_covered / candidate.questions_total) * 100)
    : 0;

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, candidate.id)}
      className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm hover:shadow-md hover:border-gray-300 transition-all cursor-grab active:cursor-grabbing group select-none"
    >
      {/* Header */}
      <div className="flex items-start gap-2 mb-2.5">
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
          <User className="w-4 h-4 text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{candidate.candidate_name}</p>
          <p className="text-xs text-gray-500 truncate flex items-center gap-1 mt-0.5">
            <Briefcase className="w-3 h-3 flex-shrink-0" />
            {candidate.role_title}
          </p>
        </div>
        <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Score badge */}
      {candidate.overall_score && (
        <div className="mb-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${SCORE_COLORS[candidate.overall_score]}`}>
            <TrendingUp className="w-2.5 h-2.5" />
            {SCORE_LABELS[candidate.overall_score]}
          </span>
        </div>
      )}

      {/* Notes preview */}
      {candidate.notes && (
        <p className="text-xs text-gray-500 line-clamp-2 mb-2.5 leading-relaxed bg-gray-50 rounded-lg px-2 py-1.5">
          {candidate.notes}
        </p>
      )}

      {/* Callback indicator */}
      {candidate.callback_date && (
        <div className="flex items-center gap-1.5 mb-2 text-xs text-blue-700 bg-blue-50 rounded-lg px-2 py-1.5">
          <Phone className="w-3 h-3 flex-shrink-0" />
          <span className="font-medium">Callback: {formatDate(candidate.callback_date)}</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-gray-100">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
          <Calendar className="w-3 h-3" />
          {formatDate(candidate.interview_date)}
          {candidate.questions_total > 0 && (
            <span className="ml-1 text-gray-300">· {coveragePct}%</span>
          )}
        </div>

        {nextStage && nextStage.id !== 'rejected' && (
          <button
            onClick={() => onAdvance(candidate.id, nextStage.id)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-900 text-white text-[11px] font-semibold hover:bg-gray-700 transition-colors"
            title={`Move to ${nextStage.label}`}
          >
            {nextStage.label}
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
  onDragStart,
  onDrop,
  onDragOver,
  onAdvance,
  isDragOver,
}: {
  stage: typeof STAGES[0];
  candidates: KanbanCandidate[];
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, stageId: KanbanStage) => void;
  onDragOver: (e: React.DragEvent) => void;
  onAdvance: (id: string, nextStage: KanbanStage) => void;
  isDragOver: boolean;
}) {
  const Icon = stage.icon;

  return (
    <div
      className={`flex flex-col rounded-2xl border-2 transition-all min-w-[240px] flex-1 ${
        isDragOver ? 'border-gray-400 bg-gray-100 scale-[1.01]' : stage.color
      }`}
      onDrop={e => onDrop(e, stage.id)}
      onDragOver={onDragOver}
    >
      {/* Column header */}
      <div className={`flex items-center justify-between px-3.5 py-3 rounded-t-xl ${stage.headerColor}`}>
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          <span className="text-sm font-bold">{stage.label}</span>
        </div>
        <span className="w-6 h-6 rounded-full bg-white/60 flex items-center justify-center text-xs font-bold">
          {candidates.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2.5 space-y-2.5 min-h-[120px]">
        {candidates.length === 0 && (
          <div className="flex items-center justify-center h-20 text-xs text-gray-400 italic">
            Drop here
          </div>
        )}
        {candidates.map(c => (
          <CandidateKanbanCard
            key={c.id}
            candidate={c}
            onDragStart={onDragStart}
            onAdvance={onAdvance}
            currentStage={stage.id}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CandidateKanbanPage() {
  const supabase = createClient();
  const [candidates, setCandidates] = useState<KanbanCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<KanbanStage | null>(null);
  const dragIdRef = useRef<string | null>(null);

  // Local stage overrides (so UI is instant even before DB saves)
  const [stageOverrides, setStageOverrides] = useState<Record<string, KanbanStage>>({});

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('candidate_profiles')
        .select('*')
        .order('interview_date', { ascending: false });
      if (err) throw err;
      setCandidates(data || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load candidates');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadCandidates(); }, [loadCandidates]);

  const getStage = (c: KanbanCandidate): KanbanStage => {
    return stageOverrides[c.id] ?? statusToStage(c.follow_up_status, c.overall_score);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    dragIdRef.current = id;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetStage: KanbanStage) => {
    e.preventDefault();
    setDragOverStage(null);
    const id = dragIdRef.current;
    if (!id) return;
    dragIdRef.current = null;

    // Optimistic update
    setStageOverrides(prev => ({ ...prev, [id]: targetStage }));

    // Persist
    const newStatus = stageToStatus(targetStage);
    await supabase.from('candidate_profiles').update({ follow_up_status: newStatus }).eq('id', id);
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, follow_up_status: newStatus } : c));
  };

  const handleAdvance = async (id: string, nextStage: KanbanStage) => {
    setStageOverrides(prev => ({ ...prev, [id]: nextStage }));
    const newStatus = stageToStatus(nextStage);
    await supabase.from('candidate_profiles').update({ follow_up_status: newStatus }).eq('id', id);
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, follow_up_status: newStatus } : c));
  };

  // Group candidates by stage
  const grouped: Record<KanbanStage, KanbanCandidate[]> = {
    submitted: [], interviewed: [], offered: [], hired: [], rejected: [],
  };
  for (const c of candidates) {
    grouped[getStage(c)].push(c);
  }

  // Aggregate counts
  const totalActive = candidates.filter(c => !['hired', 'rejected'].includes(getStage(c))).length;

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Kanban className="w-5 h-5 text-gray-700" />
              <h1 className="text-2xl font-bold text-gray-900">Candidate Pipeline</h1>
            </div>
            <p className="text-sm text-gray-500">Drag cards to advance stages · {candidates.length} total · {totalActive} active</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadCandidates}
              className="p-2 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4 text-gray-500" />
            </button>
            <Link
              href="/candidate-tracker"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Users className="w-4 h-4" />
              Tracker View
            </Link>
            <Link
              href="/teleprompter/interview"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Interview
            </Link>
          </div>
        </div>

        {/* Stage summary bar */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          {STAGES.map(stage => (
            <div key={stage.id} className={`rounded-xl border px-3 py-2.5 flex items-center gap-2.5 ${stage.color}`}>
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${stage.dotColor}`} />
              <div className="min-w-0">
                <p className="text-xs text-gray-500 truncate">{stage.label}</p>
                <p className="text-xl font-bold text-gray-900">{grouped[stage.id].length}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Board */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={loadCandidates} className="mt-3 text-xs font-semibold text-red-600 underline">Retry</button>
          </div>
        ) : candidates.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
            <Kanban className="w-10 h-10 text-gray-300 mx-auto mb-4" />
            <h3 className="text-base font-semibold text-gray-700 mb-1">No candidates yet</h3>
            <p className="text-sm text-gray-400 mb-5">Start an interview session to populate the pipeline.</p>
            <Link
              href="/teleprompter/interview"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Start First Interview
            </Link>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-4">
            {STAGES.map(stage => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                candidates={grouped[stage.id]}
                onDragStart={handleDragStart}
                onDrop={handleDrop}
                onDragOver={e => { handleDragOver(e); setDragOverStage(stage.id); }}
                onAdvance={handleAdvance}
                isDragOver={dragOverStage === stage.id}
              />
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
          <GripVertical className="w-3.5 h-3.5" />
          <span>Drag cards between columns to advance stages, or use the arrow button on each card</span>
        </div>
      </div>
    </AppLayout>
  );
}
