'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Calendar, Plus, Clock, Video, User, CheckCircle, XCircle, ChevronLeft, ChevronRight, Mail, Edit3, Trash2, Bell, ExternalLink, RefreshCw, Search, Play, Check, X, CheckSquare, Square, Download, Send, Layers, BarChart2, Phone,  } from 'lucide-react';
import { INTERVIEW_ROLES } from '@/lib/interviewScripts';
import { AI_INTERVIEW_CONFIG } from '@/lib/interviewConfig';
import { detectBrowserTimeZone, formatInTimeZone, getTimeZoneAbbreviation, isoToLocalParts, localDateTimeToUtc } from '@/lib/interviewTimezone';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InterviewSession {
  id: string;
  candidate_id: string | null;
  candidate_name: string;
  role_id: string;
  role_title: string;
  scheduled_at: string;
  scheduled_local_date: string | null;
  scheduled_local_time: string | null;
  scheduled_timezone: string | null;
  duration_minutes: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'no_answer' | 'busy' | 'failed' | 'cancelled';
  zoom_link: string | null;
  notes: string;
  summary: string | null;
  transcript: string | null;
  ended_reason: string | null;
  duration_seconds: number | null;
  provider: string | null;
  started_at: string | null;
  ended_at: string | null;
  calendar_invite_sent: boolean;
  reminder_sent: boolean;
  candidate_email: string | null;
  candidate_profile_id: string | null;
  created_by: string | null;
  created_at: string;
}

