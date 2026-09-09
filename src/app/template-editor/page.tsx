'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';

import { useAuth } from '@/contexts/AuthContext';
import { Mail, MessageSquare, Plus, Trash2, Eye, Copy, Search, CheckCircle2, Save, Loader2, Variable, FileText, History, ToggleLeft, ToggleRight, ArrowLeft, AlertTriangle, User, Home, DollarSign, Star,  } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type TemplateChannel = 'email' | 'sms';
type TemplateStatus = 'active' | 'draft';

interface TemplateVersion {
  version: number;
  body: string;
  subject?: string;
  saved_at: string;
  saved_by?: string;
}

interface CadenceTemplate {
  id: string;
  name: string;
  channel: TemplateChannel;
  subject?: string;
  body: string;
  category: string;
  status: TemplateStatus;
  variables: string[];
  versions: TemplateVersion[];
  created_at: string;
  updated_at: string;
  sequence_step?: number;
}

interface SampleLead {
  id: string;
  label: string;
  first_name: string;
  last_name: string;
  address: string;
  city: string;
  state: string;
  beds: number;
  baths: number;
  price: number;
  prospect_score: number;
  agent_name: string;
  company_name: string;
  estimated_revenue: number;
  source: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SAMPLE_LEADS: SampleLead[] = [
  {
    id: 'sl-1', label: 'High-Score Prospect',
    first_name: 'Sarah', last_name: 'Mitchell', address: '142 Aspen Ridge Dr',
    city: 'Aspen', state: 'CO', beds: 4, baths: 3, price: 3200,
    prospect_score: 91, agent_name: 'James Carter', company_name: 'TravlrPro',
    estimated_revenue: 4800, source: 'Zillow',
  },
  {
    id: 'sl-2', label: 'Mid-Tier Lead',
    first_name: 'David', last_name: 'Nguyen', address: '87 Sunset Blvd',
    city: 'Nashville', state: 'TN', beds: 3, baths: 2, price: 1850,
    prospect_score: 62, agent_name: 'Maria Lopez', company_name: 'TravlrPro',
    estimated_revenue: 2900, source: 'Apartments.com',
  },
  {
    id: 'sl-3', label: 'New Inquiry',
    first_name: 'Priya', last_name: 'Sharma', address: '310 Lakefront Ave',
    city: 'Austin', state: 'TX', beds: 2, baths: 1, price: 1400,
    prospect_score: 44, agent_name: 'James Carter', company_name: 'TravlrPro',
    estimated_revenue: 1950, source: 'Craigslist',
  },
];

const EMAIL_VARIABLES = [
  { key: '{{first_name}}', label: 'First Name', icon: User },
  { key: '{{last_name}}', label: 'Last Name', icon: User },
  { key: '{{address}}', label: 'Property Address', icon: Home },
  { key: '{{city}}', label: 'City', icon: Home },
  { key: '{{agent_name}}', label: 'Agent Name', icon: User },
  { key: '{{company_name}}', label: 'Company Name', icon: FileText },
  { key: '{{prospect_score}}', label: 'Prospect Score', icon: Star },
  { key: '{{estimated_revenue}}', label: 'Est. Monthly Revenue', icon: DollarSign },
  { key: '{{beds}}', label: 'Bedrooms', icon: Home },
  { key: '{{baths}}', label: 'Bathrooms', icon: Home },
  { key: '{{price}}', label: 'Listing Price', icon: DollarSign },
  { key: '{{unsubscribe_link}}', label: 'Unsubscribe Link', icon: Mail },
];

const SMS_VARIABLES = [
  { key: '{{first_name}}', label: 'First Name', icon: User },
  { key: '{{address}}', label: 'Property Address', icon: Home },
  { key: '{{city}}', label: 'City', icon: Home },
  { key: '{{agent_name}}', label: 'Agent Name', icon: User },
  { key: '{{estimated_revenue}}', label: 'Est. Monthly Revenue', icon: DollarSign },
  { key: '{{prospect_score}}', label: 'Prospect Score', icon: Star },
  { key: '{{opt_out}}', label: 'Opt-Out (TCPA)', icon: AlertTriangle },
];

const CATEGORIES = ['Initial Outreach', 'Follow-Up', 'Proposal', 'Closing', 'Nurture', 'Re-engagement'];

const SEED_TEMPLATES: CadenceTemplate[] = [
  {
    id: 'seed-1', name: 'Initial Outreach — Email', channel: 'email', status: 'active',
    category: 'Initial Outreach', sequence_step: 1,
    subject: 'Quick question about {{address}}',
    body: `Hi {{first_name}},\n\nI came across your property at {{address}} in {{city}} and wanted to reach out. Our team at {{company_name}} specializes in short-term rental management and we believe your property could generate around $${'$'}{{estimated_revenue}}/month.\n\nWould you be open to a quick 10-minute call to explore this?\n\nBest,\n{{agent_name}}\n{{company_name}}`,
    variables: ['{{first_name}}', '{{address}}', '{{city}}', '{{company_name}}', '{{estimated_revenue}}', '{{agent_name}}'],
    versions: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  {
    id: 'seed-2', name: 'Follow-Up Day 3 — SMS', channel: 'sms', status: 'active',
    category: 'Follow-Up', sequence_step: 2,
    body: `Hi {{first_name}}, following up on {{address}}. We manage STRs in {{city}} and think your property could earn $${'$'}{{estimated_revenue}}/mo. Interested? Reply YES or STOP to opt out.`,
    variables: ['{{first_name}}', '{{address}}', '{{city}}', '{{estimated_revenue}}', '{{opt_out}}'],
    versions: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  {
    id: 'seed-3', name: 'Proposal Email', channel: 'email', status: 'draft',
    category: 'Proposal', sequence_step: 3,
    subject: 'Your personalized STR proposal for {{address}}',
    body: `Hi {{first_name}},\n\nBased on our analysis, {{address}} scores {{prospect_score}}/100 on our prospect index — placing it in the top tier for STR potential in {{city}}.\n\nEstimated monthly revenue: $${'$'}{{estimated_revenue}}\nProperty: {{beds}} bed / {{baths}} bath\n\nI'd love to walk you through our full proposal. Are you available this week?\n\n{{agent_name}}\n{{company_name}}`,
    variables: ['{{first_name}}', '{{address}}', '{{prospect_score}}', '{{city}}', '{{estimated_revenue}}', '{{beds}}', '{{baths}}', '{{agent_name}}', '{{company_name}}'],
    versions: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
  {
    id: 'seed-4', name: 'Re-engagement SMS', channel: 'sms', status: 'active',
    category: 'Re-engagement', sequence_step: 5,
    body: `Hey {{first_name}}, still thinking about {{address}}? STR demand in {{city}} is up — your property could earn $${'$'}{{estimated_revenue}}/mo. Want a free estimate? Reply YES. {{opt_out}}`,
    variables: ['{{first_name}}', '{{address}}', '{{city}}', '{{estimated_revenue}}', '{{opt_out}}'],
    versions: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolvePreview(body: string, lead: SampleLead): string {
  return body
    .replace(/\{\{first_name\}\}/g, lead.first_name)
    .replace(/\{\{last_name\}\}/g, lead.last_name)
    .replace(/\{\{address\}\}/g, lead.address)
    .replace(/\{\{city\}\}/g, lead.city)
    .replace(/\{\{state\}\}/g, lead.state)
    .replace(/\{\{beds\}\}/g, String(lead.beds))
    .replace(/\{\{baths\}\}/g, String(lead.baths))
    .replace(/\{\{price\}\}/g, `$${lead.price.toLocaleString()}`)
    .replace(/\{\{prospect_score\}\}/g, String(lead.prospect_score))
    .replace(/\{\{agent_name\}\}/g, lead.agent_name)
    .replace(/\{\{company_name\}\}/g, lead.company_name)
    .replace(/\{\{estimated_revenue\}\}/g, lead.estimated_revenue.toLocaleString())
    .replace(/\{\{opt_out\}\}/g, 'Reply STOP to opt out')
    .replace(/\{\{unsubscribe_link\}\}/g, 'https://app.travlrpro.com/unsubscribe');
}

function extractVars(text: string): string[] {
  return [...new Set(text.match(/\{\{[^}]+\}\}/g) ?? [])];
}

function hasTCPA(body: string): boolean {
  const lower = body.toLowerCase();
  return ['reply stop', 'text stop', 'opt out', 'unsubscribe', 'opt-out'].some((p) => lower.includes(p));
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TemplateEditorPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<CadenceTemplate[]>(SEED_TEMPLATES);
  const [selected, setSelected] = useState<CadenceTemplate | null>(null);
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | TemplateChannel>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | TemplateStatus>('all');
  const [previewLead, setPreviewLead] = useState<SampleLead>(SAMPLE_LEADS[0]);
  const [showPreview, setShowPreview] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editChannel, setEditChannel] = useState<TemplateChannel>('email');
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editCategory, setEditCategory] = useState('Initial Outreach');
  const [editStatus, setEditStatus] = useState<TemplateStatus>('draft');
  const [editStep, setEditStep] = useState<number>(1);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const filtered = templates.filter((t) => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.body.toLowerCase().includes(search.toLowerCase());
    const matchChannel = channelFilter === 'all' || t.channel === channelFilter;
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchSearch && matchChannel && matchStatus;
  });

  function openNew() {
    setSelected(null);
    setEditName('');
    setEditChannel('email');
    setEditSubject('');
    setEditBody('');
    setEditCategory('Initial Outreach');
    setEditStatus('draft');
    setEditStep(1);
    setEditing(true);
    setShowPreview(false);
    setShowVersions(false);
  }

  function openEdit(t: CadenceTemplate) {
    setSelected(t);
    setEditName(t.name);
    setEditChannel(t.channel);
    setEditSubject(t.subject ?? '');
    setEditBody(t.body);
    setEditCategory(t.category);
    setEditStatus(t.status);
    setEditStep(t.sequence_step ?? 1);
    setEditing(true);
    setShowPreview(false);
    setShowVersions(false);
  }

  function insertVariable(varKey: string) {
    const el = bodyRef.current;
    if (!el) {
      setEditBody((prev) => prev + varKey);
      return;
    }
    const start = el.selectionStart ?? editBody.length;
    const end = el.selectionEnd ?? editBody.length;
    const next = editBody.slice(0, start) + varKey + editBody.slice(end);
    setEditBody(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + varKey.length, start + varKey.length);
    }, 0);
  }

