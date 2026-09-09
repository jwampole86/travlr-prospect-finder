'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { User, Briefcase, Calendar, CheckCircle, XCircle, Clock, AlertTriangle, Phone, RefreshCw, Plus, Search, ChevronDown, Edit3, Star, TrendingUp, X, Save, Loader2, Play, Kanban,  } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrackerCandidate {
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

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TrackerCandidate['follow_up_status'], { label: string; color: string; icon: React.ElementType }> = {
  pending:   { label: 'Pending',   color: 'bg-gray-100 text-gray-600',    icon: Clock },
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-700',    icon: Calendar },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700',  icon: CheckCircle },
  rejected:  { label: 'Rejected',  color: 'bg-red-100 text-red-700',      icon: XCircle },
  hired:     { label: 'Hired 🎉',  color: 'bg-purple-100 text-purple-700', icon: Star },
};

const SCORE_CONFIG: Record<string, { label: string; color: string }> = {
  strong_yes: { label: 'Strong Yes', color: 'bg-green-100 text-green-700' },
  yes:        { label: 'Yes',        color: 'bg-emerald-100 text-emerald-700' },
  maybe:      { label: 'Maybe',      color: 'bg-amber-100 text-amber-700' },
  no:         { label: 'No',         color: 'bg-red-100 text-red-700' },
};

