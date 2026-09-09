'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  loadExportSchedules,
  createExportSchedule,
  updateExportSchedule,
  deleteExportSchedule,
  ALL_EXPORT_COLUMNS,
  type ExportSchedule,
} from '@/lib/services/exportScheduleService';
import { Download, Plus, Trash2, Edit2, Mail, FileText, CheckSquare, Square, Loader2, Send, Calendar, ToggleLeft, ToggleRight, X, Save,  } from 'lucide-react';
import { toast } from 'sonner';

const FREQ_LABELS: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const FORMAT_LABELS: Record<string, string> = { csv: 'CSV', xlsx: 'XLSX' };

interface ScheduleFormState {
  name: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  file_format: 'csv' | 'xlsx';
  columns: string[];
  recipient_emails: string[];
  enabled: boolean;
}

const DEFAULT_FORM: ScheduleFormState = {
  name: '',
  frequency: 'weekly',
  file_format: 'csv',
  columns: ['address', 'city', 'stage', 'prospect_score', 'contact_name', 'contact_phone', 'estimated_net_monthly'],
  recipient_emails: [],
  enabled: true,
};

export default function ExportsPage() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<ExportSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ScheduleFormState>(DEFAULT_FORM);
  const [emailInput, setEmailInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [sendingNow, setSendingNow] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const data = await loadExportSchedules(user.id);
    setSchedules(data);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setEmailInput('');
    setShowModal(true);
  }

  function openEdit(s: ExportSchedule) {
    setEditingId(s.id);
    setForm({
      name: s.name,
      frequency: s.frequency,
      file_format: s.file_format,
      columns: s.columns,
      recipient_emails: s.recipient_emails,
      enabled: s.enabled,
    });
    setEmailInput('');
    setShowModal(true);
  }

  function toggleColumn(col: string) {
    setForm((f) => ({
      ...f,
      columns: f.columns.includes(col) ? f.columns.filter((c) => c !== col) : [...f.columns, col],
    }));
  }

  function addEmail() {
    const email = emailInput.trim().toLowerCase();
    if (!email || !email.includes('@')) { toast.error('Enter a valid email'); return; }
    if (form.recipient_emails.includes(email)) { toast.error('Email already added'); return; }
    setForm((f) => ({ ...f, recipient_emails: [...f.recipient_emails, email] }));
    setEmailInput('');
  }

  function removeEmail(email: string) {
    setForm((f) => ({ ...f, recipient_emails: f.recipient_emails.filter((e) => e !== email) }));
  }

  async function handleSave() {
    if (!user) return;
    if (!form.name.trim()) { toast.error('Schedule name is required'); return; }
    if (form.columns.length === 0) { toast.error('Select at least one column'); return; }
    if (form.recipient_emails.length === 0) { toast.error('Add at least one recipient email'); return; }
    setSaving(true);
    try {
      if (editingId) {
        await updateExportSchedule(editingId, form);
        toast.success('Schedule updated');
      } else {
        await createExportSchedule(user.id, form);
        toast.success('Schedule created');
      }
      setShowModal(false);
      load();
    } catch {
      toast.error('Failed to save schedule');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteExportSchedule(id);
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      toast.success('Schedule deleted');
    } catch {
      toast.error('Failed to delete');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggle(s: ExportSchedule) {
    await updateExportSchedule(s.id, { enabled: !s.enabled });
    setSchedules((prev) => prev.map((x) => x.id === s.id ? { ...x, enabled: !x.enabled } : x));
  }

  async function handleSendNow(s: ExportSchedule) {
    if (!user) return;
    setSendingNow(s.id);
    try {
      const supabase = createClient();
      // No LIMIT — export all leads for this user; UI pagination handles display
      const { data: leads } = await supabase.from('leads').select('*').eq('user_id', user.id);
      const rows = (leads || []).map((lead: Record<string, unknown>) => {
        const row: Record<string, unknown> = {};
        s.columns.forEach((col) => { row[col] = lead[col] ?? ''; });
        return row;
      });

      const res = await fetch('/api/send-scheduled-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId: s.id,
          scheduleName: s.name,
          leads: rows,
          columns: s.columns,
          fileFormat: s.file_format,
          recipientEmails: s.recipient_emails,
          frequency: s.frequency,
        }),
      });
      const result = await res.json();
      if (result.success) {
        await updateExportSchedule(s.id, { last_sent_at: new Date().toISOString() });
        setSchedules((prev) => prev.map((x) => x.id === s.id ? { ...x, last_sent_at: new Date().toISOString() } : x));
        toast.success(`Export sent to ${s.recipient_emails.length} recipient(s)`);
      } else {
        toast.error(result.error || 'Failed to send export');
      }
    } catch {
      toast.error('Failed to send export');
    } finally {
      setSendingNow(null);
    }
  }

  function formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Download size={16} className="text-primary" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-foreground">Scheduled Exports</h1>
              <p className="text-xs text-muted-foreground">Automate lead exports via email — daily, weekly, or monthly</p>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all"
          >
            <Plus size={14} />
            New Schedule
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : schedules.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-60 gap-4 text-center">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                <Calendar size={24} className="text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">No export schedules yet</p>
                <p className="text-xs text-muted-foreground mt-1">Create a schedule to automatically email lead exports to operators or external tools.</p>
              </div>
              <button
                onClick={openCreate}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all"
              >
                <Plus size={14} />
                Create First Schedule
              </button>
            </div>
          ) : (
            <div className="grid gap-4 max-w-4xl">
              {schedules.map((s) => (
                <div key={s.id} className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${s.enabled ? 'bg-primary/10' : 'bg-muted'}`}>
                        <FileText size={16} className={s.enabled ? 'text-primary' : 'text-muted-foreground'} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{s.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">{FREQ_LABELS[s.frequency]}</span>
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">{FORMAT_LABELS[s.file_format]}</span>
                          <span className="text-[11px] text-muted-foreground">{s.columns.length} columns</span>
                          <span className="text-[11px] text-muted-foreground">{s.recipient_emails.length} recipient{s.recipient_emails.length !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleToggle(s)}
                        title={s.enabled ? 'Disable' : 'Enable'}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {s.enabled ? <ToggleRight size={20} className="text-primary" /> : <ToggleLeft size={20} />}
                      </button>
                      <button
                        onClick={() => openEdit(s)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleSendNow(s)}
                        disabled={sendingNow === s.id}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-all disabled:opacity-50"
                        title="Send now"
                      >
                        {sendingNow === s.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                        Send Now
                      </button>
                      <button
                        onClick={() => handleDelete(s.id)}
                        disabled={deletingId === s.id}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-danger hover:bg-danger/5 transition-all"
                        title="Delete"
                      >
                        {deletingId === s.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground mb-0.5">Last sent</p>
                      <p className="font-medium text-foreground">{formatDate(s.last_sent_at)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">Next send</p>
                      <p className="font-medium text-foreground">{formatDate(s.next_send_at)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-0.5">Recipients</p>
                      <p className="font-medium text-foreground truncate">{s.recipient_emails.join(', ') || '—'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <h2 className="text-sm font-semibold text-foreground">
                {editingId ? 'Edit Export Schedule' : 'New Export Schedule'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
                <X size={16} />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">Schedule Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Weekly Operator Digest"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {/* Frequency + Format */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">Frequency</label>
                  <select
                    value={form.frequency}
                    onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as 'daily' | 'weekly' | 'monthly' }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1.5">File Format</label>
                  <select
                    value={form.file_format}
                    onChange={(e) => setForm((f) => ({ ...f, file_format: e.target.value as 'csv' | 'xlsx' }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="csv">CSV</option>
                    <option value="xlsx">XLSX</option>
                  </select>
                </div>
              </div>

              {/* Column selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-foreground">Columns to Export</label>
                  <span className="text-[11px] text-muted-foreground">{form.columns.length} selected</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {ALL_EXPORT_COLUMNS.map((col) => {
                    const selected = form.columns.includes(col.key);
                    return (
                      <button
                        key={col.key}
                        onClick={() => toggleColumn(col.key)}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all text-left ${
                          selected
                            ? 'bg-primary/10 border-primary/30 text-primary' :'bg-background border-border text-muted-foreground hover:border-primary/20 hover:text-foreground'
                        }`}
                      >
                        {selected ? <CheckSquare size={12} /> : <Square size={12} />}
                        {col.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Recipients */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">Recipient Emails</label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addEmail()}
                    placeholder="operator@example.com"
                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    onClick={addEmail}
                    className="px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-all"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                {form.recipient_emails.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {form.recipient_emails.map((email) => (
                      <span key={email} className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-xs text-foreground">
                        <Mail size={10} />
                        {email}
                        <button onClick={() => removeEmail(email)} className="text-muted-foreground hover:text-danger ml-0.5">
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Enabled toggle */}
              <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40 border border-border">
                <div>
                  <p className="text-xs font-medium text-foreground">Enable Schedule</p>
                  <p className="text-[11px] text-muted-foreground">Automatically send exports on the configured interval</p>
                </div>
                <button onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}>
                  {form.enabled ? <ToggleRight size={22} className="text-primary" /> : <ToggleLeft size={22} className="text-muted-foreground" />}
                </button>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editingId ? 'Save Changes' : 'Create Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
