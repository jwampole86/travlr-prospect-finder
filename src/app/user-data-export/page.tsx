'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { Download, Trash2, Search, User, RefreshCw, Shield, FileText, Database, MessageSquare, Mail, Zap, X } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

interface LeadRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  source: string;
  stage: string;
  score: number;
  createdAt: string;
  lastContact: string;
  interactions: number;
  enriched: boolean;
}

interface ExportJob {
  id: string;
  leadId: string;
  leadName: string;
  requestedBy: string;
  requestedAt: string;
  status: 'pending' | 'processing' | 'ready' | 'downloaded';
  includes: string[];
  size?: string;
  completedAt?: string;
}

interface DeletionRecord {
  id: string;
  leadId: string;
  leadName: string;
  email: string;
  requestedBy: string;
  requestedAt: string;
  status: 'pending_review' | 'approved' | 'deleted' | 'retained';
  retentionOverride?: string;
  retentionReason?: string;
  completedAt?: string;
  auditRef: string;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  target: string;
  details: string;
  severity: 'low' | 'medium' | 'high';
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const LEADS: LeadRecord[] = [
  { id: 'l-001', name: 'Marcus Johnson', email: 'marcus.j@email.com', phone: '(512) 555-0142', address: '4821 Oak Creek Dr, Austin TX 78701', source: 'Zillow', stage: 'Qualified', score: 87, createdAt: new Date(Date.now() - 45 * 86400000).toISOString(), lastContact: new Date(Date.now() - 2 * 86400000).toISOString(), interactions: 14, enriched: true },
  { id: 'l-002', name: 'Sarah Chen', email: 'schen@gmail.com', phone: '(303) 555-0287', address: '1920 Maple Ave, Denver CO 80203', source: 'Craigslist', stage: 'Contacted', score: 62, createdAt: new Date(Date.now() - 30 * 86400000).toISOString(), lastContact: new Date(Date.now() - 5 * 86400000).toISOString(), interactions: 6, enriched: true },
  { id: 'l-003', name: 'Robert Williams', email: 'rwilliams@outlook.com', phone: '(305) 555-0391', address: '7743 Biscayne Blvd, Miami FL 33138', source: 'Dwellsy', stage: 'New', score: 44, createdAt: new Date(Date.now() - 10 * 86400000).toISOString(), lastContact: new Date(Date.now() - 10 * 86400000).toISOString(), interactions: 1, enriched: false },
  { id: 'l-004', name: 'Jennifer Park', email: 'jpark@yahoo.com', phone: '(512) 555-0518', address: '2234 South Congress Ave, Austin TX 78704', source: 'Rent.com', stage: 'Proposal Sent', score: 91, createdAt: new Date(Date.now() - 60 * 86400000).toISOString(), lastContact: new Date(Date.now() - 1 * 86400000).toISOString(), interactions: 22, enriched: true },
  { id: 'l-005', name: 'David Torres', email: 'dtorres@email.com', phone: '(303) 555-0674', address: '5501 Colfax Ave, Denver CO 80220', source: 'Zillow', stage: 'Closed', score: 78, createdAt: new Date(Date.now() - 90 * 86400000).toISOString(), lastContact: new Date(Date.now() - 20 * 86400000).toISOString(), interactions: 31, enriched: true },
];

const EXPORT_JOBS: ExportJob[] = [
  { id: 'exp-001', leadId: 'l-004', leadName: 'Jennifer Park', requestedBy: 'admin@travlr.com', requestedAt: new Date(Date.now() - 2 * 3600000).toISOString(), status: 'ready', includes: ['Lead Record', 'Interactions', 'Enrichment Logs', 'SMS History', 'Email History'], size: '48 KB', completedAt: new Date(Date.now() - 1.5 * 3600000).toISOString() },
  { id: 'exp-002', leadId: 'l-005', leadName: 'David Torres', requestedBy: 'admin@travlr.com', requestedAt: new Date(Date.now() - 5 * 86400000).toISOString(), status: 'downloaded', includes: ['Lead Record', 'Interactions', 'Enrichment Logs'], size: '62 KB', completedAt: new Date(Date.now() - 5 * 86400000 + 3600000).toISOString() },
];

const DELETIONS: DeletionRecord[] = [
  { id: 'del-001', leadId: 'l-003', leadName: 'Robert Williams', email: 'rwilliams@outlook.com', requestedBy: 'admin@travlr.com', requestedAt: new Date(Date.now() - 3 * 86400000).toISOString(), status: 'pending_review', auditRef: 'AUD-2026-0814-001' },
  { id: 'del-002', leadId: 'l-xxx', leadName: 'Alice Nguyen', email: 'anguyen@email.com', requestedBy: 'admin@travlr.com', requestedAt: new Date(Date.now() - 10 * 86400000).toISOString(), status: 'retained', retentionOverride: 'Legal Hold', retentionReason: 'Active litigation — data must be preserved per counsel instruction', auditRef: 'AUD-2026-0808-003' },
  { id: 'del-003', leadId: 'l-yyy', leadName: 'Tom Bradley', email: 'tbradley@email.com', requestedBy: 'admin@travlr.com', requestedAt: new Date(Date.now() - 20 * 86400000).toISOString(), status: 'deleted', completedAt: new Date(Date.now() - 19 * 86400000).toISOString(), auditRef: 'AUD-2026-0729-007' },
];

const AUDIT_ENTRIES: AuditEntry[] = [
  { id: 'a1', timestamp: new Date(Date.now() - 2 * 3600000).toISOString(), action: 'DATA_EXPORT_REQUESTED', actor: 'admin@travlr.com', target: 'Jennifer Park (l-004)', details: 'Full lead record export requested — includes interactions, enrichment logs, SMS/email history', severity: 'medium' },
  { id: 'a2', timestamp: new Date(Date.now() - 2 * 3600000 + 1800000).toISOString(), action: 'DATA_EXPORT_READY', actor: 'system', target: 'Jennifer Park (l-004)', details: 'Export package generated (48 KB). Available for download.', severity: 'low' },
  { id: 'a3', timestamp: new Date(Date.now() - 3 * 86400000).toISOString(), action: 'DELETION_REQUESTED', actor: 'admin@travlr.com', target: 'Robert Williams (l-003)', details: 'Account deletion requested. Pending compliance review.', severity: 'high' },
  { id: 'a4', timestamp: new Date(Date.now() - 10 * 86400000).toISOString(), action: 'DELETION_RETAINED', actor: 'admin@travlr.com', target: 'Alice Nguyen (l-xxx)', details: 'Deletion overridden — Legal Hold applied. Reason: Active litigation.', severity: 'high' },
  { id: 'a5', timestamp: new Date(Date.now() - 19 * 86400000).toISOString(), action: 'ACCOUNT_DELETED', actor: 'admin@travlr.com', target: 'Tom Bradley (l-yyy)', details: 'All lead data permanently deleted. Audit ref: AUD-2026-0729-007.', severity: 'high' },
  { id: 'a6', timestamp: new Date(Date.now() - 5 * 86400000).toISOString(), action: 'DATA_EXPORT_DOWNLOADED', actor: 'admin@travlr.com', target: 'David Torres (l-005)', details: 'Export package downloaded by admin@travlr.com', severity: 'medium' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function severityBadge(s: AuditEntry['severity']) {
  if (s === 'high') return 'bg-red-100 text-red-700';
  if (s === 'medium') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-600';
}

function deletionStatusBadge(s: DeletionRecord['status']) {
  if (s === 'deleted') return 'bg-red-100 text-red-700';
  if (s === 'approved') return 'bg-emerald-100 text-emerald-700';
  if (s === 'retained') return 'bg-amber-100 text-amber-700';
  return 'bg-blue-100 text-blue-700';
}

function deletionStatusLabel(s: DeletionRecord['status']) {
  if (s === 'deleted') return 'Deleted';
  if (s === 'approved') return 'Approved';
  if (s === 'retained') return 'Retained (Override)';
  return 'Pending Review';
}

// ─── Export Modal ─────────────────────────────────────────────────────────────

function ExportModal({ lead, onClose, onExport }: { lead: LeadRecord; onClose: () => void; onExport: () => void }) {
  const [includes, setIncludes] = useState({
    lead_record: true,
    interactions: true,
    enrichment_logs: true,
    sms_history: true,
    email_history: true,
    cadence_history: false,
  });
  const [exporting, setExporting] = useState(false);

  const options = [
    { key: 'lead_record', label: 'Lead Record', icon: User, desc: 'Name, contact, address, score, stage' },
    { key: 'interactions', label: 'Interaction Log', icon: MessageSquare, desc: 'All calls, notes, and touchpoints' },
    { key: 'enrichment_logs', label: 'Enrichment Logs', icon: Database, desc: 'SalesGenie enrichment history' },
    { key: 'sms_history', label: 'SMS History', icon: MessageSquare, desc: 'All inbound/outbound SMS messages' },
    { key: 'email_history', label: 'Email History', icon: Mail, desc: 'All sent emails and open/click events' },
    { key: 'cadence_history', label: 'Cadence History', icon: Zap, desc: 'Sequence steps and delivery status' },
  ] as const;

  function handleExport() {
    setExporting(true);
    setTimeout(() => {
      setExporting(false);
      onExport();
      onClose();
    }, 1400);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-slate-800">Export Lead Data</h3>
            <p className="text-xs text-slate-500 mt-0.5">{lead.name} — {lead.email}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-2">
          <p className="text-xs font-medium text-slate-600 mb-3">Select data to include in export:</p>
          {options.map(opt => {
            const Icon = opt.icon;
            return (
              <label key={opt.key} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={includes[opt.key]}
                  onChange={e => setIncludes(prev => ({ ...prev, [opt.key]: e.target.checked }))}
                  className="rounded border-slate-300 text-primary"
                />
                <Icon size={14} className="text-slate-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700">{opt.label}</p>
                  <p className="text-xs text-slate-400">{opt.desc}</p>
                </div>
              </label>
            );
          })}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
            <p className="text-xs text-blue-700 flex items-start gap-1.5"><Shield size={11} className="mt-0.5 shrink-0" />Export is logged in the audit trail with timestamp, actor, and data scope.</p>
          </div>
        </div>
        <div className="flex gap-2 p-5 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">Cancel</button>
          <button onClick={handleExport} disabled={exporting} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60">
            {exporting ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
            {exporting ? 'Generating…' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Modal ─────────────────────────────────────────────────────────────

function DeleteModal({ lead, onClose, onDelete }: { lead: LeadRecord; onClose: () => void; onDelete: (override?: string, reason?: string) => void }) {
  const [useOverride, setUseOverride] = useState(false);
  const [overrideType, setOverrideType] = useState('Legal Hold');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function handleDelete() {
    setDeleting(true);
    setTimeout(() => {
      setDeleting(false);
      onDelete(useOverride ? overrideType : undefined, useOverride ? reason : undefined);
      onClose();
    }, 1200);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-red-700 flex items-center gap-2"><Trash2 size={16} />Delete Account Data</h3>
            <p className="text-xs text-slate-500 mt-0.5">{lead.name} — {lead.email}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-xs text-red-700 font-medium">This will permanently delete all lead data including interactions, enrichment logs, SMS/email history, and cadence records. This action cannot be undone.</p>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 cursor-pointer">
            <input type="checkbox" checked={useOverride} onChange={e => setUseOverride(e.target.checked)} className="mt-0.5 rounded border-amber-300 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800">Apply Retention Override</p>
              <p className="text-xs text-amber-600">Retain data instead of deleting (e.g. legal hold, regulatory requirement)</p>
            </div>
          </label>

          {useOverride && (
            <div className="space-y-3 pl-2">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Override Type</label>
                <select value={overrideType} onChange={e => setOverrideType(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option>Legal Hold</option>
                  <option>Regulatory Requirement</option>
                  <option>Active Dispute</option>
                  <option>Audit Evidence</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Reason (required)</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" placeholder="Describe the reason for retention override…" />
              </div>
            </div>
          )}

          {!useOverride && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="rounded border-slate-300 text-red-600" />
              <span className="text-sm text-slate-700">I confirm this deletion is authorized and will be logged in the audit trail</span>
            </label>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-xs text-slate-500 flex items-start gap-1.5"><Shield size={11} className="mt-0.5 shrink-0" />All actions are logged with timestamp, actor identity, and data scope for GDPR compliance.</p>
          </div>
        </div>
        <div className="flex gap-2 p-5 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">Cancel</button>
          <button
            onClick={handleDelete}
            disabled={deleting || (!useOverride && !confirmed) || (useOverride && !reason.trim())}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60 ${useOverride ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'}`}
          >
            {deleting ? <RefreshCw size={14} className="animate-spin" /> : useOverride ? <Shield size={14} /> : <Trash2 size={14} />}
            {deleting ? 'Processing…' : useOverride ? 'Apply Retention Override' : 'Delete Permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UserDataExportPage() {
  const [tab, setTab] = useState<'leads' | 'exports' | 'deletions' | 'audit'>('leads');
  const [search, setSearch] = useState('');
  const [exportLead, setExportLead] = useState<LeadRecord | null>(null);
  const [deleteLead, setDeleteLead] = useState<LeadRecord | null>(null);
  const [exportJobs, setExportJobs] = useState<ExportJob[]>(EXPORT_JOBS);
  const [deletions, setDeletions] = useState<DeletionRecord[]>(DELETIONS);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>(AUDIT_ENTRIES);

  const filteredLeads = LEADS.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.email.toLowerCase().includes(search.toLowerCase()) ||
    l.address.toLowerCase().includes(search.toLowerCase())
  );

  function handleExport() {
    if (!exportLead) return;
    const job: ExportJob = {
      id: `exp-${Date.now()}`, leadId: exportLead.id, leadName: exportLead.name,
      requestedBy: 'admin@travlr.com', requestedAt: new Date().toISOString(),
      status: 'ready', includes: ['Lead Record', 'Interactions', 'Enrichment Logs', 'SMS History', 'Email History'],
      size: '52 KB', completedAt: new Date().toISOString(),
    };
    setExportJobs(prev => [job, ...prev]);
    const entry: AuditEntry = {
      id: `a-${Date.now()}`, timestamp: new Date().toISOString(),
      action: 'DATA_EXPORT_REQUESTED', actor: 'admin@travlr.com',
      target: `${exportLead.name} (${exportLead.id})`,
      details: 'Full lead record export requested — includes interactions, enrichment logs, SMS/email history',
      severity: 'medium',
    };
    setAuditEntries(prev => [entry, ...prev]);
  }

  function handleDelete(override?: string, reason?: string) {
    if (!deleteLead) return;
    const record: DeletionRecord = {
      id: `del-${Date.now()}`, leadId: deleteLead.id, leadName: deleteLead.name,
      email: deleteLead.email, requestedBy: 'admin@travlr.com',
      requestedAt: new Date().toISOString(),
      status: override ? 'retained' : 'pending_review',
      retentionOverride: override, retentionReason: reason,
      auditRef: `AUD-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${String(deletions.length + 1).padStart(3, '0')}`,
    };
    setDeletions(prev => [record, ...prev]);
    const entry: AuditEntry = {
      id: `a-${Date.now()}`, timestamp: new Date().toISOString(),
      action: override ? 'DELETION_RETAINED' : 'DELETION_REQUESTED',
      actor: 'admin@travlr.com',
      target: `${deleteLead.name} (${deleteLead.id})`,
      details: override ? `Deletion overridden — ${override} applied. Reason: ${reason}` : 'Account deletion requested. Pending compliance review.',
      severity: 'high',
    };
    setAuditEntries(prev => [entry, ...prev]);
  }

  const TABS = [
    { id: 'leads', label: 'Lead Records' },
    { id: 'exports', label: `Exports (${exportJobs.length})` },
    { id: 'deletions', label: `Deletions (${deletions.length})` },
    { id: 'audit', label: 'Audit Trail' },
  ] as const;

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Database size={20} className="text-primary" />
            User Data Export &amp; Deletion
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Admin-triggered lead data export, account deletion, and retention override with full audit trail</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-2xl font-bold text-foreground">{LEADS.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Lead Records</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-2xl font-bold text-primary">{exportJobs.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Export Jobs</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-2xl font-bold text-amber-600">{deletions.filter(d => d.status === 'pending_review').length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Pending Deletions</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-2xl font-bold text-red-600">{deletions.filter(d => d.status === 'deleted').length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Accounts Deleted</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Lead Records Tab */}
        {tab === 'leads' && (
          <div className="space-y-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search leads by name, email, or address…"
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="space-y-2">
              {filteredLeads.map(lead => (
                <div key={lead.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User size={14} className="text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{lead.name}</p>
                          <p className="text-xs text-muted-foreground">{lead.email} · {lead.phone}</p>
                        </div>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{lead.stage}</span>
                        {lead.enriched && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Enriched</span>}
                      </div>
                      <div className="mt-2 flex items-center gap-4 flex-wrap text-xs text-muted-foreground pl-10">
                        <span>{lead.address}</span>
                        <span>Source: {lead.source}</span>
                        <span>Score: {lead.score}</span>
                        <span>{lead.interactions} interactions</span>
                        <span>Imported: {fmt(lead.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setExportLead(lead)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
                      >
                        <Download size={11} />
                        Export
                      </button>
                      <button
                        onClick={() => setDeleteLead(lead)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                      >
                        <Trash2 size={11} />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Exports Tab */}
        {tab === 'exports' && (
          <div className="space-y-3">
            {exportJobs.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-8 text-center">
                <Download size={28} className="text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No export jobs yet. Export a lead record from the Lead Records tab.</p>
              </div>
            ) : exportJobs.map(job => (
              <div key={job.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileText size={14} className="text-muted-foreground shrink-0" />
                      <p className="text-sm font-semibold text-foreground">{job.leadName}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${job.status === 'ready' ? 'bg-emerald-100 text-emerald-700' : job.status === 'downloaded' ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-700'}`}>
                        {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                      <span>Requested by {job.requestedBy}</span>
                      <span>{fmtTime(job.requestedAt)}</span>
                      {job.size && <span>{job.size}</span>}
                    </div>
                    <div className="mt-1.5 flex gap-1.5 flex-wrap">
                      {job.includes.map(inc => (
                        <span key={inc} className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{inc}</span>
                      ))}
                    </div>
                  </div>
                  {job.status === 'ready' && (
                    <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors">
                      <Download size={11} />
                      Download
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Deletions Tab */}
        {tab === 'deletions' && (
          <div className="space-y-3">
            {deletions.map(d => (
              <div key={d.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Trash2 size={14} className="text-muted-foreground shrink-0" />
                      <p className="text-sm font-semibold text-foreground">{d.leadName}</p>
                      <span className="text-xs text-muted-foreground">{d.email}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${deletionStatusBadge(d.status)}`}>{deletionStatusLabel(d.status)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                      <span>Requested by {d.requestedBy}</span>
                      <span>{fmtTime(d.requestedAt)}</span>
                      <span className="font-mono text-[10px] bg-muted px-2 py-0.5 rounded">{d.auditRef}</span>
                    </div>
                    {d.retentionOverride && (
                      <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                        <p className="text-xs font-medium text-amber-800">Retention Override: {d.retentionOverride}</p>
                        {d.retentionReason && <p className="text-xs text-amber-700 mt-0.5">{d.retentionReason}</p>}
                      </div>
                    )}
                    {d.completedAt && <p className="text-xs text-muted-foreground mt-1">Completed: {fmtTime(d.completedAt)}</p>}
                  </div>
                  {d.status === 'pending_review' && (
                    <div className="flex gap-2">
                      <button className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 rounded-lg hover:bg-emerald-200 transition-colors">Approve</button>
                      <button className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">Reject</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Audit Trail Tab */}
        {tab === 'audit' && (
          <div className="space-y-2">
            {auditEntries.map(entry => (
              <div key={entry.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${entry.severity === 'high' ? 'bg-red-500' : entry.severity === 'medium' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-foreground">{entry.action}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${severityBadge(entry.severity)}`}>{entry.severity.toUpperCase()}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{entry.target}</p>
                    <p className="text-xs text-foreground mt-1">{entry.details}</p>
                    <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>{fmtTime(entry.timestamp)}</span>
                      <span>by {entry.actor}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {exportLead && <ExportModal lead={exportLead} onClose={() => setExportLead(null)} onExport={handleExport} />}
      {deleteLead && <DeleteModal lead={deleteLead} onClose={() => setDeleteLead(null)} onDelete={handleDelete} />}
    </AppLayout>
  );
}