  function handleSave() {
    if (!editName.trim()) { toast.error('Template name is required'); return; }
    if (!editBody.trim()) { toast.error('Template body is required'); return; }
    if (editChannel === 'sms' && !hasTCPA(editBody)) {
      toast.warning('SMS template missing opt-out instruction (TCPA compliance)');
    }
    setSaving(true);
    setTimeout(() => {
      const now = new Date().toISOString();
      const vars = extractVars(editBody + (editSubject ?? ''));
      if (selected) {
        // Save version snapshot
        const newVersion: TemplateVersion = {
          version: (selected.versions?.length ?? 0) + 1,
          body: selected.body,
          subject: selected.subject,
          saved_at: now,
          saved_by: user?.email ?? 'Admin',
        };
        setTemplates((prev) => prev.map((t) =>
          t.id === selected.id
            ? { ...t, name: editName, channel: editChannel, subject: editSubject, body: editBody, category: editCategory, status: editStatus, sequence_step: editStep, variables: vars, updated_at: now, versions: [...(t.versions ?? []), newVersion] }
            : t
        ));
        toast.success('Template updated — version saved');
      } else {
        const newT: CadenceTemplate = {
          id: `tpl-${Date.now()}`, name: editName, channel: editChannel,
          subject: editSubject, body: editBody, category: editCategory,
          status: editStatus, sequence_step: editStep, variables: vars,
          versions: [], created_at: now, updated_at: now,
        };
        setTemplates((prev) => [...prev, newT]);
        toast.success('Template created');
      }
      setSaving(false);
      setEditing(false);
      setSelected(null);
    }, 600);
  }

