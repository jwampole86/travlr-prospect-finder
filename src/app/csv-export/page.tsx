'use client';

import React, { useState, useCallback, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Download, FileText, Users, MessageSquare, GitBranch, Megaphone, Filter, Loader2,
  CheckSquare, Square, ChevronDown, ChevronUp, AlertCircle, Mail, Clock, Calendar,
  Plus, Trash2, Play, CheckCircle, X, Send
} from 'lucide-react';
import { toast } from 'sonner';

type ExportType = 'leads' | 'campaigns' | 'sms_sends' | 'sequences';
type Cadence = 'daily' | 'weekly';

interface ExportConfig {
  type: ExportType;
  label: string;
  icon: React.ReactNode;
  description: string;
  columns: { key: string; label: string }[];
  color: string;
}

interface ScheduledExport {
  id: string;
  name: string;
  export_types: ExportType[];
  cadence: Cadence;
  send_time: string; // HH:MM
  day_of_week?: number; // 0=Sun, 1=Mon... (weekly only)
  recipient_emails: string[];
  portfolio: string;
  agent: string;
  active: boolean;
  last_sent?: string;
  next_send?: string;
}

const EXPORT_CONFIGS: ExportConfig[] = [
  {
    type: 'leads',
    label: 'Leads',
    icon: <Users size={16} />,
    description: 'All lead records with contact info, stage, score, and enrichment data',
    color: 'text-blue-600 bg-blue-500/10',
    columns: [
      { key: 'id', label: 'Lead ID' },
      { key: 'address', label: 'Address' },
      { key: 'city', label: 'City' },
      { key: 'state', label: 'State' },
      { key: 'zip', label: 'ZIP' },
      { key: 'contact_name', label: 'Contact Name' },
      { key: 'contact_phone', label: 'Phone' },
      { key: 'contact_email', label: 'Email' },
      { key: 'stage', label: 'Stage' },
      { key: 'prospect_score', label: 'Prospect Score' },
      { key: 'portfolio', label: 'Portfolio' },
      { key: 'assigned_agent', label: 'Assigned Agent' },
      { key: 'lead_source', label: 'Lead Source' },
      { key: 'opt_out', label: 'Opt-Out' },
      { key: 'created_at', label: 'Created At' },
      { key: 'updated_at', label: 'Updated At' },
    ],
  },
  {
    type: 'campaigns',
    label: 'Campaigns',
    icon: <Megaphone size={16} />,
    description: 'Follow-up sequence performance: sends, delivery rates, and lead progression per sequence',
    color: 'text-purple-600 bg-purple-500/10',
    columns: [
      { key: 'sequence_id', label: 'Sequence ID' },
      { key: 'sequence_name', label: 'Campaign / Sequence Name' },
      { key: 'portfolio', label: 'Portfolio' },
      { key: 'status', label: 'Status' },
      { key: 'total_sends', label: 'Total Sends' },
      { key: 'delivered', label: 'Delivered' },
      { key: 'failed', label: 'Failed' },
      { key: 'delivery_rate', label: 'Delivery Rate %' },
      { key: 'step_count', label: 'Steps' },
      { key: 'created_at', label: 'Created At' },
      { key: 'updated_at', label: 'Updated At' },
    ],
  },
  {
    type: 'sms_sends',
    label: 'SMS Performance',
    icon: <MessageSquare size={16} />,
    description: 'Individual SMS send records with Twilio status, error codes, and retry history',
    color: 'text-emerald-600 bg-emerald-500/10',
    columns: [
      { key: 'id', label: 'Record ID' },
      { key: 'lead_id', label: 'Lead ID' },
      { key: 'lead_name', label: 'Lead Name' },
      { key: 'phone', label: 'Phone' },
      { key: 'status', label: 'Status' },
      { key: 'twilio_message_sid', label: 'Twilio SID' },
      { key: 'error_code', label: 'Error Code' },
      { key: 'error_message', label: 'Error Message' },
      { key: 'retry_count', label: 'Retry Count' },
      { key: 'sequence_name', label: 'Sequence' },
      { key: 'agent_name', label: 'Agent' },
      { key: 'portfolio', label: 'Portfolio' },
      { key: 'template_label', label: 'Template' },
      { key: 'sent_at', label: 'Sent At' },
      { key: 'delivered_at', label: 'Delivered At' },
      { key: 'tcpa_opt_out_present', label: 'TCPA Opt-Out Present' },
    ],
  },
  {
    type: 'sequences',
    label: 'Sequences',
    icon: <GitBranch size={16} />,
    description: 'Follow-up sequence performance with step completion rates and lead progression',
    color: 'text-amber-600 bg-amber-500/10',
    columns: [
      { key: 'sequence_id', label: 'Sequence ID' },
      { key: 'sequence_name', label: 'Sequence Name' },
      { key: 'portfolio', label: 'Portfolio' },
      { key: 'agent_name', label: 'Agent' },
      { key: 'total_enrolled', label: 'Total Enrolled' },
      { key: 'active', label: 'Active' },
      { key: 'completed', label: 'Completed' },
      { key: 'dropped', label: 'Dropped' },
      { key: 'step_count', label: 'Steps' },
      { key: 'avg_completion_rate', label: 'Avg Completion %' },
      { key: 'link_clicks', label: 'Link Clicks' },
      { key: 'ctr', label: 'CTR %' },
      { key: 'created_at', label: 'Created At' },
    ],
  },
];