// Flagged concerns extracted from the 8 known candidates
const FLAGGED_CONCERNS: Record<string, string> = {
  candidate_kelli_winkel:    'Based in Florida — confirm remote logistics/time zone',
  candidate_brett_allen:     'Operations-heavy background vs. phone-first sales role',
  candidate_gina_mattivello: 'Limited luxury STR/homeowner-specific experience',
  candidate_karissa_crooks:  'Less high-volume outreach experience than top candidates',
  candidate_caitlyn_sorrells:'Operational/administrative background vs. BD-focused role',
  candidate_margo_johnson:   'Strong BD skillset but less luxury STR-specific experience',
  candidate_jessica_thrasher:'Phone outreach not clear primary strength',
  candidate_darlene_ciao:    'Not luxury real estate or STR-specific background',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Callback Scheduler Modal ─────────────────────────────────────────────────

function CallbackModal({
  candidate,
  onClose,
  onSave,
}: {
  candidate: TrackerCandidate;
  onClose: () => void;
  onSave: (id: string, callbackDate: string, callbackNotes: string) => Promise<void>;
}) {
  const [callbackDate, setCallbackDate] = useState(
    candidate.callback_date ? formatDateTimeLocal(candidate.callback_date) : ''
  );
  const [callbackNotes, setCallbackNotes] = useState(candidate.callback_notes || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(candidate.id, callbackDate, callbackNotes);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
              <Phone className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Schedule Callback</h2>
              <p className="text-xs text-gray-500">{candidate.candidate_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              Callback Date & Time
            </label>
            <input
              type="datetime-local"
              value={callbackDate}
              onChange={e => setCallbackDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              Reminder Notes
            </label>
            <textarea
              value={callbackNotes}
              onChange={e => setCallbackNotes(e.target.value)}
              rows={4}
              placeholder="Topics to cover, questions to ask, concerns to address…"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !callbackDate}
            className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Callback'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Notes Edit Modal ─────────────────────────────────────────────────────────

function NotesModal({
  candidate,
  onClose,
  onSave,
}: {
  candidate: TrackerCandidate;
  onClose: () => void;
  onSave: (id: string, notes: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState(candidate.notes || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(candidate.id, notes);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Interview Notes</h2>
            <p className="text-xs text-gray-500">{candidate.candidate_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <div className="p-5">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={8}
            placeholder="Key strengths, concerns, follow-up questions, compensation expectations…"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
          />
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Notes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Candidate Row ────────────────────────────────────────────────────────────

function CandidateRow({
  candidate,
  onScheduleCallback,
  onEditNotes,
  onUpdateStatus,
}: {
  candidate: TrackerCandidate;
  onScheduleCallback: (c: TrackerCandidate) => void;
  onEditNotes: (c: TrackerCandidate) => void;
  onUpdateStatus: (id: string, status: TrackerCandidate['follow_up_status']) => void;
}) {
  const [statusOpen, setStatusOpen] = useState(false);
  const statusCfg = STATUS_CONFIG[candidate.follow_up_status];
  const StatusIcon = statusCfg.icon;
  const flaggedConcern = FLAGGED_CONCERNS[candidate.role_id];
  const coveragePct = candidate.questions_total > 0
    ? Math.round((candidate.questions_covered / candidate.questions_total) * 100)
    : null;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      {/* Candidate */}
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-gray-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{candidate.candidate_name}</p>
            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
              <Briefcase className="w-3 h-3" />
              {candidate.role_title}
            </p>
          </div>
        </div>
      </td>

      {/* Status */}
      <td className="px-4 py-3.5">
        <div className="relative">
          <button
            onClick={() => setStatusOpen(x => !x)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity ${statusCfg.color}`}
          >
            <StatusIcon className="w-3 h-3" />
            {statusCfg.label}
            <ChevronDown className="w-3 h-3" />
          </button>
          {statusOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 min-w-[140px]">
              {(Object.keys(STATUS_CONFIG) as TrackerCandidate['follow_up_status'][]).map(s => (
                <button
                  key={s}
                  onClick={() => { onUpdateStatus(candidate.id, s); setStatusOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-gray-50 transition-colors ${candidate.follow_up_status === s ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}
                >
                  {STATUS_CONFIG[s].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </td>

      {/* Score */}
      <td className="px-4 py-3.5">
        {candidate.overall_score ? (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${SCORE_CONFIG[candidate.overall_score].color}`}>
            <TrendingUp className="w-2.5 h-2.5" />
            {SCORE_CONFIG[candidate.overall_score].label}
          </span>
        ) : (
          <span className="text-xs text-gray-400 italic">Not rated</span>
        )}
      </td>

      {/* Flagged Concern */}
      <td className="px-4 py-3.5 max-w-[200px]">
        {flaggedConcern ? (
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 leading-relaxed">{flaggedConcern}</p>
          </div>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      {/* Notes */}
      <td className="px-4 py-3.5 max-w-[180px]">
        <div className="flex items-start gap-1.5">
          {candidate.notes ? (
            <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed flex-1">{candidate.notes}</p>
          ) : (
            <span className="text-xs text-gray-300 italic">No notes</span>
          )}
          <button
            onClick={() => onEditNotes(candidate)}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
            title="Edit notes"
          >
            <Edit3 className="w-3 h-3 text-gray-400" />
          </button>
        </div>
      </td>

      {/* Callback */}
      <td className="px-4 py-3.5">
        {candidate.callback_date ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-blue-700 font-medium">
              <Calendar className="w-3 h-3" />
              {formatDate(candidate.callback_date)}
            </div>
            {candidate.callback_notes && (
              <p className="text-xs text-gray-500 line-clamp-1">{candidate.callback_notes}</p>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      {/* Coverage */}
      <td className="px-4 py-3.5 text-center">
        {coveragePct !== null ? (
          <div className="flex flex-col items-center gap-1">
            <span className="text-sm font-bold text-gray-700">{coveragePct}%</span>
            <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${coveragePct}%` }} />
            </div>
          </div>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </td>

      {/* Actions */}
      <td className="px-4 py-3.5">
        <button
          onClick={() => onScheduleCallback(candidate)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 transition-colors whitespace-nowrap"
        >
          <Phone className="w-3 h-3" />
          {candidate.callback_date ? 'Edit Callback' : 'Schedule Call'}
        </button>
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CandidateTrackerPage() {
  const supabase = createClient();
  const [candidates, setCandidates] = useState<TrackerCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [callbackModal, setCallbackModal] = useState<TrackerCandidate | null>(null);
  const [notesModal, setNotesModal] = useState<TrackerCandidate | null>(null);

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

  const handleUpdateStatus = async (id: string, status: TrackerCandidate['follow_up_status']) => {
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, follow_up_status: status } : c));
    await supabase.from('candidate_profiles').update({ follow_up_status: status }).eq('id', id);
  };

  const handleSaveCallback = async (id: string, callbackDate: string, callbackNotes: string) => {
    const isoDate = callbackDate ? new Date(callbackDate).toISOString() : null;
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, callback_date: isoDate, callback_notes: callbackNotes } : c));
    await supabase.from('candidate_profiles').update({ callback_date: isoDate, callback_notes: callbackNotes, follow_up_status: 'scheduled' }).eq('id', id);
  };

  const handleSaveNotes = async (id: string, notes: string) => {
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, notes } : c));
    await supabase.from('candidate_profiles').update({ notes }).eq('id', id);
  };

  const filtered = candidates.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.candidate_name.toLowerCase().includes(q) || c.role_title.toLowerCase().includes(q);
    const matchStatus = filterStatus === 'all' || c.follow_up_status === filterStatus;
    return matchSearch && matchStatus;
  });

  // Summary counts
  const counts = {
    total: candidates.length,
    scheduled: candidates.filter(c => c.follow_up_status === 'scheduled').length,
    hired: candidates.filter(c => c.follow_up_status === 'hired').length,
    rejected: candidates.filter(c => c.follow_up_status === 'rejected').length,
    withCallbacks: candidates.filter(c => c.callback_date).length,
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Candidate Tracker</h1>
            <p className="text-sm text-gray-500 mt-0.5">All candidates · interview status · flagged concerns · callback scheduling</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadCandidates} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors">
              <RefreshCw className="w-4 h-4 text-gray-500" />
            </button>
            <Link href="/candidate-kanban" className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
              <Kanban className="w-4 h-4" />
              Kanban View
            </Link>
            <Link href="/teleprompter/interview" className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors">
              <Plus className="w-4 h-4" />
              New Interview
            </Link>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Total',      value: counts.total,         color: 'text-gray-700' },
            { label: 'Scheduled',  value: counts.scheduled,     color: 'text-blue-600' },
            { label: 'Hired',      value: counts.hired,         color: 'text-purple-600' },
            { label: 'Rejected',   value: counts.rejected,      color: 'text-red-500' },
            { label: 'Callbacks',  value: counts.withCallbacks, color: 'text-green-600' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-2xl p-4">
              <p className="text-xs text-gray-500 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-5 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or role…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
            <option value="hired">Hired</option>
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={loadCandidates} className="mt-3 text-xs font-semibold text-red-600 underline">Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
            <User className="w-10 h-10 text-gray-300 mx-auto mb-4" />
            <h3 className="text-base font-semibold text-gray-700 mb-1">
              {candidates.length === 0 ? 'No candidates yet' : 'No results match your filters'}
            </h3>
            <p className="text-sm text-gray-400 mb-5">
              {candidates.length === 0 ? 'Start an interview session to populate this tracker.' : 'Try adjusting your search or filters.'}
            </p>
            {candidates.length === 0 && (
              <Link href="/teleprompter/interview" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors">
                <Play className="w-4 h-4" />
                Start First Interview
              </Link>
            )}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Candidate</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Score</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Flagged Concern</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Next Callback</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Coverage</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <CandidateRow
                      key={c.id}
                      candidate={c}
                      onScheduleCallback={setCallbackModal}
                      onEditNotes={setNotesModal}
                      onUpdateStatus={handleUpdateStatus}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
              {filtered.length} candidate{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {callbackModal && (
        <CallbackModal
          candidate={callbackModal}
          onClose={() => setCallbackModal(null)}
          onSave={handleSaveCallback}
        />
      )}
      {notesModal && (
        <NotesModal
          candidate={notesModal}
          onClose={() => setNotesModal(null)}
          onSave={handleSaveNotes}
        />
      )}
    </AppLayout>
  );
}
