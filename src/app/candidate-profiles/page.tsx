'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Search, Filter, User, CheckSquare, ChevronDown, Play, Star, Calendar, Briefcase, TrendingUp, CheckCircle, XCircle, AlertCircle, HelpCircle, Plus, RefreshCw, Mic, MessageSquare, MoreHorizontal, Edit3, Trash2, SortAsc, SortDesc } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CandidateProfile {
  id: string;
  candidate_name: string;
  role_id: string;
  role_title: string;
  interview_date: string;
  duration_seconds: number;
  overall_score: 'strong_yes' | 'yes' | 'maybe' | 'no' | null;
  notes: string;
  follow_up_status: 'pending' | 'scheduled' | 'completed' | 'rejected' | 'hired';
  questions_covered: number;
  questions_total: number;
  transcript: Array<{ speaker: string; text: string; timestamp: string }>;
  ai_suggestions: Array<{ text: string; timestamp: string }>;
  question_checklist: Array<{ id: string; question: string; completed: boolean }>;
  tags: string[];
  created_at: string;
  updated_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SCORE_CONFIG = {
  strong_yes: { label: 'Strong Yes', color: 'bg-green-100 text-green-800 border-green-200', dot: 'bg-green-500', icon: CheckCircle },
  yes: { label: 'Yes', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-400', icon: CheckCircle },
  maybe: { label: 'Maybe', color: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-400', icon: HelpCircle },
  no: { label: 'No', color: 'bg-red-100 text-red-800 border-red-200', dot: 'bg-red-500', icon: XCircle },
};

const FOLLOWUP_CONFIG = {
  pending: { label: 'Pending', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700 border-green-200' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700 border-red-200' },
  hired: { label: 'Hired 🎉', color: 'bg-purple-100 text-purple-700 border-purple-200' },
};

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Score Badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: CandidateProfile['overall_score'] }) {
  if (!score) return <span className="text-xs text-gray-400 italic">Not rated</span>;
  const cfg = SCORE_CONFIG[score];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Follow-up Badge ──────────────────────────────────────────────────────────

function FollowUpBadge({
  status,
  onChange,
}: {
  status: CandidateProfile['follow_up_status'];
  onChange: (s: CandidateProfile['follow_up_status']) => void;
}) {
  const [open, setOpen] = useState(false);
  const cfg = FOLLOWUP_CONFIG[status];
  const statuses = Object.keys(FOLLOWUP_CONFIG) as CandidateProfile['follow_up_status'][];

  return (
    <div className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(x => !x); }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border cursor-pointer hover:opacity-80 transition-opacity ${cfg.color}`}
      >
        {cfg.label}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 min-w-[140px]">
          {statuses.map(s => (
            <button
              key={s}
              onClick={e => { e.stopPropagation(); onChange(s); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-gray-50 transition-colors ${status === s ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}
            >
              {FOLLOWUP_CONFIG[s].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Candidate Card ───────────────────────────────────────────────────────────

function CandidateCard({
  profile,
  onUpdateFollowUp,
  onDelete,
  onViewPlayback,
}: {
  profile: CandidateProfile;
  onUpdateFollowUp: (id: string, status: CandidateProfile['follow_up_status']) => void;
  onDelete: (id: string) => void;
  onViewPlayback: (profile: CandidateProfile) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const transcriptCount = profile.transcript?.length || 0;
  const suggestionCount = profile.ai_suggestions?.length || 0;
  const coveragePct = profile.questions_total > 0
    ? Math.round((profile.questions_covered / profile.questions_total) * 100)
    : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-gray-300 hover:shadow-sm transition-all group">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-gray-500" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gray-900 truncate">{profile.candidate_name}</h3>
            <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
              <Briefcase className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{profile.role_title}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <ScoreBadge score={profile.overall_score} />
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(x => !x); }}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
            >
              <MoreHorizontal className="w-4 h-4 text-gray-400" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 min-w-[140px]">
                <button
                  onClick={() => { onViewPlayback(profile); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Play className="w-3.5 h-3.5" /> View Playback
                </button>
                <button
                  onClick={() => { onDelete(profile.id); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-50 rounded-xl p-2.5 text-center">
          <p className="text-xs text-gray-400 mb-0.5">Duration</p>
          <p className="text-sm font-bold text-gray-800">{formatDuration(profile.duration_seconds)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-2.5 text-center">
          <p className="text-xs text-gray-400 mb-0.5">Coverage</p>
          <p className="text-sm font-bold text-gray-800">{coveragePct}%</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-2.5 text-center">
          <p className="text-xs text-gray-400 mb-0.5">Exchanges</p>
          <p className="text-sm font-bold text-gray-800">{transcriptCount}</p>
        </div>
      </div>

      {/* Notes preview */}
      {profile.notes && (
        <div className="mb-4 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
          <p className="text-xs text-amber-800 line-clamp-2 leading-relaxed">{profile.notes}</p>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FollowUpBadge
            status={profile.follow_up_status}
            onChange={s => onUpdateFollowUp(profile.id, s)}
          />
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {formatDate(profile.interview_date)}
          </span>
        </div>
        <button
          onClick={() => onViewPlayback(profile)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 transition-colors"
        >
          <Play className="w-3 h-3" />
          Playback
        </button>
      </div>
    </div>
  );
}

// ─── Playback Modal ───────────────────────────────────────────────────────────

function PlaybackModal({
  profile,
  onClose,
  onUpdateNotes,
  onUpdateScore,
}: {
  profile: CandidateProfile;
  onClose: () => void;
  onUpdateNotes: (id: string, notes: string) => void;
  onUpdateScore: (id: string, score: CandidateProfile['overall_score']) => void;
}) {
  const [notes, setNotes] = useState(profile.notes || '');
  const [activeTab, setActiveTab] = useState<'transcript' | 'checklist' | 'suggestions' | 'notes'>('transcript');
  const [noteSaved, setNoteSaved] = useState(false);

  const handleSaveNotes = () => {
    onUpdateNotes(profile.id, notes);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2000);
  };

  const transcript = profile.transcript || [];
  const checklist = profile.question_checklist || [];
  const suggestions = profile.ai_suggestions || [];
  const completedChecklist = checklist.filter(q => q.completed).length;

  const scores: CandidateProfile['overall_score'][] = ['strong_yes', 'yes', 'maybe', 'no'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
              <User className="w-4.5 h-4.5 text-gray-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">{profile.candidate_name}</h2>
              <p className="text-xs text-gray-500">{profile.role_title} · {formatDate(profile.interview_date)} · {formatDuration(profile.duration_seconds)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Score selector */}
            <div className="flex gap-1.5">
              {scores.map(s => {
                const cfg = s ? SCORE_CONFIG[s] : null;
                if (!cfg) return null;
                return (
                  <button
                    key={s}
                    onClick={() => onUpdateScore(profile.id, s)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      profile.overall_score === s
                        ? cfg.color + 'ring-2 ring-offset-1 ring-gray-400' :'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <XCircle className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 flex-shrink-0 px-6">
          {[
            { key: 'transcript', label: 'Transcript', icon: MessageSquare, count: transcript.length },
            { key: 'checklist', label: 'Question Checklist', icon: CheckSquare, count: `${completedChecklist}/${checklist.length}` },
            { key: 'suggestions', label: 'AI Suggestions', icon: Star, count: suggestions.length },
            { key: 'notes', label: 'Notes', icon: Edit3, count: null },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-gray-900 text-gray-900' :'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.count !== null && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTab === tab.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Transcript */}
          {activeTab === 'transcript' && (
            <div className="space-y-3">
              {transcript.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Mic className="w-8 h-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No transcript recorded for this interview</p>
                </div>
              ) : (
                transcript.map((entry, i) => (
                  <div key={i} className={`flex gap-3 ${entry.speaker === 'Jen' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                      entry.speaker === 'Jen' ? 'bg-gray-900 text-white' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {entry.speaker === 'Jen' ? 'J' : 'C'}
                    </div>
                    <div className={`max-w-[75%] flex flex-col gap-1 ${entry.speaker === 'Jen' ? 'items-end' : 'items-start'}`}>
                      <div className={`flex items-center gap-2 ${entry.speaker === 'Jen' ? 'flex-row-reverse' : ''}`}>
                        <span className="text-xs font-semibold text-gray-500">{entry.speaker}</span>
                        <span className="text-xs text-gray-300">{entry.timestamp}</span>
                      </div>
                      <div className={`px-3 py-2 rounded-xl text-sm leading-relaxed ${
                        entry.speaker === 'Jen' ?'bg-gray-900 text-white rounded-tr-sm' :'bg-blue-50 text-gray-800 rounded-tl-sm'
                      }`}>
                        {entry.text}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Checklist */}
          {activeTab === 'checklist' && (
            <div className="space-y-2">
              {checklist.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <CheckSquare className="w-8 h-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No question checklist recorded</p>
                </div>
              ) : (
                checklist.map((item, i) => (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${
                    item.completed ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
                  }`}>
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      item.completed ? 'bg-green-500' : 'bg-gray-200'
                    }`}>
                      {item.completed && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <p className={`text-sm leading-relaxed ${item.completed ? 'text-green-800 line-through' : 'text-gray-700'}`}>
                      {item.question}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* AI Suggestions */}
          {activeTab === 'suggestions' && (
            <div className="space-y-3">
              {suggestions.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Star className="w-8 h-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No AI suggestions recorded</p>
                </div>
              ) : (
                suggestions.map((s, i) => (
                  <div key={i} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">AI Suggestion #{i + 1}</span>
                      <span className="text-[10px] text-gray-300">{s.timestamp}</span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{s.text}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Notes */}
          {activeTab === 'notes' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                  Interview Notes
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={10}
                  placeholder="Key strengths, concerns, follow-up questions, next steps, compensation expectations…"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none leading-relaxed"
                />
              </div>
              <button
                onClick={handleSaveNotes}
                className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  noteSaved
                    ? 'bg-green-600 text-white' :'bg-gray-900 text-white hover:bg-gray-800'
                }`}
              >
                {noteSaved ? '✓ Saved' : 'Save Notes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ profiles }: { profiles: CandidateProfile[] }) {
  const total = profiles.length;
  const hired = profiles.filter(p => p.follow_up_status === 'hired').length;
  const strongYes = profiles.filter(p => p.overall_score === 'strong_yes').length;
  const pending = profiles.filter(p => p.follow_up_status === 'pending').length;
  const avgCoverage = total > 0
    ? Math.round(profiles.reduce((acc, p) => acc + (p.questions_total > 0 ? (p.questions_covered / p.questions_total) * 100 : 0), 0) / total)
    : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {[
        { label: 'Total Candidates', value: total, icon: User, color: 'text-gray-700' },
        { label: 'Strong Yes', value: strongYes, icon: TrendingUp, color: 'text-green-600' },
        { label: 'Pending Follow-up', value: pending, icon: AlertCircle, color: 'text-amber-600' },
        { label: 'Avg Coverage', value: `${avgCoverage}%`, icon: CheckSquare, color: 'text-blue-600' },
      ].map(stat => (
        <div key={stat.label} className="bg-white border border-gray-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <stat.icon className={`w-4 h-4 ${stat.color}`} />
            <span className="text-xs text-gray-500">{stat.label}</span>
          </div>
          <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CandidateProfilesPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [profiles, setProfiles] = useState<CandidateProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterScore, setFilterScore] = useState<string>('all');
  const [filterFollowUp, setFilterFollowUp] = useState<string>('all');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'score'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [playbackProfile, setPlaybackProfile] = useState<CandidateProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('candidate_profiles')
        .select('*')
        .order('interview_date', { ascending: false });

      if (err) throw err;
      setProfiles(data || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  const handleUpdateFollowUp = async (id: string, status: CandidateProfile['follow_up_status']) => {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, follow_up_status: status } : p));
    await supabase.from('candidate_profiles').update({ follow_up_status: status }).eq('id', id);
  };

  const handleUpdateNotes = async (id: string, notes: string) => {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, notes } : p));
    if (playbackProfile?.id === id) setPlaybackProfile(prev => prev ? { ...prev, notes } : null);
    await supabase.from('candidate_profiles').update({ notes }).eq('id', id);
  };

  const handleUpdateScore = async (id: string, score: CandidateProfile['overall_score']) => {
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, overall_score: score } : p));
    if (playbackProfile?.id === id) setPlaybackProfile(prev => prev ? { ...prev, overall_score: score } : null);
    await supabase.from('candidate_profiles').update({ overall_score: score }).eq('id', id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this candidate profile? This cannot be undone.')) return;
    setProfiles(prev => prev.filter(p => p.id !== id));
    await supabase.from('candidate_profiles').delete().eq('id', id);
  };

  // Unique roles for filter
  const uniqueRoles = Array.from(new Set(profiles.map(p => p.role_title)));

  // Filter + sort
  const filtered = profiles
    .filter(p => {
      const q = search.toLowerCase();
      const matchSearch = !q || p.candidate_name.toLowerCase().includes(q) || p.role_title.toLowerCase().includes(q) || p.notes?.toLowerCase().includes(q);
      const matchScore = filterScore === 'all' || p.overall_score === filterScore || (filterScore === 'unrated' && !p.overall_score);
      const matchFollowUp = filterFollowUp === 'all' || p.follow_up_status === filterFollowUp;
      const matchRole = filterRole === 'all' || p.role_title === filterRole;
      return matchSearch && matchScore && matchFollowUp && matchRole;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') cmp = new Date(a.interview_date).getTime() - new Date(b.interview_date).getTime();
      else if (sortBy === 'name') cmp = a.candidate_name.localeCompare(b.candidate_name);
      else if (sortBy === 'score') {
        const order = { strong_yes: 4, yes: 3, maybe: 2, no: 1, null: 0 };
        cmp = (order[a.overall_score as keyof typeof order] || 0) - (order[b.overall_score as keyof typeof order] || 0);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('desc'); }
  };

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Candidate Profiles</h1>
            <p className="text-sm text-gray-500 mt-0.5">Interview records, scores, and follow-up tracking</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadProfiles}
              className="p-2 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4 text-gray-500" />
            </button>
            <Link
              href="/teleprompter/interview"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Interview
            </Link>
          </div>
        </div>

        {/* Stats */}
        {!loading && profiles.length > 0 && <StatsBar profiles={profiles} />}

        {/* Search + Filters */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-5">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, role, or notes…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              <select
                value={filterScore}
                onChange={e => setFilterScore(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
              >
                <option value="all">All Scores</option>
                <option value="strong_yes">Strong Yes</option>
                <option value="yes">Yes</option>
                <option value="maybe">Maybe</option>
                <option value="no">No</option>
                <option value="unrated">Not Rated</option>
              </select>

              <select
                value={filterFollowUp}
                onChange={e => setFilterFollowUp(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
                <option value="hired">Hired</option>
              </select>

              {uniqueRoles.length > 1 && (
                <select
                  value={filterRole}
                  onChange={e => setFilterRole(e.target.value)}
                  className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  <option value="all">All Roles</option>
                  {uniqueRoles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              )}

              <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                {(['date', 'name', 'score'] as const).map(field => (
                  <button
                    key={field}
                    onClick={() => toggleSort(field)}
                    className={`px-3 py-2.5 text-xs font-semibold flex items-center gap-1 transition-colors ${
                      sortBy === field ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {field.charAt(0).toUpperCase() + field.slice(1)}
                    {sortBy === field && (sortDir === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={loadProfiles} className="mt-3 text-xs font-semibold text-red-600 underline">Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
            <User className="w-10 h-10 text-gray-300 mx-auto mb-4" />
            <h3 className="text-base font-semibold text-gray-700 mb-1">
              {profiles.length === 0 ? 'No candidate profiles yet' : 'No results match your filters'}
            </h3>
            <p className="text-sm text-gray-400 mb-5">
              {profiles.length === 0
                ? 'Start an interview session to automatically save candidate profiles here.' :'Try adjusting your search or filters.'}
            </p>
            {profiles.length === 0 && (
              <Link
                href="/teleprompter/interview"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
              >
                <Play className="w-4 h-4" />
                Start First Interview
              </Link>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-3">{filtered.length} candidate{filtered.length !== 1 ? 's' : ''}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(profile => (
                <CandidateCard
                  key={profile.id}
                  profile={profile}
                  onUpdateFollowUp={handleUpdateFollowUp}
                  onDelete={handleDelete}
                  onViewPlayback={setPlaybackProfile}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Playback Modal */}
      {playbackProfile && (
        <PlaybackModal
          profile={playbackProfile}
          onClose={() => setPlaybackProfile(null)}
          onUpdateNotes={handleUpdateNotes}
          onUpdateScore={handleUpdateScore}
        />
      )}
    </AppLayout>
  );
}