const PORTFOLIOS = ['All Portfolios', 'Colorado', 'California', 'Nevada', 'Washington', 'Texas', 'Florida'];
const AGENTS = ['All Agents', 'Sarah Chen', 'Marcus Webb', 'Priya Nair', 'Tom Okafor'];
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Map portfolio display name → state code used in leads table
const PORTFOLIO_TO_STATE: Record<string, string> = {
  Colorado: 'CO',
  California: 'CA',
  Nevada: 'NV',
  Washington: 'WA',
  Texas: 'TX',
  Florida: 'FL',
  Utah: 'UT',
  Maine: 'ME',
  Oregon: 'OR',
  Massachusetts: 'MA',
};

function downloadCSV(rows: Record<string, unknown>[], columns: string[], filename: string) {
  const header = columns.join(',');
  const body = rows.map((row) =>
    columns.map((col) => {
      const val = row[col] ?? '';
      const str = String(val).replace(/"/g, '""');
      return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
    }).join(',')
  ).join('\n');
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function getNextSendLabel(schedule: ScheduledExport): string {
  const now = new Date();
  const [h, m] = schedule.send_time.split(':').map(Number);
  if (schedule.cadence === 'daily') {
    const next = new Date(now);
    next.setHours(h, m, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return `Tomorrow at ${schedule.send_time}`;
  }
  const targetDay = schedule.day_of_week ?? 1;
  const daysUntil = (targetDay - now.getDay() + 7) % 7 || 7;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntil);
  next.setHours(h, m, 0, 0);
  return `${DAYS_OF_WEEK[targetDay]} at ${schedule.send_time}`;
}

interface ScheduleCardProps {
  schedule: ScheduledExport;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onSendNow: (schedule: ScheduledExport) => void;
  sending: boolean;
}

function ScheduleCard({ schedule, onDelete, onToggle, onSendNow, sending }: ScheduleCardProps) {
  return (
    <div className={`bg-card border rounded-xl p-4 transition-all ${schedule.active ? 'border-border' : 'border-border/50 opacity-60'}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground truncate">{schedule.name}</p>
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
              schedule.active ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${schedule.active ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'}`} />
              {schedule.active ? 'Active' : 'Paused'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {schedule.export_types.map(t => {
              const cfg = EXPORT_CONFIGS.find(c => c.type === t)!;
              return (
                <span key={t} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.color}`}>
                  {cfg.icon}
                  {cfg.label}
                </span>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onSendNow(schedule)}
            disabled={sending}
            title="Send now"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all disabled:opacity-50"
          >
            {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          </button>
          <button
            onClick={() => onToggle(schedule.id)}
            title={schedule.active ? 'Pause' : 'Resume'}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            {schedule.active ? <Clock size={13} /> : <Play size={13} />}
          </button>
          <button
            onClick={() => onDelete(schedule.id)}
            title="Delete"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Calendar size={11} />
          <span className="capitalize font-medium text-foreground">{schedule.cadence}</span>
          {schedule.cadence === 'weekly' && schedule.day_of_week !== undefined && (
            <span>· {DAYS_OF_WEEK[schedule.day_of_week]}</span>
          )}
          <span>@ {schedule.send_time}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Mail size={11} />
          <span className="truncate">{schedule.recipient_emails.slice(0, 2).join(', ')}{schedule.recipient_emails.length > 2 ? ` +${schedule.recipient_emails.length - 2}` : ''}</span>
        </div>
        {schedule.last_sent && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle size={11} className="text-emerald-500" />
            <span>Last: {new Date(schedule.last_sent).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </div>
        )}
        {schedule.active && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock size={11} className="text-primary" />
            <span>Next: {getNextSendLabel(schedule)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

interface NewScheduleFormProps {
  onSave: (s: Omit<ScheduledExport, 'id' | 'last_sent' | 'next_send'>) => void;
  onCancel: () => void;
}

function NewScheduleForm({ onSave, onCancel }: NewScheduleFormProps) {
  const [name, setName] = useState('Weekly Compliance Export');
  const [exportTypes, setExportTypes] = useState<Set<ExportType>>(new Set(['leads', 'sms_sends']));
  const [cadence, setCadence] = useState<Cadence>('weekly');
  const [sendTime, setSendTime] = useState('08:00');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [emailInput, setEmailInput] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [portfolio, setPortfolio] = useState('All Portfolios');
  const [agent, setAgent] = useState('All Agents');

  function addEmail() {
    const e = emailInput.trim().toLowerCase();
    if (!e || !e.includes('@')) { toast.error('Enter a valid email'); return; }
    if (emails.includes(e)) { toast.error('Email already added'); return; }
    setEmails(prev => [...prev, e]);
    setEmailInput('');
  }

  function toggleType(t: ExportType) {
    setExportTypes(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  function handleSave() {
    if (!name.trim()) { toast.error('Enter a schedule name'); return; }
    if (exportTypes.size === 0) { toast.error('Select at least one export type'); return; }
    if (emails.length === 0) { toast.error('Add at least one recipient email'); return; }
    onSave({
      name: name.trim(),
      export_types: Array.from(exportTypes),
      cadence,
      send_time: sendTime,
      day_of_week: cadence === 'weekly' ? dayOfWeek : undefined,
      recipient_emails: emails,
      portfolio,
      agent,
      active: true,
    });
  }

  return (
    <div className="bg-card border border-primary/30 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">New Scheduled Export</p>
        <button onClick={onCancel} className="p-1 rounded text-muted-foreground hover:text-foreground">
          <X size={14} />
        </button>
      </div>

      <div>
        <label className="text-[11px] font-medium text-muted-foreground block mb-1">Schedule Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="e.g. Weekly Compliance Export"
        />
      </div>

      <div>
        <label className="text-[11px] font-medium text-muted-foreground block mb-2">Export Types (select all that apply)</label>
        <div className="flex flex-wrap gap-2">
          {EXPORT_CONFIGS.map(cfg => (
            <button
              key={cfg.type}
              onClick={() => toggleType(cfg.type)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                exportTypes.has(cfg.type) ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {cfg.icon}
              {cfg.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Cadence</label>
          <select
            value={cadence}
            onChange={e => setCadence(e.target.value as Cadence)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        {cadence === 'weekly' && (
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">Day of Week</label>
            <select
              value={dayOfWeek}
              onChange={e => setDayOfWeek(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {DAYS_OF_WEEK.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Send Time</label>
          <input
            type="time"
            value={sendTime}
            onChange={e => setSendTime(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Portfolio Filter</label>
          <select
            value={portfolio}
            onChange={e => setPortfolio(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {PORTFOLIOS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground block mb-1">Agent Filter</label>
          <select
            value={agent}
            onChange={e => setAgent(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {AGENTS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="text-[11px] font-medium text-muted-foreground block mb-1">Recipient Emails</label>
        <div className="flex gap-2 mb-2">
          <input
            type="email"
            value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addEmail()}
            placeholder="compliance@company.com"
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={addEmail}
            className="px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-all"
          >
            Add
          </button>
        </div>
        {emails.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {emails.map(e => (
              <span key={e} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs text-foreground">
                {e}
                <button onClick={() => setEmails(prev => prev.filter(x => x !== e))} className="text-muted-foreground hover:text-red-500">
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all"
        >
          <Calendar size={14} />
          Save Schedule
        </button>
      </div>
    </div>
  );
}

export default function CSVExportPage() {
  const { user } = useAuth();
  const [selectedType, setSelectedType] = useState<ExportType>('leads');
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set(EXPORT_CONFIGS[0].columns.map(c => c.key)));
  const [portfolio, setPortfolio] = useState('All Portfolios');
  const [agent, setAgent] = useState('All Agents');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [colsExpanded, setColsExpanded] = useState(true);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'download' | 'scheduled'>('download');
  // Start with empty schedules — no hardcoded mock data
  const [schedules, setSchedules] = useState<ScheduledExport[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [sendingNowId, setSendingNowId] = useState<string | null>(null);

  const config = EXPORT_CONFIGS.find(c => c.type === selectedType)!;

  function selectType(type: ExportType) {
    setSelectedType(type);
    const cfg = EXPORT_CONFIGS.find(c => c.type === type)!;
    setSelectedColumns(new Set(cfg.columns.map(c => c.key)));
  }

  function toggleColumn(key: string) {
    setSelectedColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function selectAll() { setSelectedColumns(new Set(config.columns.map(c => c.key))); }
  function clearAll() { setSelectedColumns(new Set()); }

  const handleExport = useCallback(async () => {
    if (selectedColumns.size === 0) { toast.error('Select at least one column'); return; }
    setExporting(true);
    try {
      let rows: Record<string, unknown>[] = [];
      try {
        const supabase = createClient();
        if (selectedType === 'leads') {
          let query = supabase.from('leads').select('*');
          // Map portfolio name to state code for the leads table
          const stateCode = PORTFOLIO_TO_STATE[portfolio];
          if (portfolio !== 'All Portfolios' && stateCode) query = query.eq('state', stateCode);
          if (dateFrom) query = query.gte('created_at', dateFrom);
          if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59');
          const { data } = await query.limit(5000);
          if (data && data.length > 0) rows = data;
        } else if (selectedType === 'campaigns') {
          // Query follow_up_sequences as campaign data, joined with outreach_history counts
          let seqQuery = supabase
            .from('follow_up_sequences')
            .select('id, name, status, portfolio, step_count, created_at, updated_at')
            .order('created_at', { ascending: false })
            .limit(1000);
          if (portfolio !== 'All Portfolios') seqQuery = seqQuery.eq('portfolio', portfolio);
          if (dateFrom) seqQuery = seqQuery.gte('created_at', dateFrom);
          if (dateTo) seqQuery = seqQuery.lte('created_at', dateTo + 'T23:59:59');
          const { data: seqData } = await seqQuery;

          if (seqData && seqData.length > 0) {
            // Enrich with outreach_history counts per sequence
            const { data: outreachData } = await supabase
              .from('outreach_history')
              .select('template_id, status')
              .eq('channel', 'sms')
              .limit(5000);

            rows = seqData.map((seq: Record<string, unknown>) => {
              const seqOutreach = (outreachData || []).filter(
                (o: Record<string, unknown>) => o.template_id === seq.id
              );
              const total = seqOutreach.length;
              const delivered = seqOutreach.filter((o: Record<string, unknown>) => o.status === 'delivered').length;
              const failed = seqOutreach.filter((o: Record<string, unknown>) => o.status === 'failed' || o.status === 'bounced').length;
              const deliveryRate = total > 0 ? ((delivered / total) * 100).toFixed(1) : '0.0';

              return {
                sequence_id: seq.id,
                sequence_name: seq.name,
                portfolio: seq.portfolio || portfolio,
                status: seq.status,
                total_sends: total,
                delivered,
                failed,
                delivery_rate: deliveryRate,
                step_count: seq.step_count || 0,
                created_at: seq.created_at,
                updated_at: seq.updated_at,
              };
            });
          }
        } else if (selectedType === 'sms_sends') {
          const { data } = await supabase
            .from('outreach_history')
            .select('*')
            .eq('channel', 'sms')
            .order('sent_at', { ascending: false })
            .limit(5000);
          if (data && data.length > 0) rows = data;
        } else if (selectedType === 'sequences') {
          let seqQuery = supabase
            .from('follow_up_sequences')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1000);
          if (portfolio !== 'All Portfolios') seqQuery = seqQuery.eq('portfolio', portfolio);
          const { data } = await seqQuery;
          if (data && data.length > 0) rows = data;
        }
      } catch { /* fall through to empty */ }

      if (rows.length === 0) {
        // No data found — export empty file with headers only, do NOT inject mock rows
        const cols = Array.from(selectedColumns);
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `travlr_${selectedType}_export_${dateStr}.csv`;
        downloadCSV([], cols, filename);
        setRowCount(0);
        toast.info('No data found for the selected filters — exported empty file');
        setExporting(false);
        return;
      }

      const cols = Array.from(selectedColumns);
      const filtered = rows.map(row => {
        const out: Record<string, unknown> = {};
        cols.forEach(c => { out[c] = row[c] ?? ''; });
        return out;
      });

      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `travlr_${selectedType}_export_${dateStr}.csv`;
      downloadCSV(filtered, cols, filename);
      setRowCount(filtered.length);
      toast.success(`Exported ${filtered.length} rows as CSV`);
    } catch {
      toast.error('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }, [selectedType, selectedColumns, portfolio, agent, dateFrom, dateTo, user]);

  async function handleSendNow(schedule: ScheduledExport) {
    setSendingNowId(schedule.id);
    try {
      const supabase = createClient();
      // Fetch real leads data for the scheduled export — use state code filter
      let leadsQuery = supabase.from('leads').select('*').limit(500);
      if (schedule.portfolio && schedule.portfolio !== 'All Portfolios') {
        const stateCode = PORTFOLIO_TO_STATE[schedule.portfolio];
        if (stateCode) leadsQuery = leadsQuery.eq('state', stateCode);
      }
      const { data: leadsData } = await leadsQuery;
      const allRows = leadsData || [];
      const allCols = schedule.export_types.flatMap(t => EXPORT_CONFIGS.find(c => c.type === t)!.columns.map(c => c.key));
      const uniqueCols = Array.from(new Set(allCols));

      const res = await fetch('/api/send-scheduled-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId: schedule.id,
          scheduleName: schedule.name,
          leads: allRows,
          columns: uniqueCols,
          fileFormat: 'csv',
          recipientEmails: schedule.recipient_emails,
          frequency: schedule.cadence,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Export sent to ${schedule.recipient_emails.join(', ')}`);
        setSchedules(prev => prev.map(s => s.id === schedule.id ? { ...s, last_sent: new Date().toISOString() } : s));
      } else {
        toast.error(`Send failed: ${data.error}`);
      }
    } catch {
      toast.error('Failed to send export email');
    } finally {
      setSendingNowId(null);
    }
  }

  function handleAddSchedule(s: Omit<ScheduledExport, 'id' | 'last_sent' | 'next_send'>) {
    const newSchedule: ScheduledExport = { ...s, id: `sched-${Date.now()}` };
    setSchedules(prev => [newSchedule, ...prev]);
    setShowNewForm(false);
    toast.success(`Schedule "${s.name}" created`);
  }

  function handleDeleteSchedule(id: string) {
    setSchedules(prev => prev.filter(s => s.id !== id));
    toast.success('Schedule deleted');
  }

  function handleToggleSchedule(id: string) {
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
  }

  const activeCount = schedules.filter(s => s.active).length;

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
              <h1 className="text-base font-semibold text-foreground">CSV Export</h1>
              <p className="text-xs text-muted-foreground">Download or auto-send leads, campaigns, SMS performance, and sequences on a cadence</p>
            </div>
          </div>
          {activeTab === 'download' ? (
            <button
              onClick={handleExport}
              disabled={exporting || selectedColumns.size === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          ) : (
            <button
              onClick={() => setShowNewForm(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all"
            >
              <Plus size={14} />
              New Schedule
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 py-2 border-b border-border bg-card/50 shrink-0">
          <button
            onClick={() => setActiveTab('download')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'download' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Download size={12} />
            Manual Download
          </button>
          <button
            onClick={() => setActiveTab('scheduled')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'scheduled' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Mail size={12} />
            Auto-Send via Email
            {activeCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] font-bold">{activeCount} active</span>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'download' ? (
            <div className="max-w-4xl mx-auto space-y-5">
              {/* Export Type Selector */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Export Type</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {EXPORT_CONFIGS.map((cfg) => (
                    <button
                      key={cfg.type}
                      onClick={() => selectType(cfg.type)}
                      className={`flex flex-col gap-2 p-4 rounded-xl border-2 text-left transition-all ${
                        selectedType === cfg.type ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-border/80 hover:bg-muted/30'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.color}`}>
                        {cfg.icon}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{cfg.label}</p>
                        <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{cfg.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Filters */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Filter size={14} className="text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">Filters</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1.5">Portfolio</label>
                    <select value={portfolio} onChange={e => setPortfolio(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                      {PORTFOLIOS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1.5">Agent</label>
                    <select value={agent} onChange={e => setAgent(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                      {AGENTS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1.5">Date From</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-muted-foreground block mb-1.5">Date To</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                </div>
              </div>

              {/* Column Selector */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <button onClick={() => setColsExpanded(v => !v)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-muted-foreground" />
                    <p className="text-sm font-semibold text-foreground">Columns</p>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">{selectedColumns.size} / {config.columns.length}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={e => { e.stopPropagation(); selectAll(); }} className="text-[11px] text-primary hover:underline">Select all</button>
                    <button onClick={e => { e.stopPropagation(); clearAll(); }} className="text-[11px] text-muted-foreground hover:text-foreground hover:underline">Clear</button>
                    {colsExpanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                  </div>
                </button>
                {colsExpanded && (
                  <div className="px-5 pb-5 border-t border-border">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mt-4">
                      {config.columns.map((col) => {
                        const checked = selectedColumns.has(col.key);
                        return (
                          <button key={col.key} onClick={() => toggleColumn(col.key)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all ${checked ? 'border-primary/40 bg-primary/5' : 'border-border bg-background hover:bg-muted/30'}`}>
                            {checked ? <CheckSquare size={13} className="text-primary shrink-0" /> : <Square size={13} className="text-muted-foreground shrink-0" />}
                            <span className="text-[11px] font-medium text-foreground truncate">{col.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-700">Compliance Audit Use</p>
                  <p className="text-[11px] text-amber-600/80 mt-0.5">Exports include TCPA opt-out status and Twilio error codes. Filter by date range to scope exports for specific audit periods. All exports are logged in the Audit Trail.</p>
                </div>
              </div>

              {rowCount !== null && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                  <Download size={14} className="text-emerald-600 shrink-0" />
                  <p className="text-xs text-emerald-700 font-medium">Last export: <span className="font-bold">{rowCount} rows</span> downloaded successfully.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-5">
              {/* Auto-send info */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <Mail size={15} className="text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-blue-700">Auto-Send via Resend Email</p>
                  <p className="text-[11px] text-blue-600/80 mt-0.5">
                    Scheduled exports are sent automatically via Resend on your chosen cadence (daily or weekly). Each email includes the CSV as an attachment. Use for compliance records and external stakeholder updates.
                  </p>
                </div>
              </div>

              {/* New schedule form */}
              {showNewForm && (
                <NewScheduleForm
                  onSave={handleAddSchedule}
                  onCancel={() => setShowNewForm(false)}
                />
              )}

              {/* Schedule list */}
              {schedules.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Calendar size={24} className="text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No scheduled exports yet</p>
                  <button onClick={() => setShowNewForm(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-all">
                    <Plus size={14} />
                    Create First Schedule
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{schedules.length} Schedule{schedules.length !== 1 ? 's' : ''} · {activeCount} Active</p>
                  </div>
                  {schedules.map(schedule => (
                    <ScheduleCard
                      key={schedule.id}
                      schedule={schedule}
                      onDelete={handleDeleteSchedule}
                      onToggle={handleToggleSchedule}
                      onSendNow={handleSendNow}
                      sending={sendingNowId === schedule.id}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