const SCORECARD_COMPETENCY_LABELS: Array<{ key: string; label: string }> = [
  { key: 'vacation_rental_knowledge', label: 'Vacation Rental Knowledge' },
  { key: 'property_management_knowledge', label: 'Property Management' },
  { key: 'luxury_homeowner_communication', label: 'Luxury Homeowner Communication' },
  { key: 'outbound_calling_ability', label: 'Outbound Calling' },
  { key: 'consultative_sales', label: 'Consultative Sales' },
  { key: 'discovery_questioning', label: 'Discovery / Questioning' },
  { key: 'objection_handling', label: 'Objection Handling' },
  { key: 'closing_ability', label: 'Closing Ability' },
  { key: 'follow_up_discipline', label: 'Follow-Up Discipline' },
  { key: 'crm_pipeline_management', label: 'CRM / Pipeline Management' },
  { key: 'relationship_building', label: 'Relationship Building' },
  { key: 'professional_communication', label: 'Professional Communication' },
  { key: 'self_motivation', label: 'Self-Motivation' },
  { key: 'remote_work_discipline', label: 'Remote Work Discipline' },
  { key: 'coachability', label: 'Coachability' },
  { key: 'operational_understanding', label: 'Operational Understanding' },
  { key: 'business_development', label: 'Business Development' },
  { key: 'judgment', label: 'Judgment' },
  { key: 'organization', label: 'Organization' },
  { key: 'overall_fit', label: 'Overall Fit' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-700 border-blue-200', dot: 'bg-blue-500', icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500', icon: Play },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700 border-green-200', dot: 'bg-green-500', icon: CheckCircle },
  no_answer: { label: 'No Answer', color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500', icon: Phone },
  busy: { label: 'Busy', color: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500', icon: Phone },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500', icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-400', icon: XCircle },
};

const KNOWN_CANDIDATE_TIMEZONES: Record<string, string> = {
  'Kelli Winkel': 'America/New_York',
  'Caitlyn Sorrells': 'America/Chicago',
  'Karissa Crooks': 'America/New_York',
  'Jessica Thrasher': 'America/New_York',
  'Gina Mattivello': 'America/New_York',
  'Gina L. Mattivello': 'America/New_York',
  'Margo Johnson': 'America/New_York',
  'Darlene Ciao': 'America/Los_Angeles',
  'Brett Allen': 'America/New_York',
};

function candidateTimeZone(session: Pick<InterviewSession, 'candidate_name' | 'scheduled_timezone'>) {
  return session.scheduled_timezone || KNOWN_CANDIDATE_TIMEZONES[session.candidate_name] || detectBrowserTimeZone();
}

function formatDate(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
}
function formatTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
function formatDateTimeLocal(iso: string) {
  let d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function isUpcoming(iso: string) { return new Date(iso) > new Date(); }
function formatElapsed(startedAt: string | null, now: number) {
  if (!startedAt) return '00:00';
  const totalSeconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

// ─── Schedule Modal ───────────────────────────────────────────────────────────

function ScheduleModal({
  session,
  onClose,
  onSave,
}: {
  session: Partial<InterviewSession> | null;
  onClose: () => void;
  onSave: (data: Partial<InterviewSession>) => Promise<void>;
}) {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 60);
  const defaultDt = formatDateTimeLocal(now.toISOString());

  const [form, setForm] = useState({
    candidate_name: session?.candidate_name || '',
    role_id: session?.role_id || INTERVIEW_ROLES[0]?.value || '',
    role_title: session?.role_title || INTERVIEW_ROLES[0]?.label || '',
    scheduled_at: session?.scheduled_at ? formatDateTimeLocal(session.scheduled_at) : defaultDt,
    scheduled_local_date: session?.scheduled_local_date || (session?.scheduled_at ? isoToLocalParts(session.scheduled_at, session.scheduled_timezone || detectBrowserTimeZone()).date : defaultDt.slice(0, 10)),
    scheduled_local_time: session?.scheduled_local_time || (session?.scheduled_at ? isoToLocalParts(session.scheduled_at, session.scheduled_timezone || detectBrowserTimeZone()).time : defaultDt.slice(11, 16)),
    scheduled_timezone: session?.scheduled_timezone || detectBrowserTimeZone(),
    duration_minutes: session?.duration_minutes || AI_INTERVIEW_CONFIG.scheduledDurationMinutes,
    zoom_link: session?.zoom_link || '',
    candidate_email: session?.candidate_email || '',
    notes: session?.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const handleRoleChange = (roleId: string) => {
    const role = INTERVIEW_ROLES.find(r => r.value === roleId);
    setForm(f => ({ ...f, role_id: roleId, role_title: role?.label || roleId }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.candidate_name.trim()) { toast.error('Candidate name is required'); return; }
    setSaving(true);
    await onSave({
      ...form,
      scheduled_at: localDateTimeToUtc(form.scheduled_local_date, form.scheduled_local_time, form.scheduled_timezone),
      scheduled_local_date: form.scheduled_local_date,
      scheduled_local_time: form.scheduled_local_time,
      scheduled_timezone: form.scheduled_timezone,
      duration_minutes: Number(form.duration_minutes),
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{session?.id ? 'Edit Interview' : 'Schedule Interview'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-4 h-4 text-gray-500 dark:text-gray-300" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Candidate Name *</label>
            <input type="text" value={form.candidate_name} onChange={e => setForm(f => ({ ...f, candidate_name: e.target.value }))} placeholder="e.g. Alex Johnson" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Candidate Email</label>
            <input type="email" value={form.candidate_email} onChange={e => setForm(f => ({ ...f, candidate_email: e.target.value }))} placeholder="candidate@email.com" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Role</label>
            <select value={form.role_id} onChange={e => handleRoleChange(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300 bg-white dark:bg-gray-800">
              {INTERVIEW_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Candidate local date *</label>
              <input type="date" value={form.scheduled_local_date} onChange={e => setForm(f => ({ ...f, scheduled_local_date: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Candidate local time *</label>
              <input type="time" value={form.scheduled_local_time} onChange={e => setForm(f => ({ ...f, scheduled_local_time: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300" required />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Candidate timezone *</label>
            <select value={form.scheduled_timezone} onChange={e => setForm(f => ({ ...f, scheduled_timezone: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300 bg-white dark:bg-gray-800" required>
              {['America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York'].map(zone => <option key={zone} value={zone}>{zone}</option>)}
            </select>
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">This time is in the candidate's local timezone.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Duration (min)</label>
              <select value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: Number(e.target.value) }))} className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300 bg-white dark:bg-gray-800">
                {[25, 30, 45, 60, 75, 90].map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Zoom Meeting</label>
            <input type="url" value={form.zoom_link} onChange={e => setForm(f => ({ ...f, zoom_link: e.target.value }))} placeholder="Leave blank to create automatically" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300" />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">Paste an existing Zoom link, or leave this blank and TRAVLR will create one when you save.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Pre-interview notes..." className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 px-4 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {session?.id ? 'Save Changes' : 'Schedule Interview'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Batch Schedule Modal ─────────────────────────────────────────────────────

function BatchScheduleModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (rows: Partial<InterviewSession>[]) => Promise<void>;
}) {
  const [rows, setRows] = useState([
    { candidate_name: '', candidate_email: '', role_id: INTERVIEW_ROLES[0]?.value || '', scheduled_at: '', scheduled_local_date: '', scheduled_local_time: '', scheduled_timezone: detectBrowserTimeZone(), duration_minutes: AI_INTERVIEW_CONFIG.scheduledDurationMinutes },
    { candidate_name: '', candidate_email: '', role_id: INTERVIEW_ROLES[0]?.value || '', scheduled_at: '', scheduled_local_date: '', scheduled_local_time: '', scheduled_timezone: detectBrowserTimeZone(), duration_minutes: AI_INTERVIEW_CONFIG.scheduledDurationMinutes },
  ]);
  const [saving, setSaving] = useState(false);

  const updateRow = (i: number, field: string, value: string | number) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  };

  const addRow = () => setRows(prev => [...prev, { candidate_name: '', candidate_email: '', role_id: INTERVIEW_ROLES[0]?.value || '', scheduled_at: '', scheduled_local_date: '', scheduled_local_time: '', scheduled_timezone: detectBrowserTimeZone(), duration_minutes: AI_INTERVIEW_CONFIG.scheduledDurationMinutes }]);
  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const valid = rows.filter(r => r.candidate_name.trim() && r.scheduled_local_date && r.scheduled_local_time && r.scheduled_timezone);
    if (valid.length === 0) { toast.error('Add at least one valid interview'); return; }
    setSaving(true);
    const mapped = valid.map(r => ({
      ...r,
      role_title: INTERVIEW_ROLES.find(x => x.value === r.role_id)?.label || r.role_id,
      scheduled_at: localDateTimeToUtc(r.scheduled_local_date, r.scheduled_local_time, r.scheduled_timezone),
      duration_minutes: Number(r.duration_minutes),
    }));
    await onSave(mapped);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Batch Schedule Interviews</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Schedule multiple interviews at once</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X className="w-4 h-4 text-gray-500 dark:text-gray-300" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-3 mb-4">
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-start bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                <div className="col-span-3">
                  <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Candidate *</label>
                  <input type="text" value={row.candidate_name} onChange={e => updateRow(i, 'candidate_name', e.target.value)} placeholder="Name" className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300" />
                </div>
                <div className="col-span-3">
                  <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Email</label>
                  <input type="email" value={row.candidate_email} onChange={e => updateRow(i, 'candidate_email', e.target.value)} placeholder="email@example.com" className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Role</label>
                  <select value={row.role_id} onChange={e => updateRow(i, 'role_id', e.target.value)} className="w-full px-2.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300 bg-white dark:bg-gray-900">
                    {INTERVIEW_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Candidate local date/time *</label>
                  <input type="date" value={row.scheduled_local_date} onChange={e => updateRow(i, 'scheduled_local_date', e.target.value)} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300" />
                  <input type="time" value={row.scheduled_local_time} onChange={e => updateRow(i, 'scheduled_local_time', e.target.value)} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300 mt-1" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Candidate timezone</label>
                  <select value={row.scheduled_timezone} onChange={e => updateRow(i, 'scheduled_timezone', e.target.value)} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-xs bg-white dark:bg-gray-900">
                    {['America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York'].map(zone => <option key={zone} value={zone}>{zone.replace('America/', '')}</option>)}
                  </select>
                </div>
                <div className="col-span-1">
                  <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Min</label>
                  <select value={row.duration_minutes} onChange={e => updateRow(i, 'duration_minutes', Number(e.target.value))} className="w-full px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300 bg-white dark:bg-gray-900">
                    {[25, 30, 45, 60, 75, 90].map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="col-span-1 flex items-end justify-center pb-0.5">
                  <button type="button" onClick={() => removeRow(i)} disabled={rows.length <= 1} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-30">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={addRow} className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors mb-6">
            <Plus className="w-3.5 h-3.5" /> Add another row
          </button>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 px-4 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
              Schedule {rows.filter(r => r.candidate_name.trim() && r.scheduled_at).length} Interview{rows.filter(r => r.candidate_name.trim() && r.scheduled_at).length !== 1 ? 's' : ''}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Batch Action Bar ─────────────────────────────────────────────────────────

function BatchActionBar({
  selectedIds,
  sessions,
  onClearSelection,
  onBulkReminder,
  onBulkExport,
  onBulkStatusChange,
  onAutoArm,
  bulkReminderLoading,
}: {
  selectedIds: Set<string>;
  sessions: InterviewSession[];
  onClearSelection: () => void;
  onBulkReminder: () => void;
  onBulkExport: (format: 'csv' | 'json') => void;
  onBulkStatusChange: (status: InterviewSession['status']) => void;
  onAutoArm: () => void;
  bulkReminderLoading: boolean;
}) {
  const count = selectedIds.size;
  const selectedSessions = sessions.filter(s => selectedIds.has(s.id));
  const withEmail = selectedSessions.filter(s => s.candidate_email && !s.reminder_sent && s.status === 'scheduled').length;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-gray-900 text-white rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-4 min-w-[520px]">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">{count}</div>
        <span className="text-sm font-semibold">selected</span>
      </div>
      <div className="w-px h-5 bg-white/20" />
      <button
        onClick={onBulkReminder}
        disabled={bulkReminderLoading || withEmail === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors disabled:opacity-40"
      >
        {bulkReminderLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
        Send Reminders {withEmail > 0 ? `(${withEmail})` : ''}
      </button>
      <button
        onClick={onAutoArm}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-semibold transition-colors"
      >
        <Clock className="w-3.5 h-3.5" /> Queue AI Calls ({count})
      </button>
      <button
        onClick={() => onBulkExport('csv')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors"
      >
        <Download className="w-3.5 h-3.5" /> Export CSV
      </button>
      <button
        onClick={() => onBulkExport('json')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors"
      >
        <Download className="w-3.5 h-3.5" /> Export JSON
      </button>
      <div className="w-px h-5 bg-white/20" />
      <select
        onChange={e => { if (e.target.value) onBulkStatusChange(e.target.value as InterviewSession['status']); e.target.value = ''; }}
        defaultValue=""
        className="bg-white/10 text-white text-xs font-semibold rounded-lg px-2 py-1.5 border border-white/20 focus:outline-none cursor-pointer"
      >
        <option value="" disabled>Change Status…</option>
        <option value="scheduled">Scheduled</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <button onClick={onClearSelection} className="ml-auto p-1.5 rounded-lg hover:bg-white/10 transition-colors">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function StartInterviewChoiceModal({
  session,
  onClose,
}: {
  session: InterviewSession;
  onClose: () => void;
}) {
  const [startingAi, setStartingAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const teleprompterUrl = `/teleprompter/interview?role=${session.role_id}&candidate=${encodeURIComponent(session.candidate_name)}&session=${session.id}`;

  const startAiInterview = async () => {
    if (!session.candidate_id) {
      setError('This interview is not linked to a canonical candidate record yet. Apply the interview timezone migration before starting an AI interview.');
      return;
    }
    setStartingAi(true);
    setError(null);
    try {
      const response = await fetch('/api/vapi/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interviewId: session.id, candidateId: session.candidate_id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to start AI interview');
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to start AI interview');
    } finally {
      setStartingAi(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Start interview</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{session.candidate_name} · {session.role_title}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-300"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <Link href={teleprompterUrl} onClick={onClose} className="flex items-center gap-3 w-full rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <span className="w-9 h-9 rounded-lg bg-gray-900 text-white flex items-center justify-center"><Play className="w-4 h-4" /></span>
            <span className="text-left"><span className="block text-sm font-semibold text-gray-900 dark:text-white">Interview Mode</span><span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">Open the teleprompter and conduct the interview manually.</span></span>
          </Link>
          <button onClick={startAiInterview} disabled={startingAi} className="flex items-center gap-3 w-full rounded-xl border border-emerald-300 dark:border-emerald-800 p-4 text-left hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors disabled:opacity-60">
            <span className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center"><Phone className="w-4 h-4" /></span>
            <span><span className="block text-sm font-semibold text-gray-900 dark:text-white">AI Interview Assistant</span><span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">Call this candidate with Vapi using their stored resume context. Manual starts are allowed anytime.</span></span>
          </button>
        </div>
        {startingAi && <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-4">Starting AI interview...</p>}
        {error && <p className="text-xs text-red-600 dark:text-red-300 mt-4">{error}</p>}
      </div>
    </div>
  );
}

// ─── Session Details Modal ────────────────────────────────────────────────────

type Scorecard = {
  hire_recommendation: string | null;
  interviewer_notes: string | null;
  created_at: string;
} & Record<string, unknown>;

function SessionDetailsModal({
  session,
  onClose,
}: {
  session: InterviewSession;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (session.candidate_id) {
        const { data } = await supabase
          .from('candidate_scorecards')
          .select('*')
          .eq('candidate_id', session.candidate_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!cancelled) setScorecard((data as Scorecard) || null);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session.candidate_id]);

  const cfg = STATUS_CONFIG[session.status];
  const duration = session.duration_seconds
    ? `${Math.floor(session.duration_seconds / 60)}m ${session.duration_seconds % 60}s`
    : session.started_at && session.ended_at
      ? `${Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000)}m`
      : '—';

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 p-5 flex items-start justify-between gap-4 z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">{session.candidate_name}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{session.role_title}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold border ${cfg.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} /> {cfg.label}
              </span>
              {session.provider === 'VAPI' && <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">AI Interview · {duration}</span>}
              {session.ended_reason && <span className="text-[11px] text-gray-400 dark:text-gray-500">({session.ended_reason})</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-300"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-5">
          {session.summary && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">AI Interview Summary</h3>
              <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{session.summary}</p>
            </div>
          )}

          {session.notes && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Interview Notes</h3>
              <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{session.notes}</p>
            </div>
          )}

          {loading && <p className="text-xs text-gray-400 dark:text-gray-500">Loading scorecard…</p>}

          {scorecard && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Scorecard</h3>
                {scorecard.hire_recommendation && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200">{String(scorecard.hire_recommendation).replace('_', ' ')}</span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                {SCORECARD_COMPETENCY_LABELS.map(field => (
                  <div key={field.key} className="rounded-lg border border-gray-100 dark:border-gray-800 px-2.5 py-1.5">
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{field.label}</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{typeof scorecard[field.key] === 'number' ? String(scorecard[field.key]) : '—'}</p>
                  </div>
                ))}
              </div>
              {scorecard.interviewer_notes && (
                <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{scorecard.interviewer_notes}</p>
              )}
            </div>
          )}

          {!loading && !scorecard && !session.summary && (
            <p className="text-sm text-gray-400 dark:text-gray-500">No interview notes or scorecard are available for this session yet.</p>
          )}

          {session.transcript && (
            <div>
              <button onClick={() => setShowTranscript(v => !v)} className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                {showTranscript ? 'Hide Transcript' : 'Show Full Transcript'}
              </button>
              {showTranscript && (
                <p className="mt-2 text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto rounded-lg border border-gray-100 dark:border-gray-800 p-3">{session.transcript}</p>
              )}
            </div>
          )}

          <Link href="/interview-recordings" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            View audio recording / transcript <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Session Card ─────────────────────────────────────────────────────────────

function SessionCard({
  session,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
  onSendReminder,
  onStatusChange,
  onStart,
  onStopCall,
  onViewDetails,
  localTimeZone,
}: {
  session: InterviewSession;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSendReminder: () => void;
  onStatusChange: (status: InterviewSession['status']) => void;
  onStart: () => void;
  onStopCall: () => Promise<void>;
  onViewDetails: () => void;
  localTimeZone: string;
}) {
  const cfg = STATUS_CONFIG[session.status];
  const StatusIcon = cfg.icon;
  const upcoming = isUpcoming(session.scheduled_at);
  const sessionTimeZone = candidateTimeZone(session);
  const isTerminalStatus = ['completed', 'no_answer', 'busy', 'failed', 'cancelled'].includes(session.status);
  const [timerNow, setTimerNow] = useState(() => Date.now());

  useEffect(() => {
    if (session.status !== 'in_progress') return;
    const timer = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session.status]);

  return (
    <div
      className={`bg-white dark:bg-gray-900 rounded-2xl border p-4 hover:shadow-md transition-all cursor-pointer ${selected ? 'border-gray-900 dark:border-gray-300 ring-2 ring-gray-900/10 dark:ring-gray-300/20' : upcoming ? 'border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-800 opacity-80'}`}
      onClick={isTerminalStatus ? onViewDetails : onToggleSelect}
      title={isTerminalStatus ? 'Click to view interview details' : undefined}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="flex-shrink-0 mt-0.5" onClick={e => { e.stopPropagation(); onToggleSelect(); }}>
            {selected
              ? <CheckSquare className="w-4 h-4 text-gray-900 dark:text-white" />
              : <Square className="w-4 h-4 text-gray-300 dark:text-gray-600" />}
          </div>
          <div className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{session.candidate_name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{session.role_title}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold border flex-shrink-0 ${cfg.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>

      <div className="space-y-1.5 mb-3">
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <Calendar className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <span>Your local time: {formatDate(session.scheduled_at, localTimeZone)} at {formatTime(session.scheduled_at, localTimeZone)} {getTimeZoneAbbreviation(new Date(session.scheduled_at), localTimeZone)}</span>
        </div>
        {sessionTimeZone !== localTimeZone && (
          <div className="text-[11px] text-gray-500 dark:text-gray-300 pl-5">Candidate local: {session.scheduled_local_time || formatTime(session.scheduled_at, sessionTimeZone)} {getTimeZoneAbbreviation(new Date(session.scheduled_at), sessionTimeZone)} · {sessionTimeZone}</div>
        )}
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <Clock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <span>{AI_INTERVIEW_CONFIG.expectedDurationLabel}</span>
        </div>
        {session.zoom_link && (
          <div className="flex items-center gap-2 text-xs">
            <Video className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            <a href={session.zoom_link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline truncate flex items-center gap-1">
              Join Zoom <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
        {session.candidate_email && (
          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            <Mail className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
            <span className="truncate">{session.candidate_email}</span>
          </div>
        )}
      </div>

      {session.summary && (
        <div className="mb-3 rounded-lg border border-emerald-200 dark:border-emerald-900/70 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-1">AI interview summary</p>
          <p className="text-xs leading-relaxed text-gray-700 dark:text-gray-200 line-clamp-4">{session.summary}</p>
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        {session.reminder_sent && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
            <Check className="w-2.5 h-2.5" /> Reminder Sent
          </span>
        )}
        {session.calendar_invite_sent && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
            <Check className="w-2.5 h-2.5" /> Invite Sent
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
        {session.status === 'scheduled' && (
          <button
            onClick={onStart}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-semibold hover:bg-gray-800 transition-colors"
          >
            <Play className="w-3 h-3" /> Start
          </button>
        )}
        {session.status === 'in_progress' && (
          <button
            type="button"
            onClick={async () => {
              if (window.confirm('Stop this active interview call?')) await onStopCall();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-200 rounded-lg text-xs font-semibold"
            aria-label="Stop active interview call"
            title="Stop active call"
          >
            <span className="w-2 h-2 rounded-full bg-red-600 dark:bg-red-400 animate-pulse" /> ON CALL
            <span className="font-mono tabular-nums">{formatElapsed(session.started_at, timerNow)}</span>
            <span className="ml-1 border-l border-red-300 dark:border-red-700 pl-2">Stop Call</span>
          </button>
        )}
        {session.status === 'scheduled' && session.candidate_email && !session.reminder_sent && (
          <button onClick={onSendReminder} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <Bell className="w-3 h-3" /> Remind
          </button>
        )}
        {session.status === 'scheduled' && (
          <button onClick={() => onStatusChange('completed')} className="flex items-center gap-1.5 px-3 py-1.5 border border-green-200 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-50 transition-colors">
            <CheckCircle className="w-3 h-3" /> Done
          </button>
        )}
        {['completed', 'no_answer', 'busy', 'failed', 'cancelled'].includes(session.status) && (
          <button onClick={onViewDetails} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors">
            <Search className="w-3 h-3" /> View Details
          </button>
        )}
        <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-300">
          <Edit3 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-gray-400 hover:text-red-500">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Calendar Grid ────────────────────────────────────────────────────────────

function CalendarGrid({
  sessions,
  currentMonth,
  onDayClick,
  localTimeZone,
}: {
  sessions: InterviewSession[];
  currentMonth: Date;
  onDayClick: (date: Date) => void;
  localTimeZone: string;
}) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const sessionsByDay: Record<number, InterviewSession[]> = {};
  sessions.forEach(s => {
    let d = new Date(s.scheduled_at);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!sessionsByDay[day]) sessionsByDay[day] = [];
      sessionsByDay[day].push(s);
    }
  });

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="py-2 text-center text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-gray-50 dark:border-gray-800" />;
          const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
          const daySessions = sessionsByDay[day] || [];
          return (
            <div key={day} onClick={() => onDayClick(new Date(year, month, day))} className={`min-h-[80px] border-b border-r border-gray-50 dark:border-gray-800 p-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${isToday ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''}`}>
              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold mb-1 ${isToday ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'text-gray-600 dark:text-gray-300'}`}>{day}</span>
              <div className="space-y-0.5">
                {daySessions.slice(0, 2).map(s => (
                  <div key={s.id} className={`text-[10px] font-medium px-1.5 py-0.5 rounded truncate ${s.status === 'completed' ? 'bg-green-100 text-green-700' : s.status === 'cancelled' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-700'}`}>
                    {formatTime(s.scheduled_at, localTimeZone)} {s.candidate_name.split(' ')[0]}
                  </div>
                ))}
                {daySessions.length > 2 && <div className="text-[10px] text-gray-400 dark:text-gray-500 px-1">+{daySessions.length - 2} more</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InterviewCalendarPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [editingSession, setEditingSession] = useState<Partial<InterviewSession> | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [view, setView] = useState<'calendar' | 'list'>('list');
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'completed'>('upcoming');
  const [search, setSearch] = useState('');
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkReminderLoading, setBulkReminderLoading] = useState(false);
  const [startChoiceSession, setStartChoiceSession] = useState<InterviewSession | null>(null);
  const [detailsSession, setDetailsSession] = useState<InterviewSession | null>(null);
  const [localTimeZone, setLocalTimeZone] = useState(() => (
    typeof window === 'undefined' ? 'America/Denver' : detectBrowserTimeZone()
  ));
  const [localNow, setLocalNow] = useState(new Date());

  useEffect(() => {
    setLocalTimeZone(detectBrowserTimeZone());
    const timer = window.setInterval(() => setLocalNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const fetchSessions = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    const { data, error } = await supabase.from('interview_sessions').select('*').order('scheduled_at', { ascending: true });
    if (!error && data) setSessions(data as InterviewSession[]);
    if (showLoading) setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  useEffect(() => {
    const subscription = supabase
      .channel('interview_sessions_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'interview_sessions' },
        (payload) => {
          setSessions(prev => {
            const updated = [...prev];
            if (payload.eventType === 'INSERT') {
              updated.push(payload.new as InterviewSession);
            } else if (payload.eventType === 'UPDATE') {
              const index = updated.findIndex(s => s.id === payload.new.id);
              if (index >= 0) updated[index] = payload.new as InterviewSession;
            } else if (payload.eventType === 'DELETE') {
              return updated.filter(s => s.id !== payload.old.id);
            }
            return updated.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(subscription); };
  }, [supabase]);

  useEffect(() => {
    if (!sessions.some(session => session.status === 'in_progress')) return;
    const refreshTimer = window.setInterval(() => {
      fetchSessions(false);
    }, 15_000);
    return () => window.clearInterval(refreshTimer);
  }, [sessions, fetchSessions]);

  const createZoomMeeting = async (session: Partial<InterviewSession>) => {
    const response = await fetch('/api/interview/zoom/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candidateName: session.candidate_name,
        roleTitle: session.role_title,
        scheduledAt: session.scheduled_at,
        durationMinutes: session.duration_minutes,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to create Zoom meeting');
    return result.joinUrl as string;
  };

  const handleSave = async (formData: Partial<InterviewSession>) => {
    const dataToSave = { ...formData };

    const { data: candidate } = await supabase.from('candidates').select('id').eq('full_name', dataToSave.candidate_name || '').maybeSingle();
    if (candidate?.id) dataToSave.candidate_id = candidate.id;

    if (!dataToSave.zoom_link) {
      try {
        dataToSave.zoom_link = await createZoomMeeting(dataToSave);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to create Zoom meeting');
        return;
      }
    }

    if (editingSession?.id) {
      const { error } = await supabase.from('interview_sessions').update({ ...dataToSave, updated_at: new Date().toISOString() }).eq('id', editingSession.id);
      if (error) { toast.error('Failed to update session'); return; }
      toast.success('Interview updated');
    } else {
      const { error } = await supabase.from('interview_sessions').insert({ ...dataToSave, created_by: user?.id, status: 'scheduled' });
      if (error) { toast.error('Failed to schedule interview'); return; }
      toast.success('Interview scheduled with Zoom!');
    }
    setShowModal(false);
    setEditingSession(null);
    fetchSessions();
  };

  const handleBatchSave = async (rows: Partial<InterviewSession>[]) => {
    const inserts: Array<Partial<InterviewSession>> = [];
    try {
      for (const row of rows) {
        const { data: candidate } = await supabase.from('candidates').select('id').eq('full_name', row.candidate_name || '').maybeSingle();
        inserts.push({
          ...row,
          candidate_id: candidate?.id || null,
          zoom_link: row.zoom_link || await createZoomMeeting(row),
          created_by: user?.id,
          status: 'scheduled',
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create Zoom meetings');
      return;
    }
    const { error } = await supabase.from('interview_sessions').insert(inserts);
    if (error) { toast.error('Failed to batch schedule'); return; }
    toast.success(`${inserts.length} Zoom interview${inserts.length !== 1 ? 's' : ''} scheduled!`);
    setShowBatchModal(false);
    fetchSessions();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this interview session?')) return;
    await supabase.from('interview_sessions').delete().eq('id', id);
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    toast.success('Session deleted');
    fetchSessions();
  };

  const handleStatusChange = async (id: string, status: InterviewSession['status']) => {
    await supabase.from('interview_sessions').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    fetchSessions();
  };

  const handleStopCall = async (session: InterviewSession) => {
    const response = await fetch('/api/vapi/call/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interviewId: session.id }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(result.error || 'Unable to stop call');
      return;
    }
    toast.success('Call stopped');
    fetchSessions();
  };

  const handleSendReminder = async (session: InterviewSession) => {
    if (!session.candidate_email) { toast.error('No candidate email on file'); return; }
    setSendingReminder(session.id);
    try {
      const res = await fetch('/api/interview/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          candidateName: session.candidate_name,
          roleTitle: session.role_title,
          scheduledAt: session.scheduled_at,
          zoomLink: session.zoom_link,
          candidateEmail: session.candidate_email,
          interviewerName: user?.user_metadata?.full_name || 'Jen Wampole',
        }),
      });
      const data = await res.json();
      if (data.skipped) { toast.info('No email address — reminder skipped'); return; }
      if (!res.ok) throw new Error(data.error);
      await supabase.from('interview_sessions').update({ reminder_sent: true }).eq('id', session.id);
      toast.success('Reminder email sent!');
      fetchSessions();
    } catch (e: any) {
      toast.error(e.message || 'Failed to send reminder');
    } finally {
      setSendingReminder(null);
    }
  };

  // ─── Bulk Actions ──────────────────────────────────────────────────────────

  const filteredSessions = sessions.filter(s => {
    const matchSearch = !search || s.candidate_name.toLowerCase().includes(search.toLowerCase()) || s.role_title.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    // TEST is a permanent fixture for call verification — always treat it as upcoming, never completed.
    const isTestCandidate = s.candidate_name.trim().toUpperCase() === 'TEST';
    if (filter === 'upcoming') return isTestCandidate || s.status === 'scheduled' || s.status === 'in_progress';
    if (filter === 'completed') return !isTestCandidate && ['completed', 'no_answer', 'busy', 'failed', 'cancelled'].includes(s.status);
    return true;
  }).sort((first, second) => {
    const firstIsTest = first.candidate_name.trim().toUpperCase() === 'TEST';
    const secondIsTest = second.candidate_name.trim().toUpperCase() === 'TEST';
    if (firstIsTest !== secondIsTest) return firstIsTest ? 1 : -1;
    return new Date(first.scheduled_at).getTime() - new Date(second.scheduled_at).getTime();
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredSessions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSessions.map(s => s.id)));
    }
  };

  const handleBulkReminder = async () => {
    const targets = sessions.filter(s => selectedIds.has(s.id) && s.candidate_email && !s.reminder_sent && s.status === 'scheduled');
    if (targets.length === 0) { toast.info('No eligible sessions for reminders'); return; }
    setBulkReminderLoading(true);
    let sent = 0;
    for (const session of targets) {
      try {
        const res = await fetch('/api/interview/send-reminder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.id,
            candidateName: session.candidate_name,
            roleTitle: session.role_title,
            scheduledAt: session.scheduled_at,
            zoomLink: session.zoom_link,
            candidateEmail: session.candidate_email,
            interviewerName: user?.user_metadata?.full_name || 'Jen Wampole',
          }),
        });
        if (res.ok) {
          await supabase.from('interview_sessions').update({ reminder_sent: true }).eq('id', session.id);
          sent++;
        }
      } catch {}
    }
    setBulkReminderLoading(false);
    toast.success(`Sent ${sent} reminder${sent !== 1 ? 's' : ''}`);
    fetchSessions();
  };

  const handleBulkExport = (format: 'csv' | 'json') => {
    const selected = sessions.filter(s => selectedIds.has(s.id));
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'interview-scorecards.json'; a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = ['candidate_name', 'role_title', 'scheduled_at', 'duration_minutes', 'status', 'candidate_email', 'notes', 'reminder_sent', 'calendar_invite_sent'];
      const rows = selected.map(s => headers.map(h => JSON.stringify((s as any)[h] ?? '')).join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'interview-scorecards.csv'; a.click();
      URL.revokeObjectURL(url);
    }
    toast.success(`Exported ${selected.length} scorecard${selected.length !== 1 ? 's' : ''}`);
  };

  const handleBulkStatusChange = async (status: InterviewSession['status']) => {
    const ids = Array.from(selectedIds);
    await supabase.from('interview_sessions').update({ status, updated_at: new Date().toISOString() }).in('id', ids);
    toast.success(`Updated ${ids.length} session${ids.length !== 1 ? 's' : ''} to ${status}`);
    setSelectedIds(new Set());
    fetchSessions();
  };

  const handleAutoArm = async () => {
    const response = await fetch('/api/interviews/auto-arm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interviewIds: Array.from(selectedIds) }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { toast.error(result.error || 'Unable to queue interviews'); return; }
    toast.success(`${result.armed || 0} interview${result.armed === 1 ? '' : 's'} queued. Calls will start at each candidate's local time.`);
    setSelectedIds(new Set());
    fetchSessions();
  };

  const handleDayClick = (date: Date) => {
    const dt = new Date(date);
    dt.setHours(10, 0, 0, 0);
    setEditingSession({ scheduled_at: dt.toISOString() });
    setShowModal(true);
  };

  const upcomingCount = sessions.filter(s => s.status === 'scheduled').length;
  const completedCount = sessions.filter(s => s.status === 'completed').length;
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const allSelected = filteredSessions.length > 0 && selectedIds.size === filteredSessions.length;

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Interview Calendar</h1>
            <p className="text-sm text-gray-500 dark:text-gray-300 mt-0.5">Schedule, track, and manage candidate interviews</p>
            <p className="text-xs text-gray-400 dark:text-gray-400 mt-1">Your local time: {formatTime(localNow.toISOString(), localTimeZone)} {getTimeZoneAbbreviation(localNow, localTimeZone)} · {localTimeZone}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/hiring-analytics" className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <BarChart2 className="w-4 h-4" /> Analytics
            </Link>
            <Link href="/candidate-profiles" className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <User className="w-4 h-4" /> Profiles
            </Link>
            <Link href="/teleprompter/interview" className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <Play className="w-4 h-4" /> Interview Mode
            </Link>
            <button
              onClick={() => setShowBatchModal(true)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-xl text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Layers className="w-4 h-4" /> Batch Schedule
            </button>
            <button
              onClick={() => { setEditingSession(null); setShowModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-4 h-4" /> Schedule
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Upcoming', value: upcomingCount, icon: Clock, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Completed', value: completedCount, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Total', value: sessions.length, icon: Calendar, color: 'text-gray-600', bg: 'bg-gray-50' },
          ].map(stat => (
            <div key={stat.label} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-300">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* View Toggle + Filters */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
            {(['list', 'calendar'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${view === v ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                {v === 'list' ? 'List View' : 'Calendar View'}
              </button>
            ))}
          </div>
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
            {(['upcoming', 'completed', 'all'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${filter === f ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>{f}</button>
            ))}
          </div>
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search candidate or role..." className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-300" />
          </div>
          {view === 'list' && filteredSessions.length > 0 && (
            <button onClick={toggleSelectAll} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              {allSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
          )}
        </div>

        {/* Calendar View */}
        {view === 'calendar' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{monthName}</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="p-2 rounded-lg hover:bg-gray-100 transition-colors"><ChevronLeft className="w-4 h-4 text-gray-600" /></button>
                <button onClick={() => setCurrentMonth(new Date())} className="px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Today</button>
                <button onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="p-2 rounded-lg hover:bg-gray-100 transition-colors"><ChevronRight className="w-4 h-4 text-gray-600" /></button>
              </div>
            </div>
            <CalendarGrid sessions={sessions} currentMonth={currentMonth} onDayClick={handleDayClick} localTimeZone={localTimeZone} />
          </div>
        )}

        {/* List View */}
        {view === 'list' && (
          <div>
            {loading ? (
              <div className="flex items-center justify-center py-16"><RefreshCw className="w-6 h-6 text-gray-400 animate-spin" /></div>
            ) : filteredSessions.length === 0 ? (
              <div className="text-center py-16">
                <Calendar className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No interviews found</p>
                <p className="text-sm text-gray-400 mt-1">Schedule your first interview to get started</p>
                <button onClick={() => { setEditingSession(null); setShowModal(true); }} className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800 transition-colors">Schedule Interview</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredSessions.map(session => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    selected={selectedIds.has(session.id)}
                    onToggleSelect={() => toggleSelect(session.id)}
                    onEdit={() => { setEditingSession(session); setShowModal(true); }}
                    onDelete={() => handleDelete(session.id)}
                    onSendReminder={() => handleSendReminder(session)}
                    onStatusChange={(status) => handleStatusChange(session.id, status)}
                    onStart={() => setStartChoiceSession(session)}
                    onStopCall={() => handleStopCall(session)}
                    onViewDetails={() => setDetailsSession(session)}
                    localTimeZone={localTimeZone}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Batch Action Bar */}
      {selectedIds.size > 0 && (
        <BatchActionBar
          selectedIds={selectedIds}
          sessions={sessions}
          onClearSelection={() => setSelectedIds(new Set())}
          onBulkReminder={handleBulkReminder}
          onBulkExport={handleBulkExport}
          onBulkStatusChange={handleBulkStatusChange}
          onAutoArm={handleAutoArm}
          bulkReminderLoading={bulkReminderLoading}
        />
      )}

      {showModal && (
        <ScheduleModal
          session={editingSession}
          onClose={() => { setShowModal(false); setEditingSession(null); }}
          onSave={handleSave}
        />
      )}

      {showBatchModal && (
        <BatchScheduleModal
          onClose={() => setShowBatchModal(false)}
          onSave={handleBatchSave}
        />
      )}

      {startChoiceSession && (
        <StartInterviewChoiceModal
          session={startChoiceSession}
          onClose={() => { setStartChoiceSession(null); fetchSessions(); }}
        />
      )}

      {detailsSession && (
        <SessionDetailsModal
          session={detailsSession}
          onClose={() => setDetailsSession(null)}
        />
      )}
    </AppLayout>
  );
}
