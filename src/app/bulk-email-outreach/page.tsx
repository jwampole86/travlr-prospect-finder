'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, Send, Filter, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Eye, Shield, BarChart2, Users, Loader2, Search, Tag, TrendingUp, AlertCircle, CheckSquare, Square, X } from 'lucide-react';
import { toast } from 'sonner';
import { PORTFOLIOS } from '@/contexts/PortfolioContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lead {
  id: string;
  contact_name: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  stage: string | null;
  portfolio: string | null;
  prospect_score: number | null;
  email_opt_in: boolean | null;
  do_not_contact: boolean | null;
  enrichment_stage: number | null;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string | null;
  portfolio: string | null;
}

interface DeliveryReport {
  totalRequested: number;
  eligible: number;
  sent: number;
  failed: number;
  skipped: number;
  skippedReasons: { noEmail: number; doNotContact: number; optedOut: number };
  templateName: string;
  completedAt: string;
}

interface OutreachHistoryRow {
  id: string;
  lead_id: string;
  subject: string | null;
  status: string;
  recipient_email: string | null;
  sent_at: string;
  template_id: string | null;
  failure_reason: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PIPELINE_STAGES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Closed', 'Lost'];
const REAL_PORTFOLIOS = PORTFOLIOS.filter(p => p.key !== 'all');

const STAGE_COLORS: Record<string, string> = {
  New: 'bg-blue-100 text-blue-700',
  Contacted: 'bg-purple-100 text-purple-700',
  Qualified: 'bg-green-100 text-green-700',
  Proposal: 'bg-amber-100 text-amber-700',
  Negotiation: 'bg-orange-100 text-orange-700',
  Closed: 'bg-emerald-100 text-emerald-700',
  Lost: 'bg-gray-100 text-gray-600',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BulkEmailOutreachPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<'compose' | 'history' | 'reports'>('compose');

  // Filters
  const [filterStages, setFilterStages] = useState<string[]>([]);
  const [filterPortfolio, setFilterPortfolio] = useState<string>('all');
  const [filterMinScore, setFilterMinScore] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');

  // Leads
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [totalLeadCount, setTotalLeadCount] = useState(0);

  // Templates
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Preview
  const [showPreview, setShowPreview] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const [previewLead, setPreviewLead] = useState<Lead | null>(null);

  // Dry run / send
  const [dryRunResult, setDryRunResult] = useState<DeliveryReport | null>(null);
  const [sending, setSending] = useState(false);
  const [sendReport, setSendReport] = useState<DeliveryReport | null>(null);

  // History
  const [history, setHistory] = useState<OutreachHistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ─── Load Templates ────────────────────────────────────────────────────────

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    const { data } = await supabase
      .from('email_templates')
      .select('id, name, subject, body, category, portfolio')
      .order('name', { ascending: true });
    setTemplates((data || []) as EmailTemplate[]);
    setLoadingTemplates(false);
  }, [supabase]);

  // ─── Load Leads ────────────────────────────────────────────────────────────

  const loadLeads = useCallback(async () => {
    setLoadingLeads(true);
    let query = supabase
      .from('leads')
      .select('id, contact_name, email, address, city, state, stage, portfolio, prospect_score, email_opt_in, do_not_contact, enrichment_stage')
      .order('prospect_score', { ascending: false })
      .limit(200);

    if (filterStages.length > 0) {
      query = query.in('stage', filterStages);
    }
    if (filterPortfolio !== 'all') {
      query = query.eq('portfolio', filterPortfolio);
    }
    if (filterMinScore > 0) {
      query = query.gte('prospect_score', filterMinScore);
    }
    if (searchQuery.trim()) {
      query = query.or(`contact_name.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`);
    }

    const { data, count } = await query;
    setLeads((data || []) as Lead[]);
    setTotalLeadCount(count || data?.length || 0);
    setLoadingLeads(false);
  }, [supabase, filterStages, filterPortfolio, filterMinScore, searchQuery]);

  // ─── Load History ──────────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from('outreach_history')
      .select('id, lead_id, subject, status, recipient_email, sent_at, template_id, failure_reason')
      .eq('channel', 'email')
      .order('sent_at', { ascending: false })
      .limit(100);
    setHistory((data || []) as OutreachHistoryRow[]);
    setLoadingHistory(false);
  }, [supabase]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);
  useEffect(() => { loadLeads(); }, [loadLeads]);
  useEffect(() => { if (activeTab === 'history') loadHistory(); }, [activeTab, loadHistory]);

  // ─── Selection ─────────────────────────────────────────────────────────────

  const toggleLead = (id: string) => {
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedLeadIds(new Set(leads.map(l => l.id)));
  const clearAll = () => setSelectedLeadIds(new Set());

  const eligibleSelected = leads.filter(l =>
    selectedLeadIds.has(l.id) && l.email && !l.do_not_contact && l.email_opt_in !== false
  ).length;

  const ineligibleSelected = selectedLeadIds.size - eligibleSelected;

  // ─── Dry Run ───────────────────────────────────────────────────────────────

  const handleDryRun = async () => {
    if (!selectedTemplateId) { toast.error('Select a template first'); return; }
    if (selectedLeadIds.size === 0) { toast.error('Select at least one lead'); return; }

    setSending(true);
    try {
      const res = await fetch('/api/bulk-email-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplateId,
          leadIds: Array.from(selectedLeadIds),
          senderName: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'TRAVLR Team',
          dryRun: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDryRunResult({ ...data, completedAt: new Date().toISOString() });
      } else {
        toast.error(data.error || 'Dry run failed');
      }
    } catch {
      toast.error('Failed to run compliance check');
    } finally {
      setSending(false);
    }
  };

  // ─── Send ──────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!selectedTemplateId) { toast.error('Select a template first'); return; }
    if (selectedLeadIds.size === 0) { toast.error('Select at least one lead'); return; }
    if (selectedLeadIds.size > 500) { toast.error('Max 500 leads per batch'); return; }

    setSending(true);
    setDryRunResult(null);
    try {
      const res = await fetch('/api/bulk-email-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplateId,
          leadIds: Array.from(selectedLeadIds),
          senderName: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'TRAVLR Team',
          dryRun: false,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const report: DeliveryReport = { ...data, completedAt: new Date().toISOString() };
        setSendReport(report);
        toast.success(`Sent ${data.sent} emails successfully`);
        clearAll();
        if (activeTab === 'history') loadHistory();
      } else {
        toast.error(data.error || 'Send failed');
      }
    } catch {
      toast.error('Failed to send emails');
    } finally {
      setSending(false);
    }
  };

  // ─── Preview ───────────────────────────────────────────────────────────────

  const handlePreview = () => {
    const tpl = templates.find(t => t.id === selectedTemplateId);
    if (!tpl) { toast.error('Select a template first'); return; }
    const sampleLead = leads.find(l => selectedLeadIds.has(l.id)) || leads[0];
    setPreviewTemplate(tpl);
    setPreviewLead(sampleLead || null);
    setShowPreview(true);
  };

  function fillPreview(text: string, lead: Lead | null, senderName: string): string {
    if (!lead) return text;
    return text
      .replace(/\{\{contactName\}\}/g, lead.contact_name || 'there')
      .replace(/\{\{senderName\}\}/g, senderName)
      .replace(/\{\{address\}\}/g, lead.address || '[address]')
      .replace(/\{\{city\}\}/g, lead.city || '[city]')
      .replace(/\{\{price\}\}/g, lead.prospect_score ? `$${(lead.prospect_score * 20).toLocaleString()}` : '[price]')
      .replace(/\{\{[^}]+\}\}/g, '[variable]');
  }

  const senderName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'TRAVLR Team';

  // ─── History stats ─────────────────────────────────────────────────────────

  const historySent = history.filter(h => h.status === 'sent' || h.status === 'delivered').length;
  const historyFailed = history.filter(h => h.status === 'failed' || h.status === 'bounced').length;
  const historyOpened = history.filter(h => h.status === 'opened').length;
  const historyReplied = history.filter(h => h.status === 'replied').length;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Mail size={22} className="text-primary" />
              Bulk Email Outreach
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Send templated emails to leads by pipeline stage with compliance tracking and delivery reporting
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          {[
            { key: 'compose', label: 'Compose & Send', icon: Send },
            { key: 'history', label: 'Delivery History', icon: BarChart2 },
            { key: 'reports', label: 'Reports', icon: TrendingUp },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-primary' :'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Compose & Send ── */}
        {activeTab === 'compose' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Left: Filters + Lead List */}
            <div className="lg:col-span-2 space-y-4">

              {/* Filters */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Filter size={14} className="text-primary" />
                  Filter Leads by Pipeline Stage
                </div>

                {/* Stage chips */}
                <div className="flex flex-wrap gap-2">
                  {PIPELINE_STAGES.map(stage => (
                    <button
                      key={stage}
                      onClick={() => setFilterStages(prev =>
                        prev.includes(stage) ? prev.filter(s => s !== stage) : [...prev, stage]
                      )}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        filterStages.includes(stage)
                          ? `${STAGE_COLORS[stage]} border-current`
                          : 'bg-muted/30 text-muted-foreground border-border hover:bg-muted/50'
                      }`}
                    >
                      {stage}
                    </button>
                  ))}
                  {filterStages.length > 0 && (
                    <button
                      onClick={() => setFilterStages([])}
                      className="px-3 py-1 rounded-full text-xs text-muted-foreground border border-border hover:bg-muted/40"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <select
                    value={filterPortfolio}
                    onChange={e => setFilterPortfolio(e.target.value)}
                    className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground"
                  >
                    <option value="all">All Portfolios</option>
                    {REAL_PORTFOLIOS.map(p => (
                      <option key={p.key} value={p.label}>{p.label}</option>
                    ))}
                  </select>
                  <select
                    value={filterMinScore}
                    onChange={e => setFilterMinScore(Number(e.target.value))}
                    className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground"
                  >
                    <option value={0}>Any Score</option>
                    <option value={40}>Score 40+</option>
                    <option value={60}>Score 60+</option>
                    <option value={80}>Score 80+</option>
                  </select>
                  <div className="flex items-center gap-2 flex-1 min-w-[160px]">
                    <Search size={14} className="text-muted-foreground shrink-0" />
                    <input
                      type="text"
                      placeholder="Search name, address, email…"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="flex-1 text-sm border border-border rounded-lg px-3 py-1.5 bg-background text-foreground placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
              </div>

              {/* Lead List */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
                  <div className="flex items-center gap-3">
                    <button onClick={selectedLeadIds.size === leads.length ? clearAll : selectAll} className="text-xs text-primary hover:underline">
                      {selectedLeadIds.size === leads.length ? 'Deselect all' : 'Select all'}
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {selectedLeadIds.size} selected · {eligibleSelected} eligible · {ineligibleSelected > 0 && <span className="text-amber-600">{ineligibleSelected} ineligible</span>}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{leads.length} shown</span>
                </div>

                {loadingLeads ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 size={18} className="animate-spin mr-2" /> Loading leads…
                  </div>
                ) : leads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Users size={28} className="mb-2" />
                    <p className="text-sm">No leads match your filters</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border max-h-[480px] overflow-y-auto">
                    {leads.map(lead => {
                      const isSelected = selectedLeadIds.has(lead.id);
                      const isEligible = !!lead.email && !lead.do_not_contact && lead.email_opt_in !== false;
                      return (
                        <div
                          key={lead.id}
                          onClick={() => toggleLead(lead.id)}
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/20'}`}
                        >
                          <div className="shrink-0">
                            {isSelected
                              ? <CheckSquare size={16} className="text-primary" />
                              : <Square size={16} className="text-muted-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground truncate">{lead.contact_name || 'Unknown'}</span>
                              {lead.stage && (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STAGE_COLORS[lead.stage] || 'bg-gray-100 text-gray-600'}`}>
                                  {lead.stage}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{lead.address || 'No address'} · {lead.email || 'No email'}</div>
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            {lead.prospect_score != null && (
                              <span className="text-xs font-medium text-foreground">{lead.prospect_score}</span>
                            )}
                            {!isEligible && (
                              <span title={!lead.email ? 'No email' : lead.do_not_contact ? 'DNC' : 'Opted out'}>
                                <AlertTriangle size={12} className="text-amber-500" />
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Template + Actions */}
            <div className="space-y-4">

              {/* Template Selector */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Tag size={14} className="text-primary" />
                  Select Template
                </div>
                {loadingTemplates ? (
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Loading…</div>
                ) : (
                  <select
                    value={selectedTemplateId}
                    onChange={e => setSelectedTemplateId(e.target.value)}
                    className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground"
                  >
                    <option value="">— Choose a template —</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.portfolio ? ` (${t.portfolio})` : ''}
                      </option>
                    ))}
                  </select>
                )}
                {selectedTemplateId && (
                  <button
                    onClick={handlePreview}
                    className="w-full flex items-center justify-center gap-2 text-sm text-primary border border-primary/30 rounded-lg py-2 hover:bg-primary/5 transition-colors"
                  >
                    <Eye size={14} />
                    Preview with sample lead
                  </button>
                )}
              </div>

              {/* Compliance Summary */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Shield size={14} className="text-green-600" />
                  Compliance Check
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Selected leads</span>
                    <span className="font-medium text-foreground">{selectedLeadIds.size}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1"><CheckCircle2 size={10} className="text-green-600" /> Eligible</span>
                    <span className="font-medium text-green-600">{eligibleSelected}</span>
                  </div>
                  {ineligibleSelected > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1"><AlertTriangle size={10} className="text-amber-500" /> Ineligible</span>
                      <span className="font-medium text-amber-600">{ineligibleSelected}</span>
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/50">
                  Ineligible = no email, DNC flag, or opted out. These are automatically skipped.
                </div>
              </div>

              {/* Dry Run */}
              <button
                onClick={handleDryRun}
                disabled={sending || selectedLeadIds.size === 0 || !selectedTemplateId}
                className="w-full flex items-center justify-center gap-2 text-sm border border-border rounded-xl py-2.5 hover:bg-muted/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                Run Compliance Check (Dry Run)
              </button>

              {/* Dry Run Result */}
              {dryRunResult && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2 text-xs">
                  <div className="font-semibold text-blue-800 flex items-center gap-1.5"><CheckCircle2 size={12} /> Dry Run Complete</div>
                  <div className="space-y-1 text-blue-700">
                    <div className="flex justify-between"><span>Requested</span><span>{dryRunResult.totalRequested}</span></div>
                    <div className="flex justify-between"><span>Will send</span><span className="font-bold text-green-700">{dryRunResult.eligible}</span></div>
                    <div className="flex justify-between"><span>Skipped (no email)</span><span>{dryRunResult.skippedReasons.noEmail}</span></div>
                    <div className="flex justify-between"><span>Skipped (DNC)</span><span>{dryRunResult.skippedReasons.doNotContact}</span></div>
                    <div className="flex justify-between"><span>Skipped (opted out)</span><span>{dryRunResult.skippedReasons.optedOut}</span></div>
                  </div>
                </div>
              )}

              {/* Send Button */}
              <button
                onClick={handleSend}
                disabled={sending || selectedLeadIds.size === 0 || !selectedTemplateId}
                className="w-full flex items-center justify-center gap-2 text-sm bg-primary text-primary-foreground rounded-xl py-3 font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {sending ? 'Sending…' : `Send to ${eligibleSelected} eligible leads`}
              </button>

              {/* Send Report */}
              {sendReport && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2 text-xs">
                  <div className="font-semibold text-green-800 flex items-center gap-1.5"><CheckCircle2 size={12} /> Send Complete</div>
                  <div className="space-y-1 text-green-700">
                    <div className="flex justify-between"><span>Sent</span><span className="font-bold">{sendReport.sent}</span></div>
                    <div className="flex justify-between"><span>Failed</span><span className={sendReport.failed > 0 ? 'text-red-600 font-bold' : ''}>{sendReport.failed}</span></div>
                    <div className="flex justify-between"><span>Skipped</span><span>{sendReport.skipped}</span></div>
                    <div className="flex justify-between"><span>Template</span><span className="truncate max-w-[120px]">{sendReport.templateName}</span></div>
                  </div>
                  <button
                    onClick={() => setActiveTab('history')}
                    className="text-green-700 underline text-[10px] mt-1"
                  >
                    View delivery history →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Delivery History ── */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Sent', value: historySent, color: 'text-green-600', icon: CheckCircle2 },
                { label: 'Failed / Bounced', value: historyFailed, color: 'text-red-600', icon: XCircle },
                { label: 'Opened', value: historyOpened, color: 'text-blue-600', icon: Eye },
                { label: 'Replied', value: historyReplied, color: 'text-purple-600', icon: Mail },
              ].map(stat => (
                <div key={stat.label} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <stat.icon size={12} className={stat.color} />
                    {stat.label}
                  </div>
                  <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                </div>
              ))}
            </div>

            {/* History Table */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20">
                <span className="text-sm font-medium text-foreground">Recent Email Sends</span>
                <button onClick={loadHistory} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <RefreshCw size={12} /> Refresh
                </button>
              </div>
              {loadingHistory ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 size={18} className="animate-spin mr-2" /> Loading history…
                </div>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Mail size={28} className="mb-2" />
                  <p className="text-sm">No email history yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/20 text-xs text-muted-foreground">
                        <th className="text-left px-5 py-2.5 font-medium">Recipient</th>
                        <th className="text-left px-4 py-2.5 font-medium">Subject</th>
                        <th className="text-left px-4 py-2.5 font-medium">Status</th>
                        <th className="text-left px-4 py-2.5 font-medium">Sent</th>
                        <th className="text-left px-4 py-2.5 font-medium">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map(row => (
                        <tr key={row.id} className="border-t border-border/50 hover:bg-muted/10">
                          <td className="px-5 py-2.5 text-foreground text-xs truncate max-w-[160px]">{row.recipient_email || '—'}</td>
                          <td className="px-4 py-2.5 text-muted-foreground text-xs truncate max-w-[200px]">{row.subject || '—'}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                              row.status === 'sent' || row.status === 'delivered' ? 'bg-green-50 text-green-700 border-green-200' :
                              row.status === 'failed' || row.status === 'bounced' ? 'bg-red-50 text-red-700 border-red-200' :
                              row.status === 'opened' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              row.status === 'replied'? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-muted/30 text-muted-foreground border-border'
                            }`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{timeAgo(row.sent_at)}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground truncate max-w-[160px]">{row.failure_reason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Reports ── */}
        {activeTab === 'reports' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <TrendingUp size={16} className="text-primary" />
                Delivery Performance Summary
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-foreground">{history.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Total Emails Sent</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {history.length > 0 ? Math.round((historySent / history.length) * 100) : 0}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Delivery Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">
                    {history.length > 0 ? Math.round((historyOpened / history.length) * 100) : 0}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Open Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600">
                    {history.length > 0 ? Math.round((historyReplied / history.length) * 100) : 0}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Reply Rate</div>
                </div>
              </div>

              {/* Status breakdown bar */}
              {history.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-2">Status Breakdown</div>
                  <div className="h-3 rounded-full overflow-hidden flex">
                    {historySent > 0 && <div className="bg-green-500 transition-all" style={{ width: `${(historySent / history.length) * 100}%` }} title={`Sent: ${historySent}`} />}
                    {historyOpened > 0 && <div className="bg-blue-500 transition-all" style={{ width: `${(historyOpened / history.length) * 100}%` }} title={`Opened: ${historyOpened}`} />}
                    {historyReplied > 0 && <div className="bg-purple-500 transition-all" style={{ width: `${(historyReplied / history.length) * 100}%` }} title={`Replied: ${historyReplied}`} />}
                    {historyFailed > 0 && <div className="bg-red-400 transition-all" style={{ width: `${(historyFailed / history.length) * 100}%` }} title={`Failed: ${historyFailed}`} />}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Sent</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Opened</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />Replied</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Failed</span>
                  </div>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Shield size={11} className="text-green-600" />
                  Compliance: All sends respect DNC flags, email opt-out status, and TCPA consent. Ineligible leads are automatically excluded from every batch.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Preview Modal ── */}
        {showPreview && previewTemplate && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div className="font-semibold text-foreground flex items-center gap-2">
                  <Eye size={16} className="text-primary" />
                  Email Preview — {previewTemplate.name}
                </div>
                <button onClick={() => setShowPreview(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={18} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Subject</div>
                  <div className="text-sm font-medium text-foreground bg-muted/20 rounded-lg px-3 py-2">
                    {fillPreview(previewTemplate.subject, previewLead, senderName)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Body (sample lead: {previewLead?.contact_name || 'Unknown'})</div>
                  <div className="text-sm text-foreground bg-muted/10 border border-border rounded-lg px-4 py-3 whitespace-pre-wrap leading-relaxed">
                    {fillPreview(previewTemplate.body, previewLead, senderName)}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertCircle size={11} className="inline mr-1 text-amber-600" />
                  Variables like <code className="font-mono">{'{{proposedRent}}'}</code> will be blank unless manually set per lead.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
