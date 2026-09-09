'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { ShieldCheck, FileText, Mail, Calendar, Clock, Download, Send, CheckCircle, RefreshCw, Lock, X, Plus } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportType = 'audit_log' | 'gdpr' | 'soc2' | 'combined';
type Cadence = 'weekly' | 'monthly' | 'quarterly';
type ReportStatus = 'ready' | 'generating' | 'sent' | 'scheduled';

interface ReportSchedule {
  id: string;
  name: string;
  type: ReportType;
  cadence: Cadence;
  nextRun: string;
  lastRun?: string;
  recipients: string[];
  enabled: boolean;
  includeAuditLog: boolean;
  includeGdpr: boolean;
  includeSoc2: boolean;
}

interface GeneratedReport {
  id: string;
  name: string;
  type: ReportType;
  generatedAt: string;
  period: string;
  size: string;
  status: ReportStatus;
  sentTo?: string[];
  controls: { pass: number; warn: number; fail: number };
}

interface ComplianceControl {
  id: string;
  framework: 'GDPR' | 'SOC2';
  control: string;
  description: string;
  status: 'pass' | 'warn' | 'fail';
  evidence: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const SCHEDULES: ReportSchedule[] = [
  {
    id: 'sch-001', name: 'Weekly Audit Digest', type: 'audit_log', cadence: 'weekly',
    nextRun: new Date(Date.now() + 3 * 86400000).toISOString(),
    lastRun: new Date(Date.now() - 4 * 86400000).toISOString(),
    recipients: ['admin@travlr.com', 'compliance@travlr.com'],
    enabled: true, includeAuditLog: true, includeGdpr: false, includeSoc2: false,
  },
  {
    id: 'sch-002', name: 'Monthly GDPR/SOC2 Report', type: 'combined', cadence: 'monthly',
    nextRun: new Date(Date.now() + 12 * 86400000).toISOString(),
    lastRun: new Date(Date.now() - 18 * 86400000).toISOString(),
    recipients: ['admin@travlr.com', 'legal@travlr.com', 'cto@travlr.com'],
    enabled: true, includeAuditLog: true, includeGdpr: true, includeSoc2: true,
  },
  {
    id: 'sch-003', name: 'Quarterly SOC2 Evidence Pack', type: 'soc2', cadence: 'quarterly',
    nextRun: new Date(Date.now() + 45 * 86400000).toISOString(),
    recipients: ['auditor@external.com', 'admin@travlr.com'],
    enabled: false, includeAuditLog: false, includeGdpr: false, includeSoc2: true,
  },
];

const REPORTS: GeneratedReport[] = [
  {
    id: 'rpt-001', name: 'Weekly Audit Digest — Aug 11–17', type: 'audit_log',
    generatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    period: 'Aug 11–17, 2026', size: '284 KB', status: 'sent',
    sentTo: ['admin@travlr.com', 'compliance@travlr.com'],
    controls: { pass: 0, warn: 0, fail: 0 },
  },
  {
    id: 'rpt-002', name: 'Monthly GDPR/SOC2 Report — July 2026', type: 'combined',
    generatedAt: new Date(Date.now() - 18 * 86400000).toISOString(),
    period: 'July 2026', size: '1.2 MB', status: 'sent',
    sentTo: ['admin@travlr.com', 'legal@travlr.com', 'cto@travlr.com'],
    controls: { pass: 11, warn: 2, fail: 1 },
  },
  {
    id: 'rpt-003', name: 'Monthly GDPR/SOC2 Report — June 2026', type: 'combined',
    generatedAt: new Date(Date.now() - 49 * 86400000).toISOString(),
    period: 'June 2026', size: '1.1 MB', status: 'sent',
    sentTo: ['admin@travlr.com', 'legal@travlr.com'],
    controls: { pass: 12, warn: 1, fail: 1 },
  },
];

const CONTROLS: ComplianceControl[] = [
  { id: 'g1', framework: 'GDPR', control: 'Art. 13 — Transparency', description: 'Privacy notice provided at data collection', status: 'pass', evidence: 'Privacy Policy page live at /privacy-policy' },
  { id: 'g2', framework: 'GDPR', control: 'Art. 17 — Right to Erasure', description: 'User data deletion workflow implemented', status: 'pass', evidence: 'Account deletion with audit trail in User Data Export page' },
  { id: 'g3', framework: 'GDPR', control: 'Art. 20 — Data Portability', description: 'Full data export available on request', status: 'pass', evidence: 'Admin-triggered export in User Data Export page' },
  { id: 'g4', framework: 'GDPR', control: 'Art. 30 — Records of Processing', description: 'Processing activities documented', status: 'warn', evidence: 'GDPR Data Processing Agreement exists; processing register incomplete' },
  { id: 'g5', framework: 'GDPR', control: 'Art. 32 — Security of Processing', description: 'Appropriate technical measures in place', status: 'pass', evidence: 'RLS policies, encrypted transport, session management' },
  { id: 'g6', framework: 'GDPR', control: 'Art. 33 — Breach Notification', description: 'Breach notification procedure documented', status: 'warn', evidence: 'Procedure not yet formally documented' },
  { id: 's1', framework: 'SOC2', control: 'CC6.1 — Logical Access', description: 'Access controls restrict unauthorized access', status: 'pass', evidence: 'RBAC with Owner/Team Lead/Agent/Analyst roles; RLS enforced' },
  { id: 's2', framework: 'SOC2', control: 'CC6.2 — Authentication', description: 'Multi-factor authentication available', status: 'pass', evidence: '2FA with TOTP and recovery codes in Session Management' },
  { id: 's3', framework: 'SOC2', control: 'CC6.3 — Authorization', description: 'Role-based permission matrix enforced', status: 'pass', evidence: '12-feature permission matrix in User Management' },
  { id: 's4', framework: 'SOC2', control: 'CC7.2 — Monitoring', description: 'System monitoring and alerting active', status: 'pass', evidence: 'Ops Monitoring dashboard with severity alerts' },
  { id: 's5', framework: 'SOC2', control: 'CC7.3 — Incident Response', description: 'Incident response procedures defined', status: 'warn', evidence: 'Incident timeline tracked; formal runbook not documented' },
  { id: 's6', framework: 'SOC2', control: 'CC8.1 — Change Management', description: 'Change management process in place', status: 'pass', evidence: 'Audit log captures all configuration and permission changes' },
  { id: 's7', framework: 'SOC2', control: 'A1.1 — Availability SLA', description: 'Uptime commitments defined and monitored', status: 'pass', evidence: 'System Health page with SLA bands; 99.9% API target' },
  { id: 's8', framework: 'SOC2', control: 'PI1.1 — Processing Integrity', description: 'Data processing is complete and accurate', status: 'pass', evidence: 'Enrichment sync health monitoring; dead-letter queue tracking' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function reportTypeLabel(t: ReportType) {
  if (t === 'audit_log') return 'Audit Log';
  if (t === 'gdpr') return 'GDPR';
  if (t === 'soc2') return 'SOC2';
  return 'Combined';
}

function reportTypeBadge(t: ReportType) {
  if (t === 'audit_log') return 'bg-slate-100 text-slate-700';
  if (t === 'gdpr') return 'bg-blue-100 text-blue-700';
  if (t === 'soc2') return 'bg-purple-100 text-purple-700';
  return 'bg-indigo-100 text-indigo-700';
}

function controlStatusBadge(s: ComplianceControl['status']) {
  if (s === 'pass') return 'bg-emerald-100 text-emerald-700';
  if (s === 'warn') return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

// ─── Generate Report Modal ────────────────────────────────────────────────────

function GenerateModal({ onClose, onGenerate }: { onClose: () => void; onGenerate: (name: string) => void }) {
  const [type, setType] = useState<ReportType>('combined');
  const [period, setPeriod] = useState('monthly');
  const [recipients, setRecipients] = useState('admin@travlr.com');
  const [sending, setSending] = useState(false);

  function handleGenerate() {
    setSending(true);
    setTimeout(() => {
      onGenerate(`${reportTypeLabel(type)} Report — ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`);
      setSending(false);
      onClose();
    }, 1200);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-800">Generate Compliance Report</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1.5">Report Type</label>
            <select value={type} onChange={e => setType(e.target.value as ReportType)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="audit_log">Audit Log Export</option>
              <option value="gdpr">GDPR Compliance Report</option>
              <option value="soc2">SOC2 Evidence Pack</option>
              <option value="combined">Combined GDPR + SOC2 + Audit Log</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1.5">Period</label>
            <select value={period} onChange={e => setPeriod(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
              <option value="weekly">Last 7 days</option>
              <option value="monthly">Last 30 days</option>
              <option value="quarterly">Last 90 days</option>
              <option value="ytd">Year to date</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1.5">Email Recipients (comma-separated)</label>
            <input value={recipients} onChange={e => setRecipients(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="admin@company.com, legal@company.com" />
          </div>
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <p className="text-xs text-slate-500">Report will be generated and emailed to all recipients. A copy is saved to report history.</p>
          </div>
        </div>
        <div className="flex gap-2 p-5 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">Cancel</button>
          <button onClick={handleGenerate} disabled={sending} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60">
            {sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? 'Generating…' : 'Generate & Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComplianceReportsPage() {
  const [tab, setTab] = useState<'overview' | 'schedules' | 'history' | 'controls'>('overview');
  const [showGenerate, setShowGenerate] = useState(false);
  const [reports, setReports] = useState<GeneratedReport[]>(REPORTS);
  const [schedules, setSchedules] = useState<ReportSchedule[]>(SCHEDULES);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [filterFramework, setFilterFramework] = useState<'all' | 'GDPR' | 'SOC2'>('all');

  const passCount = CONTROLS.filter(c => c.status === 'pass').length;
  const warnCount = CONTROLS.filter(c => c.status === 'warn').length;
  const failCount = CONTROLS.filter(c => c.status === 'fail').length;
  const score = Math.round((passCount / CONTROLS.length) * 100);

  function handleGenerated(name: string) {
    const newReport: GeneratedReport = {
      id: `rpt-${Date.now()}`, name, type: 'combined',
      generatedAt: new Date().toISOString(), period: 'Current month',
      size: '1.3 MB', status: 'sent',
      sentTo: ['admin@travlr.com'],
      controls: { pass: passCount, warn: warnCount, fail: failCount },
    };
    setReports(prev => [newReport, ...prev]);
  }

  function handleSendNow(id: string) {
    setSendingId(id);
    setTimeout(() => {
      setSendingId(null);
      setSentIds(prev => new Set([...prev, id]));
    }, 1200);
  }

  function toggleSchedule(id: string) {
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  }

  const filteredControls = filterFramework === 'all' ? CONTROLS : CONTROLS.filter(c => c.framework === filterFramework);

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'schedules', label: 'Schedules' },
    { id: 'history', label: 'Report History' },
    { id: 'controls', label: 'Compliance Controls' },
  ] as const;

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <ShieldCheck size={20} className="text-primary" />
              Compliance Reports
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Auto-generate and email GDPR/SOC2 audit reports on schedule or on demand</p>
          </div>
          <button
            onClick={() => setShowGenerate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} />
            Generate Report
          </button>
        </div>

        {/* Score strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-2xl font-bold text-primary">{score}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">Compliance Score</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-2xl font-bold text-emerald-600">{passCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Controls Passing</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-2xl font-bold text-amber-600">{warnCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Needs Review</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-2xl font-bold text-red-600">{failCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Failing</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              {/* GDPR */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center"><Lock size={14} className="text-blue-600" /></div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">GDPR Compliance</h3>
                    <p className="text-xs text-muted-foreground">EU Data Protection Regulation</p>
                  </div>
                </div>
                {CONTROLS.filter(c => c.framework === 'GDPR').map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <span className="text-xs text-foreground">{c.control}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${controlStatusBadge(c.status)}`}>
                      {c.status.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
              {/* SOC2 */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center"><ShieldCheck size={14} className="text-purple-600" /></div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">SOC2 Type II</h3>
                    <p className="text-xs text-muted-foreground">Trust Services Criteria</p>
                  </div>
                </div>
                {CONTROLS.filter(c => c.framework === 'SOC2').map(c => (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <span className="text-xs text-foreground">{c.control}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${controlStatusBadge(c.status)}`}>
                      {c.status.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {/* Next scheduled */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Calendar size={14} className="text-primary" />Upcoming Scheduled Reports</h3>
              <div className="space-y-2">
                {schedules.filter(s => s.enabled).map(s => (
                  <div key={s.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 flex-wrap gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.recipients.join(', ')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-foreground">Next: {fmt(s.nextRun)}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{s.cadence}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Schedules Tab */}
        {tab === 'schedules' && (
          <div className="space-y-3">
            {schedules.map(s => (
              <div key={s.id} className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-foreground">{s.name}</h3>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${reportTypeBadge(s.type)}`}>{reportTypeLabel(s.type)}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {s.enabled ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar size={11} />Next: {fmt(s.nextRun)}</span>
                      {s.lastRun && <span className="flex items-center gap-1"><Clock size={11} />Last: {fmt(s.lastRun)}</span>}
                      <span className="flex items-center gap-1"><Mail size={11} />{s.recipients.length} recipient{s.recipients.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="mt-2 flex gap-2 flex-wrap">
                      {s.includeAuditLog && <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">Audit Log</span>}
                      {s.includeGdpr && <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">GDPR</span>}
                      {s.includeSoc2 && <span className="text-[10px] bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">SOC2</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleSchedule(s.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${s.enabled ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}
                    >
                      {s.enabled ? 'Pause' : 'Enable'}
                    </button>
                    <button
                      onClick={() => handleSendNow(s.id)}
                      disabled={sendingId === s.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
                    >
                      {sendingId === s.id ? <RefreshCw size={11} className="animate-spin" /> : sentIds.has(s.id) ? <CheckCircle size={11} /> : <Send size={11} />}
                      {sendingId === s.id ? 'Sending…' : sentIds.has(s.id) ? 'Sent!' : 'Send Now'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* History Tab */}
        {tab === 'history' && (
          <div className="space-y-3">
            {reports.map(r => (
              <div key={r.id} className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileText size={14} className="text-muted-foreground shrink-0" />
                      <h3 className="text-sm font-semibold text-foreground">{r.name}</h3>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${reportTypeBadge(r.type)}`}>{reportTypeLabel(r.type)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                      <span>Period: {r.period}</span>
                      <span>Generated: {fmt(r.generatedAt)}</span>
                      <span>{r.size}</span>
                    </div>
                    {r.sentTo && r.sentTo.length > 0 && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Mail size={11} />
                        <span>Sent to: {r.sentTo.join(', ')}</span>
                      </div>
                    )}
                    {r.controls.pass + r.controls.warn + r.controls.fail > 0 && (
                      <div className="mt-2 flex gap-2">
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{r.controls.pass} pass</span>
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{r.controls.warn} warn</span>
                        {r.controls.fail > 0 && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{r.controls.fail} fail</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                      <Download size={11} />
                      Download
                    </button>
                    <button
                      onClick={() => handleSendNow(r.id)}
                      disabled={sendingId === r.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
                    >
                      {sendingId === r.id ? <RefreshCw size={11} className="animate-spin" /> : sentIds.has(r.id) ? <CheckCircle size={11} /> : <Send size={11} />}
                      {sendingId === r.id ? 'Sending…' : sentIds.has(r.id) ? 'Sent!' : 'Resend'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Controls Tab */}
        {tab === 'controls' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setFilterFramework('all')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filterFramework === 'all' ? 'bg-primary text-white' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}>All</button>
              <button onClick={() => setFilterFramework('GDPR')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filterFramework === 'GDPR' ? 'bg-blue-600 text-white' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}>GDPR</button>
              <button onClick={() => setFilterFramework('SOC2')} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filterFramework === 'SOC2' ? 'bg-purple-600 text-white' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}>SOC2</button>
            </div>
            <div className="space-y-2">
              {filteredControls.map(c => (
                <div key={c.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${c.framework === 'GDPR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{c.framework}</span>
                        <span className="text-sm font-semibold text-foreground">{c.control}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${controlStatusBadge(c.status)}`}>{c.status.toUpperCase()}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{c.description}</p>
                      <p className="text-xs text-foreground mt-1.5 bg-muted/50 rounded px-2 py-1">{c.evidence}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showGenerate && <GenerateModal onClose={() => setShowGenerate(false)} onGenerate={handleGenerated} />}
    </AppLayout>
  );
}