  function handleDelete(id: string) {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    if (selected?.id === id) { setSelected(null); setEditing(false); }
    toast.success('Template deleted');
  }

  function handleDuplicate(t: CadenceTemplate) {
    const now = new Date().toISOString();
    const copy: CadenceTemplate = { ...t, id: `tpl-${Date.now()}`, name: `${t.name} (Copy)`, status: 'draft', versions: [], created_at: now, updated_at: now };
    setTemplates((prev) => [...prev, copy]);
    toast.success('Template duplicated as draft');
  }

  function toggleStatus(id: string) {
    setTemplates((prev) => prev.map((t) =>
      t.id === id ? { ...t, status: t.status === 'active' ? 'draft' : 'active', updated_at: new Date().toISOString() } : t
    ));
  }

  function restoreVersion(v: TemplateVersion) {
    setEditBody(v.body);
    if (v.subject) setEditSubject(v.subject);
    toast.success(`Restored version ${v.version}`);
    setShowVersions(false);
  }

  const vars = editChannel === 'email' ? EMAIL_VARIABLES : SMS_VARIABLES;
  const previewBody = resolvePreview(editBody, previewLead);
  const previewSubject = editSubject ? resolvePreview(editSubject, previewLead) : '';
  const unresolvedVars = extractVars(editBody).filter((v) => previewBody.includes(v));
  const tcpaOk = editChannel !== 'sms' || hasTCPA(editBody);

