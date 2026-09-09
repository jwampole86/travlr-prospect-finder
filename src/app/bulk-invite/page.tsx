'use client';

import React, { useState, useRef } from 'react';
import AppLayout from '@/components/AppLayout';

import { Upload, CheckCircle, AlertTriangle, Loader2, Plus, Trash2, Building2, Shield, ChevronDown, Send, RefreshCw, Download,  } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type UserRole = 'agent' | 'manager' | 'admin' | 'viewer';

interface InviteRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  portfolioIds: string[];
  status: 'pending' | 'sending' | 'sent' | 'error';
  error?: string;
}

interface Portfolio {
  id: string;
  name: string;
  leadCount: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<UserRole, string> = {
  agent: 'Agent',
  manager: 'Manager',
  admin: 'Admin',
  viewer: 'Viewer (Read-Only)',
};

const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  agent: ['View assigned leads', 'Make calls & SMS', 'Update lead stages', 'View own performance'],
  manager: ['All Agent permissions', 'View team metrics', 'Assign leads', 'Review call quality', 'Bulk outreach'],
  admin: ['All Manager permissions', 'User management', 'System settings', 'Billing & exports'],
  viewer: ['View leads (read-only)', 'View reports', 'No edit access'],
};

const ROLE_COLORS: Record<UserRole, string> = {
  agent: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  manager: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  admin: 'bg-red-500/10 text-red-600 border-red-500/20',
  viewer: 'bg-muted text-muted-foreground border-border',
};

const MOCK_PORTFOLIOS: Portfolio[] = [
  { id: 'p1', name: 'Downtown STR Portfolio', leadCount: 48 },
  { id: 'p2', name: 'Suburban Rentals', leadCount: 72 },
  { id: 'p3', name: 'Beachfront Properties', leadCount: 31 },
  { id: 'p4', name: 'Mountain Cabins', leadCount: 19 },
  { id: 'p5', name: 'Urban Condos', leadCount: 55 },
];

