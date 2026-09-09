'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, Send, Filter, CheckCircle2, AlertTriangle, RefreshCw, Eye, Shield, BarChart2, Users, Loader2, Search, Tag, CheckSquare, X, Clock, Inbox, Star, ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { PORTFOLIOS } from '@/contexts/PortfolioContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VerifiedLead {
  id: string;
  contact_name: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  stage: string | null;
  portfolio: string | null;
  prospect_score: number | null;
  verification_status: string | null;
  verification_score: number | null;
  email_opt_in: boolean | null;
  do_not_contact: boolean | null;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string | null;
  portfolio: string | null;
}

interface CampaignDeliveryReport {
  campaignId: string;
  templateName: string;
  totalRequested: number;
  eligible: number;
  sent: number;
  failed: number;
  skipped: number;
  skippedReasons: { noEmail: number; doNotContact: number; optedOut: number; notVerified: number };
  completedAt: string;
  durationMs: number;
}

interface CampaignHistoryRow {
  id: string;
  campaign_name: string;
  template_id: string | null;
  total_sent: number;
  total_failed: number;
  total_skipped: number;
  status: string;
  created_at: string;
  filters_used: Record<string, unknown>;
  // Delivery event tracking
  delivery_events?: DeliveryEvent[];
}

interface DeliveryEvent {
  id: string;
  campaign_id: string;
  channel: 'email' | 'sms';
  recipient: string;
  status: 'delivered' | 'failed' | 'bounced' | 'opened' | 'clicked';
  error_message: string | null;
  timestamp: string;
  provider_message_id: string | null;
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

// ─── Verification Badge ───────────────────────────────────────────────────────

function VerificationBadge({ status, score }: { status: string | null; score: number | null }) {
  const isVerified = status === 'VERIFIED' && (score ?? 0) >= 75;
  if (isVerified) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-semibold border border-emerald-200">
        <CheckCircle2 size={8} /> VERIFIED
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[9px] font-semibold border border-amber-200">
      <AlertTriangle size={8} /> UNVERIFIED
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EmailCampaignsPage() {
  const { user } = useAuth();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<'compose' | 'history' | 'reports'>('compose');

  // Filters
  const [filterStages, setFilterStages] = useState<string[]>([]);
  const [filterPortfolio, setFilterPortfolio] = useState<string>('all');
  const [filterMinScore, setFilterMinScore] = useState<number>(0);
  const [filterVerifiedOnly, setFilterVerifiedOnly] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Leads
  const [leads, setLeads] = useState<VerifiedLead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [loadingLeads, setLoadingLeads] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Preview
  const [showPreview, setShowPreview] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);

  // Campaign name
  const [campaignName, setCampaignName] = useState('');

  // Dry run / send
  const [dryRunResult, setDryRunResult] = useState<CampaignDeliveryReport | null>(null);
  const [sending, setSending] = useState(false);
  const [sendReport, setSendReport] = useState<CampaignDeliveryReport | null>(null);

  // History
  const [history, setHistory] = useState<CampaignHistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [deliveryEvents, setDeliveryEvents] = useState<Record<string, DeliveryEvent[]>>({});
  const [loadingEvents, setLoadingEvents] = useState<string | null>(null);

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

  // ─── Load Verified Leads ───────────────────────────────────────────────────

  const loadLeads = useCallback(async () => {
    setLoadingLeads(true);
    let query = supabase
      .from('leads')
      .select('id, contact_name, email, address, city, state, stage, portfolio, prospect_score, verification_status, verification_score, email_opt_in, do_not_contact')
      .order('prospect_score', { ascending: false })
      .limit(300);

    // Always filter to verified leads only (core requirement)
    if (filterVerifiedOnly) {
      query = query.eq('verification_status', 'VERIFIED').gte('verification_score', 75);
    }

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

    const { data } = await query;
    setLeads((data || []) as VerifiedLead[]);
    setLoadingLeads(false);
  }, [supabase, filterStages, filterPortfolio, filterMinScore, filterVerifiedOnly, searchQuery]);

  // ─── Load Campaign History ─────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from('email_campaigns')
      .select('id, campaign_name, template_id, total_sent, total_failed, total_skipped, status, created_at, filters_used')
      .order('created_at', { ascending: false })
      .limit(50);
    setHistory((data || []) as CampaignHistoryRow[]);
    setLoadingHistory(false);
  }, [supabase]);

  // ─── Load Delivery Events for a campaign ──────────────────────────────────

  const loadDeliveryEvents = useCallback(async (campaignId: string) => {
    if (deliveryEvents[campaignId]) {
      // Already loaded — just toggle
      setExpandedCampaignId(prev => prev === campaignId ? null : campaignId);
      return;
    }
    setLoadingEvents(campaignId);
    setExpandedCampaignId(campaignId);
    try {
      const { data } = await supabase
        .from('campaign_delivery_events')
        .select('id, campaign_id, channel, recipient, status, error_message, timestamp, provider_message_id')
        .eq('campaign_id', campaignId)
        .order('timestamp', { ascending: false })
        .limit(100);
      setDeliveryEvents(prev => ({ ...prev, [campaignId]: (data || []) as DeliveryEvent[] }));
    } catch {
      setDeliveryEvents(prev => ({ ...prev, [campaignId]: [] }));
    } finally {
      setLoadingEvents(null);
    }
  }, [supabase, deliveryEvents]);

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
        setDryRunResult({
          campaignId: 'dry-run',
          templateName: data.templateName,
          totalRequested: data.totalRequested,
          eligible: data.eligible,
          sent: 0,
          failed: 0,
          skipped: data.skipped,
          skippedReasons: { ...data.skippedReasons, notVerified: 0 },
          completedAt: new Date().toISOString(),
          durationMs: 0,
        });
      } else {
        toast.error(data.error || 'Dry run failed');
      }
    } catch {
      toast.error('Failed to run compliance check');
    } finally {
      setSending(false);
    }
  };

  // ─── Send Campaign ─────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!selectedTemplateId) { toast.error('Select a template first'); return; }
    if (selectedLeadIds.size === 0) { toast.error('Select at least one lead'); return; }
    if (selectedLeadIds.size > 500) { toast.error('Max 500 leads per batch'); return; }
    if (!campaignName.trim()) { toast.error('Enter a campaign name'); return; }

    setSending(true);
    setDryRunResult(null);
    const t0 = Date.now();

    try {
      // First, create the campaign record to get an ID for delivery event logging
      const { data: campaignRecord, error: campaignErr } = await supabase.from('email_campaigns').insert({
        campaign_name: campaignName.trim(),
        template_id: selectedTemplateId,
        total_sent: 0,
        total_failed: 0,
        total_skipped: 0,
        status: 'sending',
        filters_used: { stages: filterStages, portfolio: filterPortfolio, minScore: filterMinScore, verifiedOnly: filterVerifiedOnly },
        created_by: user?.id,
      }).select('id').single();

      const campaignId = campaignRecord?.id || null;

      const res = await fetch('/api/bulk-email-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplateId,
          leadIds: Array.from(selectedLeadIds),
          senderName: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'TRAVLR Team',
          dryRun: false,
          campaignId,
        }),
      });
      const data = await res.json();

      if (data.success) {
        const report: CampaignDeliveryReport = {
          campaignId: campaignId || `campaign-${Date.now()}`,
          templateName: data.templateName,
          totalRequested: data.totalRequested,
          eligible: data.eligible,
          sent: data.sent,
          failed: data.failed,
          skipped: data.skipped,
          skippedReasons: { ...data.skippedReasons, notVerified: 0 },
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - t0,
        };
        setSendReport(report);

        // Update campaign record with final counts
        if (campaignId) {
          await supabase.from('email_campaigns').update({
            total_sent: data.sent,
            total_failed: data.failed,
            total_skipped: data.skipped,
            status: data.failed > 0 ? 'partial' : 'completed',
          }).eq('id', campaignId).catch(() => {});
        } else if (!campaignErr) {
          // Fallback: insert if not already created
          await supabase.from('email_campaigns').insert({
            campaign_name: campaignName.trim(),
            template_id: selectedTemplateId,
            total_sent: data.sent,
            total_failed: data.failed,
            total_skipped: data.skipped,
            status: data.failed > 0 ? 'partial' : 'completed',
            filters_used: { stages: filterStages, portfolio: filterPortfolio, minScore: filterMinScore, verifiedOnly: filterVerifiedOnly },
            created_by: user?.id,
          }).catch(() => {});
        }

        toast.success(`Campaign sent: ${data.sent} emails delivered`);
        setActiveTab('reports');
      } else {
        // Mark campaign as failed
        if (campaignId) {
          await supabase.from('email_campaigns').update({ status: 'failed' }).eq('id', campaignId).catch(() => {});
        }
        toast.error(data.error || 'Send failed');
      }
    } catch {
      toast.error('Campaign send failed');
    } finally {
      setSending(false);
    }
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || null;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Mail size={24} className="text-primary" />
              Email Campaigns
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Send templated emails to verified leads only — filtered by portfolio, stage, and score
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
              <Shield size={12} />
              Verified Leads Only
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {[
            { key: 'compose', label: 'Compose & Send', icon: Send },
            { key: 'history', label: 'Campaign History', icon: Inbox },
            { key: 'reports', label: 'Delivery Reports', icon: BarChart2 },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-primary' :'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Compose Tab ── */}
        {activeTab === 'compose' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Filters + Lead List */}
            <div className="lg:col-span-2 space-y-4">
              {/* Campaign Name */}
              <div className="bg-card border border-border rounded-xl p-4">
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Campaign Name</label>
                <input
                  value={campaignName}
                  onChange={e => setCampaignName(e.target.value)}
                  placeholder="e.g. Colorado Q4 Outreach"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              {/* Filters */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Filter size={14} className="text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">Recipient Filters</span>
                </div>

                {/* Verified Only Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="flex items-center gap-2">
                    <Shield size={14} className="text-emerald-600" />
                    <span className="text-sm font-semibold text-emerald-700">Verified Leads Only (score ≥ 75)</span>
                  </div>
                  <button
                    onClick={() => setFilterVerifiedOnly(!filterVerifiedOnly)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${filterVerifiedOnly ? 'bg-emerald-500' : 'bg-muted'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${filterVerifiedOnly ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Portfolio */}
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Portfolio</label>
                    <select
                      value={filterPortfolio}
                      onChange={e => setFilterPortfolio(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none"
                    >
                      <option value="all">All Portfolios</option>
                      {REAL_PORTFOLIOS.map(p => (
                        <option key={p.key} value={p.label}>{p.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Min Score */}
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                      Min Score: <span className="text-primary font-bold">{filterMinScore}</span>
                    </label>
                    <input
                      type="range" min={0} max={100} step={5}
                      value={filterMinScore}
                      onChange={e => setFilterMinScore(Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>
                </div>

                {/* Stages */}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                    Stages (empty = all)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {PIPELINE_STAGES.map(s => (
                      <button
                        key={s}
                        onClick={() => setFilterStages(prev =>
                          prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
                        )}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-colors ${
                          filterStages.includes(s)
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search */}
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by name, address, or email…"
                    className="w-full pl-8 pr-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none"
                  />
                </div>

                <button
                  onClick={loadLeads}
                  disabled={loadingLeads}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {loadingLeads ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Apply Filters
                </button>
              </div>

              {/* Lead List */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">
                      {leads.length} Leads
                    </span>
                    {filterVerifiedOnly && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-semibold">
                        Verified Only
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{selectedLeadIds.size} selected</span>
                    <button onClick={selectAll} className="text-xs text-primary hover:underline">All</button>
                    <button onClick={clearAll} className="text-xs text-muted-foreground hover:underline">None</button>
                  </div>
                </div>

                {loadingLeads ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={20} className="animate-spin text-primary" />
                  </div>
                ) : leads.length === 0 ? (
                  <div className="text-center py-12">
                    <Shield size={28} className="text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No verified leads match your filters</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {filterVerifiedOnly ? 'Only leads with verification_status=VERIFIED and score≥75 are shown' : 'Try adjusting your filters'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                    {leads.map(lead => {
                      const isSelected = selectedLeadIds.has(lead.id);
                      const isEligible = !!(lead.email && !lead.do_not_contact && lead.email_opt_in !== false);
                      return (
                        <div
                          key={lead.id}
                          onClick={() => isEligible && toggleLead(lead.id)}
                          className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                            isEligible ? 'cursor-pointer hover:bg-muted/20' : 'opacity-50 cursor-not-allowed'
                          } ${isSelected ? 'bg-primary/5' : ''}`}
                        >
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                            isSelected ? 'bg-primary border-primary' : 'border-border'
                          }`}>
                            {isSelected && <CheckSquare size={10} className="text-primary-foreground" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-foreground truncate">
                                {lead.contact_name || 'Unknown'}
                              </span>
                              <VerificationBadge status={lead.verification_status} score={lead.verification_score} />
                              {lead.stage && (
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${STAGE_COLORS[lead.stage] || 'bg-gray-100 text-gray-600'}`}>
                                  {lead.stage}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                              <span className="truncate">{lead.address}{lead.city ? `, ${lead.city}` : ''}</span>
                              {lead.email && <span className="shrink-0 text-primary">✉</span>}
                              {!isEligible && <span className="text-danger shrink-0">⊘ ineligible</span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {lead.prospect_score != null && (
                              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/30 text-xs font-bold text-foreground">
                                <Star size={9} className="text-amber-500" />
                                {lead.prospect_score}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Selection summary */}
                {selectedLeadIds.size > 0 && (
                  <div className="px-4 py-2.5 border-t border-border bg-muted/10 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {selectedLeadIds.size} selected · {eligibleSelected} eligible for send
                    </span>
                    {selectedLeadIds.size - eligibleSelected > 0 && (
                      <span className="text-amber-600 flex items-center gap-1">
                        <AlertTriangle size={10} />
                        {selectedLeadIds.size - eligibleSelected} will be skipped (no email / DNC / opted out)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Template + Actions */}
            <div className="space-y-4">
              {/* Template Selector */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Tag size={14} className="text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">Email Template</span>
                </div>

                {loadingTemplates ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 size={16} className="animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {templates.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTemplateId(t.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                          selectedTemplateId === t.id
                            ? 'border-primary bg-primary/5' :'border-border hover:border-primary/30 hover:bg-muted/20'
                        }`}
                      >
                        <div className="text-xs font-semibold text-foreground truncate">{t.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate mt-0.5">{t.subject}</div>
                        {t.category && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground mt-1 inline-block">
                            {t.category}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {selectedTemplate && (
                  <button
                    onClick={() => { setPreviewTemplate(selectedTemplate); setShowPreview(true); }}
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <Eye size={11} /> Preview template
                  </button>
                )}
              </div>

              {/* Dry Run */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Shield size={14} className="text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">Compliance Check</span>
                </div>

                <button
                  onClick={handleDryRun}
                  disabled={sending || !selectedTemplateId || selectedLeadIds.size === 0}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-50 transition-colors"
                >
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                  Run Dry Run
                </button>

                {dryRunResult && (
                  <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-1.5 text-xs">
                    <div className="font-semibold text-foreground mb-2">Dry Run Results</div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Requested</span><span className="font-mono">{dryRunResult.totalRequested}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Eligible</span><span className="font-mono text-emerald-600">{dryRunResult.eligible}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Skipped (no email)</span><span className="font-mono text-amber-600">{dryRunResult.skippedReasons.noEmail}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Skipped (DNC)</span><span className="font-mono text-danger">{dryRunResult.skippedReasons.doNotContact}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Skipped (opted out)</span><span className="font-mono text-amber-600">{dryRunResult.skippedReasons.optedOut}</span></div>
                  </div>
                )}
              </div>

              {/* Send */}
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Send size={14} className="text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">Send Campaign</span>
                </div>

                <div className="p-3 rounded-lg bg-muted/20 border border-border text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Selected leads</span>
                    <span className="font-mono font-bold">{selectedLeadIds.size}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Eligible to send</span>
                    <span className="font-mono font-bold text-emerald-600">{eligibleSelected}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Template</span>
                    <span className="font-medium truncate max-w-[120px]">{selectedTemplate?.name || '—'}</span>
                  </div>
                </div>

                <button
                  onClick={handleSend}
                  disabled={sending || !selectedTemplateId || selectedLeadIds.size === 0 || eligibleSelected === 0 || !campaignName.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {sending ? 'Sending…' : `Send to ${eligibleSelected} Leads`}
                </button>

                {(!campaignName.trim() || !selectedTemplateId || selectedLeadIds.size === 0) && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    {!campaignName.trim() ? 'Enter a campaign name' : !selectedTemplateId ? 'Select a template' : 'Select at least one lead'}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── History Tab ── */}
        {activeTab === 'history' && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Inbox size={15} className="text-primary" />
                <span className="text-sm font-semibold text-foreground">Campaign History</span>
              </div>
              <button onClick={loadHistory} disabled={loadingHistory} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-50">
                <RefreshCw size={13} className={loadingHistory ? 'animate-spin' : ''} />
              </button>
            </div>

            {loadingHistory ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin text-primary" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-12">
                <Inbox size={28} className="text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No campaigns sent yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Campaign</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Sent</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Failed</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Skipped</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Success Rate</th>
                      <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">Status</th>
                      <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground">Date</th>
                      <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">Events</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {history.map(row => {
                      const total = (row.total_sent || 0) + (row.total_failed || 0);
                      const successRate = total > 0 ? Math.round(((row.total_sent || 0) / total) * 100) : 0;
                      const isExpanded = expandedCampaignId === row.id;
                      const events = deliveryEvents[row.id] || [];
                      const isLoadingThisRow = loadingEvents === row.id;

                      return (
                        <React.Fragment key={row.id}>
                          <tr className="hover:bg-muted/10 transition-colors">
                            <td className="px-4 py-3 font-medium text-foreground">{row.campaign_name}</td>
                            <td className="px-3 py-3 text-right font-mono text-emerald-600">{row.total_sent}</td>
                            <td className="px-3 py-3 text-right font-mono text-danger">{row.total_failed}</td>
                            <td className="px-3 py-3 text-right font-mono text-muted-foreground">{row.total_skipped}</td>
                            <td className="px-3 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${successRate >= 90 ? 'bg-emerald-500' : successRate >= 70 ? 'bg-amber-500' : 'bg-danger'}`}
                                    style={{ width: `${successRate}%` }}
                                  />
                                </div>
                                <span className={`font-mono font-bold w-8 text-right ${successRate >= 90 ? 'text-emerald-600' : successRate >= 70 ? 'text-amber-600' : 'text-danger'}`}>
                                  {successRate}%
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                row.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                                row.status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'
                              }`}>
                                {row.status === 'completed' ? <CheckCircle2 size={9} /> : <AlertTriangle size={9} />}
                                {row.status}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right text-muted-foreground">{timeAgo(row.created_at)}</td>
                            <td className="px-3 py-3 text-center">
                              <button
                                onClick={() => loadDeliveryEvents(row.id)}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/30 hover:bg-muted text-muted-foreground hover:text-foreground text-[10px] font-medium transition-colors mx-auto"
                              >
                                {isLoadingThisRow ? (
                                  <Loader2 size={10} className="animate-spin" />
                                ) : isExpanded ? (
                                  <ChevronUp size={10} />
                                ) : (
                                  <ChevronDown size={10} />
                                )}
                                Events
                              </button>
                            </td>
                          </tr>

                          {/* Delivery Events Expansion */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={8} className="px-0 py-0">
                                <div className="bg-muted/5 border-t border-border px-4 py-3">
                                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                    Delivery Events — {row.campaign_name}
                                  </div>
                                  {isLoadingThisRow ? (
                                    <div className="flex items-center justify-center py-4">
                                      <Loader2 size={16} className="animate-spin text-primary" />
                                    </div>
                                  ) : events.length === 0 ? (
                                    <div className="text-center py-4">
                                      <p className="text-xs text-muted-foreground">No delivery events logged for this campaign.</p>
                                      <p className="text-[10px] text-muted-foreground mt-1">Events are logged when the campaign_delivery_events table is populated by the send pipeline.</p>
                                    </div>
                                  ) : (
                                    <div className="space-y-1 max-h-48 overflow-y-auto">
                                      {/* Summary row */}
                                      <div className="flex items-center gap-4 text-[10px] text-muted-foreground pb-2 border-b border-border mb-2">
                                        <span className="text-emerald-600 font-semibold">
                                          ✓ {events.filter(e => e.status === 'delivered' || e.status === 'opened' || e.status === 'clicked').length} delivered
                                        </span>
                                        <span className="text-danger font-semibold">
                                          ✗ {events.filter(e => e.status === 'failed' || e.status === 'bounced').length} failed/bounced
                                        </span>
                                        <span className="text-blue-600 font-semibold">
                                          👁 {events.filter(e => e.status === 'opened').length} opened
                                        </span>
                                      </div>
                                      {events.map(ev => (
                                        <div key={ev.id} className="flex items-center gap-3 text-[11px] py-1">
                                          <span className={`w-2 h-2 rounded-full shrink-0 ${
                                            ev.status === 'delivered' || ev.status === 'opened' || ev.status === 'clicked' ? 'bg-emerald-500' :
                                            ev.status === 'failed' || ev.status === 'bounced' ? 'bg-danger' : 'bg-muted'
                                          }`} />
                                          <span className="w-10 text-muted-foreground font-mono uppercase text-[9px]">{ev.channel}</span>
                                          <span className="flex-1 truncate text-foreground">{ev.recipient}</span>
                                          <span className={`font-semibold text-[10px] ${
                                            ev.status === 'delivered' ? 'text-emerald-600' :
                                            ev.status === 'opened' ? 'text-blue-600' :
                                            ev.status === 'clicked' ? 'text-primary' :
                                            ev.status === 'failed' || ev.status === 'bounced' ? 'text-danger' : 'text-muted-foreground'
                                          }`}>{ev.status}</span>
                                          {ev.error_message && (
                                            <span className="text-danger text-[10px] truncate max-w-[120px]" title={ev.error_message}>
                                              {ev.error_message}
                                            </span>
                                          )}
                                          <span className="text-muted-foreground text-[10px] shrink-0">
                                            {new Date(ev.timestamp).toLocaleTimeString()}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Reports Tab ── */}
        {activeTab === 'reports' && (
          <div className="space-y-4">
            {sendReport ? (
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-600">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-foreground">Campaign Sent Successfully</h2>
                    <p className="text-xs text-muted-foreground">{sendReport.templateName} · {timeAgo(sendReport.completedAt)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  {[
                    { label: 'Requested', value: sendReport.totalRequested, color: 'text-foreground' },
                    { label: 'Sent', value: sendReport.sent, color: 'text-emerald-600' },
                    { label: 'Failed', value: sendReport.failed, color: 'text-danger' },
                    { label: 'Skipped', value: sendReport.skipped, color: 'text-amber-600' },
                  ].map(stat => (
                    <div key={stat.label} className="bg-muted/20 rounded-xl p-4 text-center">
                      <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                      <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="font-semibold text-foreground mb-3">Skip Breakdown</div>
                  {[
                    { label: 'No email address', value: sendReport.skippedReasons.noEmail },
                    { label: 'Do Not Contact', value: sendReport.skippedReasons.doNotContact },
                    { label: 'Opted out', value: sendReport.skippedReasons.optedOut },
                  ].map(r => (
                    <div key={r.label} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                      <span className="text-muted-foreground text-xs">{r.label}</span>
                      <span className="font-mono text-xs font-semibold">{r.value}</span>
                    </div>
                  ))}
                </div>

                {sendReport.durationMs > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-4 flex items-center gap-1">
                    <Clock size={10} />
                    Completed in {(sendReport.durationMs / 1000).toFixed(1)}s
                  </p>
                )}
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl p-12 text-center">
                <BarChart2 size={32} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">No report yet</p>
                <p className="text-xs text-muted-foreground mt-1">Send a campaign to see delivery results here</p>
                <button
                  onClick={() => setActiveTab('compose')}
                  className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  Compose Campaign
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Template Preview Modal */}
      {showPreview && previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-sm font-bold text-foreground">{previewTemplate.name}</h2>
              <button onClick={() => setShowPreview(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X size={14} />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Subject</div>
                <div className="text-sm font-medium text-foreground">{previewTemplate.subject}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Body</div>
                <div className="text-xs text-foreground whitespace-pre-wrap bg-muted/20 rounded-lg p-3 max-h-64 overflow-y-auto">
                  {previewTemplate.body}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