  return (
    <AppLayout>
      <div className="px-6 py-5 max-w-screen-xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Template Editor</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Create and manage SMS/email cadence templates — variable insertion, live preview, version history
            </p>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus size={15} />
            New Template
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
          {/* ── Left: Template List ── */}
          <div className="space-y-3">
            {/* Filters */}
            <div className="bg-card border border-border rounded-xl p-3 space-y-2">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search templates…"
                  className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={channelFilter}
                  onChange={(e) => setChannelFilter(e.target.value as typeof channelFilter)}
                  className="flex-1 px-2 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-none text-foreground"
                >
                  <option value="all">All Channels</option>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className="flex-1 px-2 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-none text-foreground"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </div>

            {/* Template Cards */}
            <div className="space-y-2">
              {filtered.length === 0 && (
                <div className="text-center py-10 text-muted-foreground text-sm">No templates found</div>
              )}
              {filtered.map((t) => (
                <div
                  key={t.id}
                  className={`bg-card border rounded-xl p-3 cursor-pointer transition-all hover:border-primary/40 ${selected?.id === t.id && editing ? 'border-primary bg-primary/5' : 'border-border'}`}
                  onClick={() => openEdit(t)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`p-1.5 rounded-md ${t.channel === 'email' ? 'bg-blue-500/10 text-blue-500' : 'bg-green-500/10 text-green-500'}`}>
                        {t.channel === 'email' ? <Mail size={12} /> : <MessageSquare size={12} />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                        <p className="text-[11px] text-muted-foreground">{t.category} · Step {t.sequence_step ?? '—'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${t.status === 'active' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-600'}`}>
                        {t.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[11px] text-muted-foreground truncate max-w-[160px]">{t.body.slice(0, 60)}…</p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleStatus(t.id); }}
                        className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        title={t.status === 'active' ? 'Set to Draft' : 'Set to Active'}
                      >
                        {t.status === 'active' ? <ToggleRight size={14} className="text-emerald-500" /> : <ToggleLeft size={14} />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDuplicate(t); }}
                        className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        title="Duplicate"
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                        className="p-1 rounded hover:bg-danger/10 transition-colors text-muted-foreground hover:text-danger"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: Editor / Empty State ── */}
          {editing ? (
            <div className="space-y-4">
              {/* Editor Header */}
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setEditing(false); setSelected(null); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                      <ArrowLeft size={15} />
                    </button>
                    <h2 className="text-sm font-semibold text-foreground">{selected ? 'Edit Template' : 'New Template'}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    {selected && (
                      <button
                        onClick={() => setShowVersions((v) => !v)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                      >
                        <History size={12} />
                        Versions ({selected.versions?.length ?? 0})
                      </button>
                    )}
                    <button
                      onClick={() => setShowPreview((v) => !v)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors ${showPreview ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:bg-muted text-muted-foreground'}`}
                    >
                      <Eye size={12} />
                      Preview
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
                    >
                      {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>

                {/* Form Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Template Name *</label>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="e.g. Initial Outreach — Email"
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Channel</label>
                      <select
                        value={editChannel}
                        onChange={(e) => setEditChannel(e.target.value as TemplateChannel)}
                        className="w-full px-2 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none text-foreground"
                      >
                        <option value="email">Email</option>
                        <option value="sms">SMS</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Category</label>
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        className="w-full px-2 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none text-foreground"
                      >
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Status</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as TemplateStatus)}
                        className="w-full px-2 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none text-foreground"
                      >
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_80px] gap-3 mb-3">
                  {editChannel === 'email' && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Subject Line</label>
                      <input
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        placeholder="e.g. Quick question about {{address}}"
                        className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Sequence Step</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={editStep}
                      onChange={(e) => setEditStep(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>

                {/* Variable Chips */}
                <div className="mb-3">
                  <p className="text-xs font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                    <Variable size={12} className="text-primary" />
                    Insert Variable — click to add at cursor
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {vars.map((v) => (
                      <button
                        key={v.key}
                        onClick={() => insertVariable(v.key)}
                        className="flex items-center gap-1 px-2 py-1 text-[11px] bg-primary/8 border border-primary/20 text-primary rounded-md hover:bg-primary/15 transition-colors font-mono"
                      >
                        {v.key}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Body */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">
                    Body *
                    {editChannel === 'sms' && (
                      <span className="ml-2 text-[11px] text-muted-foreground">({editBody.length} chars)</span>
                    )}
                  </label>
                  <textarea
                    ref={bodyRef}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={editChannel === 'email' ? 10 : 5}
                    placeholder={editChannel === 'email' ? 'Write your email body here…' : 'Write your SMS message here…'}
                    className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none font-mono text-foreground"
                  />
                </div>

                {/* Validation Badges */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {editChannel === 'sms' && (
                    <span className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full ${tcpaOk ? 'bg-emerald-500/10 text-emerald-600' : 'bg-danger/10 text-danger'}`}>
                      {tcpaOk ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                      {tcpaOk ? 'TCPA opt-out present' : 'Missing TCPA opt-out'}
                    </span>
                  )}
                  {unresolvedVars.length > 0 && (
                    <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-amber-500/10 text-amber-600">
                      <AlertTriangle size={11} />
                      {unresolvedVars.length} unresolved var{unresolvedVars.length > 1 ? 's' : ''} in preview
                    </span>
                  )}
                  {extractVars(editBody).length > 0 && (
                    <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-primary/10 text-primary">
                      <Variable size={11} />
                      {extractVars(editBody).length} variable{extractVars(editBody).length > 1 ? 's' : ''}
                    </span>
                  )}
                  <span className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full ${editStatus === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                    {editStatus === 'active' ? <ToggleRight size={11} /> : <ToggleLeft size={11} />}
                    {editStatus === 'active' ? 'Active in cadence' : 'Draft — not in cadence'}
                  </span>
                </div>
              </div>

              {/* Version History Panel */}
              {showVersions && selected && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <History size={14} className="text-primary" />
                    Version History
                  </h3>
                  {(selected.versions?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">No previous versions saved yet. Versions are created each time you save.</p>
                  ) : (
                    <div className="space-y-2">
                      {[...selected.versions].reverse().map((v) => (
                        <div key={v.version} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors">
                          <div>
                            <p className="text-xs font-medium text-foreground">Version {v.version}</p>
                            <p className="text-[11px] text-muted-foreground">{new Date(v.saved_at).toLocaleString()} · {v.saved_by}</p>
                            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 font-mono">{v.body.slice(0, 80)}…</p>
                          </div>
                          <button
                            onClick={() => restoreVersion(v)}
                            className="shrink-0 px-2.5 py-1 text-[11px] border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                          >
                            Restore
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Preview Panel */}
              {showPreview && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Eye size={14} className="text-primary" />
                      Live Preview
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Sample lead:</span>
                      <select
                        value={previewLead.id}
                        onChange={(e) => setPreviewLead(SAMPLE_LEADS.find((l) => l.id === e.target.value) ?? SAMPLE_LEADS[0])}
                        className="px-2 py-1 text-xs bg-background border border-border rounded-lg focus:outline-none text-foreground"
                      >
                        {SAMPLE_LEADS.map((l) => <option key={l.id} value={l.id}>{l.label} — {l.first_name} {l.last_name}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Lead Data Strip */}
                  <div className="flex flex-wrap gap-3 mb-3 p-3 rounded-lg bg-muted/40 border border-border">
                    {[
                      { label: 'Name', value: `${previewLead.first_name} ${previewLead.last_name}` },
                      { label: 'Address', value: previewLead.address },
                      { label: 'City', value: `${previewLead.city}, ${previewLead.state}` },
                      { label: 'Score', value: `${previewLead.prospect_score}/100` },
                      { label: 'Est. Revenue', value: `$${previewLead.estimated_revenue.toLocaleString()}/mo` },
                      { label: 'Beds/Baths', value: `${previewLead.beds}bd/${previewLead.baths}ba` },
                    ].map((item) => (
                      <div key={item.label} className="text-[11px]">
                        <span className="text-muted-foreground">{item.label}: </span>
                        <span className="font-medium text-foreground">{item.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Rendered Preview */}
                  <div className="rounded-lg border border-border overflow-hidden">
                    {editChannel === 'email' && previewSubject && (
                      <div className="px-4 py-2.5 bg-muted/50 border-b border-border">
                        <span className="text-xs text-muted-foreground">Subject: </span>
                        <span className="text-sm font-medium text-foreground">{previewSubject}</span>
                      </div>
                    )}
                    <div className={`p-4 ${editChannel === 'email' ? 'bg-white dark:bg-card' : 'bg-green-500/5'}`}>
                      {editChannel === 'email' ? (
                        <pre className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">{previewBody}</pre>
                      ) : (
                        <div className="max-w-xs">
                          <div className="bg-green-500 text-white rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed">
                            {previewBody}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1 ml-1">{previewBody.length} chars</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <FileText size={24} className="text-primary" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">Select a template to edit</h3>
                <p className="text-sm text-muted-foreground mb-4">Or create a new template to get started</p>
                <button
                  onClick={openNew}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors mx-auto"
                >
                  <Plus size={14} />
                  New Template
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