function generateId() { return `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSV(text: string): Partial<InviteRow>[] {
  const lines = text.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const row: Partial<InviteRow> = {};
    headers.forEach((h, i) => {
      if (h === 'email') row.email = cols[i] || '';
      if (h === 'name' || h === 'full_name') row.name = cols[i] || '';
      if (h === 'role') row.role = (['agent', 'manager', 'admin', 'viewer'].includes(cols[i]) ? cols[i] : 'agent') as UserRole;
    });
    return row;
  });
}

// ─── Invite Row Component ─────────────────────────────────────────────────────

function InviteRowCard({ row, portfolios, onUpdate, onDelete }: {
  row: InviteRow;
  portfolios: Portfolio[];
  onUpdate: (id: string, updates: Partial<InviteRow>) => void;
  onDelete: (id: string) => void;
}) {
  const [showPortfolios, setShowPortfolios] = useState(false);

  const statusIcon = {
    pending: null,
    sending: <Loader2 size={13} className="animate-spin text-primary" />,
    sent: <CheckCircle size={13} className="text-emerald-600" />,
    error: <AlertTriangle size={13} className="text-red-500" />,
  }[row.status];

  return (
    <div className={`bg-card border rounded-xl p-3 transition-all ${row.status === 'sent' ? 'border-emerald-500/20 bg-emerald-500/5' : row.status === 'error' ? 'border-red-500/20 bg-red-500/5' : 'border-border'}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Email */}
          <div>
            <label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Email</label>
            <input
              value={row.email}
              onChange={e => onUpdate(row.id, { email: e.target.value })}
              disabled={row.status === 'sent'}
              placeholder="agent@example.com"
              className="mt-0.5 w-full text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
            />
          </div>
          {/* Name */}
          <div>
            <label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Full Name</label>
            <input
              value={row.name}
              onChange={e => onUpdate(row.id, { name: e.target.value })}
              disabled={row.status === 'sent'}
              placeholder="Jane Smith"
              className="mt-0.5 w-full text-xs bg-background border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
            />
          </div>
          {/* Role */}
          <div>
            <label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Role</label>
            <div className="relative mt-0.5">
              <select
                value={row.role}
                onChange={e => onUpdate(row.id, { role: e.target.value as UserRole })}
                disabled={row.status === 'sent'}
                className="w-full text-xs bg-background border border-border rounded-lg pl-2 pr-6 py-1.5 text-foreground focus:outline-none appearance-none disabled:opacity-60"
              >
                {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
              <ChevronDown size={9} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-4">
          {statusIcon}
          {row.status !== 'sent' && (
            <button onClick={() => onDelete(row.id)} className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Portfolio assignment */}
      {row.status !== 'sent' && (
        <div className="mt-2">
          <button
            onClick={() => setShowPortfolios(!showPortfolios)}
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Building2 size={10} />
            {row.portfolioIds.length > 0 ? `${row.portfolioIds.length} portfolio${row.portfolioIds.length > 1 ? 's' : ''} assigned` : 'Assign portfolios…'}
            <ChevronDown size={9} className={`transition-transform ${showPortfolios ? 'rotate-180' : ''}`} />
          </button>
          {showPortfolios && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {portfolios.map(p => {
                const assigned = row.portfolioIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => onUpdate(row.id, { portfolioIds: assigned ? row.portfolioIds.filter(id => id !== p.id) : [...row.portfolioIds, p.id] })}
                    className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border font-medium transition-all ${assigned ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-background border-border text-muted-foreground hover:border-primary/40'}`}
                  >
                    {assigned && <CheckCircle size={9} />}
                    {p.name} <span className="opacity-60">({p.leadCount})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {row.error && (
        <p className="mt-1.5 text-[10px] text-red-500 flex items-center gap-1">
          <AlertTriangle size={9} />
          {row.error}
        </p>
      )}
    </div>
  );
}

// ─── Role Permissions Panel ───────────────────────────────────────────────────

function RolePermissionsPanel() {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
        <Shield size={13} className="text-primary" />
        Role Permissions Reference
      </p>
      <div className="space-y-3">
        {(Object.keys(ROLE_LABELS) as UserRole[]).map(role => (
          <div key={role}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${ROLE_COLORS[role]}`}>
                {ROLE_LABELS[role]}
              </span>
            </div>
            <ul className="space-y-0.5">
              {ROLE_PERMISSIONS[role].map(perm => (
                <li key={perm} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <CheckCircle size={9} className="text-emerald-500 shrink-0" />
                  {perm}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BulkInvitePage() {
  const [rows, setRows] = useState<InviteRow[]>([
    { id: generateId(), email: '', name: '', role: 'agent', portfolioIds: [], status: 'pending' },
  ]);
  const [portfolios] = useState<Portfolio[]>(MOCK_PORTFOLIOS);
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<'manual' | 'csv' | 'roster'>('manual');
  const [csvText, setCsvText] = useState('');
  const [csvParsed, setCsvParsed] = useState(false);
  const [bulkRole, setBulkRole] = useState<UserRole>('agent');
  const [bulkPortfolioIds, setBulkPortfolioIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addRow() {
    setRows(prev => [...prev, { id: generateId(), email: '', name: '', role: 'agent', portfolioIds: [], status: 'pending' }]);
  }

  function updateRow(id: string, updates: Partial<InviteRow>) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }

  function deleteRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function handleCSVFile(file: File) {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      setCsvText(text);
      const parsed = parseCSV(text);
      if (parsed.length === 0) { toast.error('No valid rows found in CSV'); return; }
      const newRows: InviteRow[] = parsed.map(p => ({
        id: generateId(),
        email: p.email || '',
        name: p.name || '',
        role: p.role || 'agent',
        portfolioIds: [],
        status: 'pending' as const,
      }));
      setRows(newRows);
      setCsvParsed(true);
      setActiveTab('manual');
      toast.success(`Imported ${newRows.length} rows from CSV`);
    };
    reader.readAsText(file);
  }

  function applyBulkSettings() {
    setRows(prev => prev.map(r => r.status === 'pending' ? { ...r, role: bulkRole, portfolioIds: bulkPortfolioIds } : r));
    toast.success('Bulk settings applied to all pending rows');
  }

  async function sendInvites() {
    const pendingRows = rows.filter(r => r.status === 'pending' && r.email.trim());
    if (pendingRows.length === 0) { toast.error('No valid rows to send — add at least one email address'); return; }

    setSending(true);
    for (const row of pendingRows) {
      updateRow(row.id, { status: 'sending' });
      await new Promise(r => setTimeout(r, 400 + Math.random() * 300));
      try {
        // Call Resend invite API
        const res = await fetch('/api/bulk-invite/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: row.email, name: row.name, role: row.role, portfolioIds: row.portfolioIds }),
        });
        const data = await res.json();
        if (res.ok) {
          updateRow(row.id, { status: 'sent' });
        } else {
          // Surface the actual error from Resend, not a generic message
          const errorMsg = data?.error || 'Failed to send invite';
          updateRow(row.id, { status: 'error', error: errorMsg });
        }
      } catch {
        updateRow(row.id, { status: 'error', error: 'Network error — check connection' });
      }
    }
    setSending(false);
    const nowSent = rows.filter(r => r.status === 'sent').length;
    toast.success(`${pendingRows.length} invite${pendingRows.length > 1 ? 's' : ''} processed`);
  }

  // Counter: only count rows that have a valid email and are pending (ready-to-send)
  const pendingCount = rows.filter(r => r.status === 'pending' && r.email.trim()).length;
  const sentCount = rows.filter(r => r.status === 'sent').length;
  const errorCount = rows.filter(r => r.status === 'error').length;

  const TABS = [
    { key: 'manual' as const, label: 'Manual Entry' },
    { key: 'csv' as const, label: 'CSV Import' },
    { key: 'roster' as const, label: 'Team Roster' },
  ];

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Bulk Agent & Owner Invite</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Import via CSV or add manually — auto-send invite emails with password-set links, assign portfolios, and set role permissions
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {sentCount > 0 && <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-600"><CheckCircle size={11} />{sentCount} sent</span>}
            {errorCount > 0 && <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/10 text-red-500"><AlertTriangle size={11} />{errorCount} errors</span>}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/50 rounded-xl p-1 w-fit">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${activeTab === t.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {/* ── CSV TAB ── */}
            {activeTab === 'csv' && (
              <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                <p className="text-sm font-semibold text-foreground">Import from CSV</p>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-muted/20 transition-all"
                >
                  <Upload size={24} className="text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground">Drop CSV file here or click to browse</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Required columns: email, name, role (agent/manager/admin/viewer)</p>
                  <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={e => e.target.files?.[0] && handleCSVFile(e.target.files[0])} />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground">or paste CSV</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <textarea
                  value={csvText}
                  onChange={e => setCsvText(e.target.value)}
                  rows={5}
                  placeholder={`email,name,role\njane@example.com,Jane Smith,agent\nbob@example.com,Bob Jones,manager`}
                  className="w-full text-xs bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none font-mono resize-none"
                />
                <button
                  onClick={() => {
                    const parsed = parseCSV(csvText);
                    if (parsed.length === 0) { toast.error('No valid rows found'); return; }
                    setRows(parsed.map(p => ({ id: generateId(), email: p.email || '', name: p.name || '', role: p.role || 'agent', portfolioIds: [], status: 'pending' as const })));
                    setCsvParsed(true);
                    setActiveTab('manual');
                    toast.success(`Imported ${parsed.length} rows`);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-all"
                >
                  <Upload size={12} />
                  Parse & Import
                </button>

                {/* Download template */}
                <a
                  href="data:text/csv;charset=utf-8,email,name,role%0Aagent@example.com,Agent Name,agent"
                  download="invite_template.csv"
                  className="flex items-center gap-1.5 text-[11px] text-primary hover:underline"
                >
                  <Download size={11} />
                  Download CSV template
                </a>
              </div>
            )}

            {/* ── MANUAL TAB ── */}
            {activeTab === 'manual' && (
              <div className="space-y-3">
                {/* Bulk apply */}
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-xs font-semibold text-foreground mb-3">Bulk Apply to All Pending</p>
                  <div className="flex flex-wrap gap-3 items-end">
                    <div>
                      <label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Role</label>
                      <div className="relative mt-0.5">
                        <select value={bulkRole} onChange={e => setBulkRole(e.target.value as UserRole)} className="text-xs bg-background border border-border rounded-lg pl-2 pr-6 py-1.5 text-foreground focus:outline-none appearance-none">
                          {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                        <ChevronDown size={9} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Portfolios</label>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {portfolios.map(p => {
                          const sel = bulkPortfolioIds.includes(p.id);
                          return (
                            <button
                              key={p.id}
                              onClick={() => setBulkPortfolioIds(prev => sel ? prev.filter(id => id !== p.id) : [...prev, p.id])}
                              className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-all ${sel ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}
                            >
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <button onClick={applyBulkSettings} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-all">
                      <RefreshCw size={11} />
                      Apply to All
                    </button>
                  </div>
                </div>

                {/* Rows */}
                {rows.map(row => (
                  <InviteRowCard key={row.id} row={row} portfolios={portfolios} onUpdate={updateRow} onDelete={deleteRow} />
                ))}

                <button onClick={addRow} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-border text-xs text-muted-foreground hover:border-primary hover:text-primary transition-all">
                  <Plus size={13} />
                  Add Row
                </button>
              </div>
            )}

            {/* ── ROSTER TAB ── */}
            {activeTab === 'roster' && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-xs font-semibold text-foreground">Team Roster Confirmation</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Review all sent invites and their status</p>
                </div>
                <div className="divide-y divide-border">
                  {rows.filter(r => r.status === 'sent' || r.status === 'error').length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">No invites sent yet</div>
                  ) : (
                    rows.filter(r => r.status === 'sent' || r.status === 'error').map(row => (
                      <div key={row.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                          {(row.name || row.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground">{row.name || row.email}</p>
                          <p className="text-[10px] text-muted-foreground">{row.email}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${ROLE_COLORS[row.role]}`}>{ROLE_LABELS[row.role]}</span>
                          {row.status === 'sent' ? (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-600"><CheckCircle size={11} />Sent</span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] text-red-500"><AlertTriangle size={11} />Error</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right panel */}
          <div className="space-y-4">
            {/* Send button */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">Ready to Send</p>
                <span className="text-xs font-bold text-foreground">{pendingCount} pending</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Each invite sends a Resend email with a secure password-set link. Recipients can set their password and access the platform immediately.
              </p>
              <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-[10px] text-blue-700 space-y-1">
                <p className="font-semibold">Invite email includes:</p>
                <p>✓ Personalized welcome message</p>
                <p>✓ Secure password-set link (24h expiry)</p>
                <p>✓ Role & portfolio assignment details</p>
                <p>✓ Getting started guide link</p>
              </div>
              <button
                onClick={sendInvites}
                disabled={sending || pendingCount === 0}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {sending ? 'Sending Invites…' : `Send ${pendingCount} Invite${pendingCount !== 1 ? 's' : ''}`}
              </button>
            </div>

            <RolePermissionsPanel />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
