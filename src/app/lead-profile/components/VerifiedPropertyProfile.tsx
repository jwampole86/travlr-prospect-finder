'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Phone, Home, DollarSign, TrendingUp, Star, MessageSquare, User, Users, AlertCircle, RefreshCw, ExternalLink, CheckCircle2, Building2, Activity, Shield, Database, Edit3, Save, X, Loader2, UserCheck, Check, Zap, Eye, FileSearch } from 'lucide-react';
import { toast } from 'sonner';
import PropertyRegulationPanel from '@/components/PropertyRegulationPanel';

interface VerifiedPropertyProfileProps {
  leadId: string;
  onClose?: () => void;
}

type ProfileTab = 'overview' | 'revenue' | 'listing' | 'contact' | 'owner-intelligence' | 'propertyreach' | 'regulations' | 'outreach' | 'activity' | 'assignment' | 'sources';

const TABS: { key: ProfileTab; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Overview', icon: <Home size={13} /> },
  { key: 'revenue', label: 'Revenue', icon: <TrendingUp size={13} /> },
  { key: 'listing', label: 'Listing', icon: <Building2 size={13} /> },
  { key: 'contact', label: 'Owner / Contact', icon: <User size={13} /> },
  { key: 'owner-intelligence', label: 'Owner Intelligence', icon: <Shield size={13} /> },
  { key: 'propertyreach', label: 'PropertyReach', icon: <Zap size={13} /> },
  { key: 'regulations', label: 'Regulations', icon: <Shield size={13} /> },
  { key: 'outreach', label: 'Outreach', icon: <MessageSquare size={13} /> },
  { key: 'activity', label: 'Activity', icon: <Activity size={13} /> },
  { key: 'assignment', label: 'Assignment', icon: <Users size={13} /> },
  { key: 'sources', label: 'Data Sources', icon: <Database size={13} /> },
];

const OUTREACH_STATUSES = [
  'NOT_CONTACTED', 'ATTEMPTED', 'CONTACTED', 'RESPONDED',
  'FOLLOW_UP', 'APPOINTMENT_SCHEDULED', 'QUALIFIED', 'CONVERTED',
  'NOT_INTERESTED', 'DO_NOT_CONTACT',
];

const OUTREACH_COLORS: Record<string, string> = {
  NOT_CONTACTED: 'bg-muted text-muted-foreground',
  ATTEMPTED: 'bg-amber-500/10 text-amber-600',
  CONTACTED: 'bg-blue-500/10 text-blue-600',
  RESPONDED: 'bg-emerald-500/10 text-emerald-600',
  FOLLOW_UP: 'bg-purple-500/10 text-purple-600',
  APPOINTMENT_SCHEDULED: 'bg-green-500/10 text-green-600',
  QUALIFIED: 'bg-teal-500/10 text-teal-600',
  CONVERTED: 'bg-emerald-600/10 text-emerald-700',
  NOT_INTERESTED: 'bg-red-500/10 text-red-600',
  DO_NOT_CONTACT: 'bg-red-700/10 text-red-700',
};

const ENRICHMENT_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-muted text-muted-foreground',
  MATCHING: 'bg-blue-500/10 text-blue-600',
  ENRICHED: 'bg-emerald-500/10 text-emerald-600',
  PARTIAL: 'bg-amber-500/10 text-amber-600',
  NO_MATCH: 'bg-orange-500/10 text-orange-600',
  ERROR: 'bg-red-500/10 text-red-600',
};

function formatCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function VerificationBadge({ label, verified }: { label: string; verified: boolean }) {
  if (!verified) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
      <CheckCircle2 size={10} />
      {label}
    </span>
  );
}

function DataRow({ label, value, source, sourceLabel }: { label: string; value: React.ReactNode; source?: string; sourceLabel?: string }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0 w-40">{label}</span>
      <div className="flex-1 text-right">
        <span className="text-xs text-foreground font-medium">{value || '—'}</span>
        {source && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Source: {sourceLabel || source}
          </p>
        )}
      </div>
    </div>
  );
}

export default function VerifiedPropertyProfile({ leadId, onClose }: VerifiedPropertyProfileProps) {
  const { user } = useAuth();
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const [lead, setLead] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<Array<{ id: string; full_name: string; email: string }>>([]);
  const [activityLog, setActivityLog] = useState<any[]>([]);
  const [assignedAgents, setAssignedAgents] = useState<any[]>([]);
  const [outreachStatus, setOutreachStatus] = useState('NOT_CONTACTED');
  const [savingOutreach, setSavingOutreach] = useState(false);
  const [retryingEnrichment, setRetryingEnrichment] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [contactEdits, setContactEdits] = useState({ contactName: '', contactPhone: '', contactEmail: '' });
  const [ownerMatches, setOwnerMatches] = useState<Record<string, unknown>[]>([]);
  const [ownerPhones, setOwnerPhones] = useState<Record<string, unknown>[]>([]);
  const [enrichmentJob, setEnrichmentJob] = useState<Record<string, unknown> | null>(null);
  const [enrichmentLoading, setEnrichmentLoading] = useState(false);
  const [startingEnrichment, setStartingEnrichment] = useState(false);
  const [prJobs, setPrJobs] = useState<Record<string, unknown>[]>([]);
  const [prMatches, setPrMatches] = useState<Record<string, unknown>[]>([]);
  const [prAuditEvents, setPrAuditEvents] = useState<Record<string, unknown>[]>([]);
  const [prLeadState, setPrLeadState] = useState<Record<string, unknown> | null>(null);
  const [prLoading, setPrLoading] = useState(false);
  const [startingPrEnrichment, setStartingPrEnrichment] = useState(false);
  const [showEvidencePanel, setShowEvidencePanel] = useState<string | null>(null);

  const loadLead = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const { data } = await supabase.from('leads').select('*').eq('id', leadId).single();
      if (data) {
        setLead(data);
        setOutreachStatus(data.outreach_status || 'NOT_CONTACTED');
        setContactEdits({
          contactName: data.contact_name || '',
          contactPhone: data.contact_phone || '',
          contactEmail: data.contact_email || '',
        });
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [leadId, supabase]);

  const loadAgents = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('agent_invites')
        .select('agent_user_id, first_name, last_name, email')
        .eq('status', 'completed')
        .order('first_name');
      if (data) {
        setAgents(data.map((a: any) => ({
          id: a.agent_user_id,
          full_name: `${a.first_name} ${a.last_name}`.trim(),
          email: a.email,
        })));
      }
    } catch { /* silent */ }
  }, [supabase]);

  const loadAssignedAgents = useCallback(async () => {
    if (!leadId) return;
    try {
      const { data } = await supabase
        .from('lead_agent_assignments')
        .select('*')
        .eq('lead_id', leadId)
        .is('unassigned_at', null)
        .order('is_primary', { ascending: false });
      if (data) setAssignedAgents(data);
    } catch { /* silent */ }
  }, [leadId, supabase]);

  const loadActivityLog = useCallback(async () => {
    if (!leadId) return;
    try {
      const { data } = await supabase
        .from('lead_activity_log')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) setActivityLog(data);
    } catch { /* silent */ }
  }, [leadId, supabase]);

  const loadOwnerIntelligence = useCallback(async () => {
    if (!leadId) return;
    setEnrichmentLoading(true);
    try {
      const res = await fetch(`/api/enrichment/owner-enrichment?leadId=${leadId}`);
      if (res.ok) {
        const data = await res.json();
        setOwnerMatches(data.ownerMatches || []);
        setOwnerPhones(data.phones || []);
        setEnrichmentJob(data.jobs?.[0] || null);
      }
    } catch { /* silent */ }
    setEnrichmentLoading(false);
  }, [leadId]);

  const loadPropertyReachData = useCallback(async () => {
    if (!leadId) return;
    setPrLoading(true);
    try {
      const res = await fetch(`/api/enrichment/propertyreach?leadId=${leadId}`);
      if (res.ok) {
        const data = await res.json();
        setPrJobs(data.jobs || []);
        setPrMatches(data.matches || []);
        setPrAuditEvents(data.auditEvents || []);
        setPrLeadState(data.leadEnrichmentState || null);
      }
    } catch { /* silent */ }
    setPrLoading(false);
  }, [leadId]);

  useEffect(() => {
    loadLead();
    loadAgents();
    loadAssignedAgents();
    loadActivityLog();
    loadOwnerIntelligence();
    loadPropertyReachData();
  }, [loadLead, loadAgents, loadAssignedAgents, loadActivityLog, loadOwnerIntelligence, loadPropertyReachData]);

  async function handleOutreachStatusChange(status: string) {
    setSavingOutreach(true);
    try {
      await supabase.from('leads').update({ outreach_status: status, updated_at: new Date().toISOString() }).eq('id', leadId);
      setOutreachStatus(status);
      setLead(prev => prev ? { ...prev, outreach_status: status } : prev);

      // Log activity
      await supabase.from('lead_activity_log').insert({
        lead_id: leadId,
        activity_type: 'OUTREACH_STATUS_CHANGED',
        activity_data: { from: outreachStatus, to: status },
        performed_by: user?.id || null,
      });

      toast.success(`Outreach status updated to ${status.replace(/_/g, ' ')}`);
    } catch {
      toast.error('Failed to update outreach status');
    }
    setSavingOutreach(false);
  }

  async function handleRetryEnrichment() {
    setRetryingEnrichment(true);
    try {
      const res = await fetch('/api/leads/retry-enrichment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: [leadId] }),
      });
      if (res.ok) {
        toast.success('Enrichment retry queued');
        await loadLead();
      } else {
        toast.error('Retry failed');
      }
    } catch {
      toast.error('Retry failed');
    }
    setRetryingEnrichment(false);
  }

  async function handleSaveContactEdits() {
    try {
      await supabase.from('leads').update({
        contact_name: contactEdits.contactName || null,
        contact_phone: contactEdits.contactPhone || null,
        admin_override_fields: { contact_name: true, contact_phone: true },
        admin_override_by: user?.id || null,
        admin_override_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', leadId);

      await supabase.from('lead_activity_log').insert({
        lead_id: leadId,
        activity_type: 'CONTACT_EDITED',
        activity_data: { ...contactEdits, source: 'ADMIN_OVERRIDE' },
        performed_by: user?.id || null,
      });

      setLead(prev => prev ? { ...prev, contact_name: contactEdits.contactName, contact_phone: contactEdits.contactPhone } : prev);
      setEditingContact(false);
      toast.success('Contact updated (Admin Override)');
    } catch {
      toast.error('Failed to save contact');
    }
  }

  async function handleAssignAgent(agentId: string) {
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;
    try {
      const now = new Date().toISOString();
      await supabase.from('leads').update({
        primary_agent_id: agentId,
        primary_agent_name: agent.full_name,
        assigned_at: now,
        assigned_by: user?.id || null,
        updated_at: now,
      }).eq('id', leadId);

      await supabase.from('lead_agent_assignments').upsert({
        lead_id: leadId,
        agent_id: agentId,
        agent_name: agent.full_name,
        is_primary: true,
        assigned_at: now,
        assigned_by: user?.id || null,
      }, { onConflict: 'lead_id,agent_id' });

      await supabase.from('app_notifications').insert({
        user_id: agentId,
        type: 'new_lead',
        title: '📋 New Lead Assigned to You',
        message: `Lead at ${lead?.address || 'unknown address'} assigned to you.`,
        read: false,
        metadata: { lead_id: leadId, assigned_by: user?.id, link: `/lead-profile?id=${leadId}` },
      });

      await supabase.from('lead_activity_log').insert({
        lead_id: leadId,
        activity_type: 'AGENT_ASSIGNED',
        activity_data: { agent_id: agentId, agent_name: agent.full_name },
        performed_by: user?.id || null,
      });

      setLead(prev => prev ? { ...prev, primary_agent_id: agentId, primary_agent_name: agent.full_name } : prev);
      await loadAssignedAgents();
      toast.success(`Assigned to ${agent.full_name}`);
    } catch {
      toast.error('Assignment failed');
    }
  }

  async function handleRemoveAssignment(agentId: string) {
    try {
      await supabase.from('lead_agent_assignments').update({ unassigned_at: new Date().toISOString() }).eq('lead_id', leadId).eq('agent_id', agentId);
      if (lead?.primary_agent_id === agentId) {
        await supabase.from('leads').update({ primary_agent_id: null, primary_agent_name: null, updated_at: new Date().toISOString() }).eq('id', leadId);
        setLead(prev => prev ? { ...prev, primary_agent_id: null, primary_agent_name: null } : prev);
      }
      await loadAssignedAgents();
      toast.success('Assignment removed');
    } catch {
      toast.error('Failed to remove assignment');
    }
  }

  async function handleStartEnrichment() {
    if (!lead) return;
    setStartingEnrichment(true);
    try {
      const res = await fetch('/api/enrichment/owner-enrichment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          address: lead.address,
          city: lead.city,
          state: lead.state,
          zip: lead.zip,
          apn: lead.apn,
          scope: 'MISSING_OWNER_AND_PHONE',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Owner enrichment job queued');
        setTimeout(loadOwnerIntelligence, 2000);
      } else {
        toast.error(data.error || 'Failed to start enrichment');
      }
    } catch {
      toast.error('Failed to start enrichment');
    }
    setStartingEnrichment(false);
  }

  async function handleStartPrEnrichment(forceRefresh = false) {
    if (!lead) return;
    setStartingPrEnrichment(true);
    try {
      const res = await fetch('/api/enrichment/propertyreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          address: lead.address,
          city: lead.city,
          state: lead.state,
          zip: lead.zip,
          apn: lead.apn || lead.property_reach_apn,
          forceRefresh,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(forceRefresh ? 'Refresh job queued — owner data will update shortly' : 'PropertyReach enrichment started');
        setTimeout(loadPropertyReachData, 2500);
        setTimeout(loadPropertyReachData, 6000);
      } else {
        toast.error(data.error || 'Failed to start PropertyReach enrichment');
      }
    } catch {
      toast.error('Failed to start enrichment');
    }
    setStartingPrEnrichment(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Lead not found
      </div>
    );
  }

  const verifiedOwner = lead.verified_owner || false;
  const verifiedAddress = lead.verification_status === 'VERIFIED' && (lead.verification_score || 0) >= 75;
  const verifiedNumber = lead.verified_number || lead.has_phone || false;
  const isManualImport = lead.source_type === 'MANUAL_VERIFIED_IMPORT' || lead.is_verified_lead;
  const priorityTier = lead.priority_tier || 3;

  const priorityLabel = priorityTier === 1 ? 'HIGH PRIORITY' : priorityTier === 2 ? 'MEDIUM PRIORITY' : 'STANDARD';
  const priorityColor = priorityTier === 1 ? 'bg-orange-500/10 text-orange-600 border-orange-500/20' : priorityTier === 2 ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : 'bg-muted text-muted-foreground border-border';

  return (
    <div className="flex flex-col h-full bg-background">
      {/* ── Profile Header ─────────────────────────────────────────────────── */}
      <div className="bg-card border-b border-border px-6 py-4 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${priorityColor}`}>
                {priorityLabel}
              </span>
              {isManualImport && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-600 border border-purple-500/20">
                  ✓ VERIFIED LEAD
                </span>
              )}
              <VerificationBadge label="Verified Owner" verified={verifiedOwner} />
              <VerificationBadge label="Verified Address" verified={verifiedAddress} />
              <VerificationBadge label="Verified Number" verified={verifiedNumber} />
            </div>
            <h1 className="text-lg font-bold text-foreground truncate">{lead.address}</h1>
            <p className="text-sm text-muted-foreground">{[lead.city, lead.state, lead.zip].filter(Boolean).join(', ')}</p>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0">
              <X size={16} />
            </button>
          )}
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="bg-muted/30 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Current Rent</p>
            <p className="text-sm font-bold text-foreground">
              {lead.current_monthly_rent ? formatCurrency(lead.current_monthly_rent) + '/mo' : '—'}
            </p>
            {lead.rent_source && <p className="text-[10px] text-muted-foreground">{lead.rent_source}</p>}
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">TRAVLR Annual Gross</p>
            <p className="text-sm font-bold text-emerald-600">
              {lead.estimated_gross_monthly ? formatCurrency(lead.estimated_gross_monthly * 12) + '/yr' : '—'}
            </p>
            <p className="text-[10px] text-muted-foreground">TRAVLR Estimate</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Owner Net</p>
            <p className="text-sm font-bold text-foreground">
              {lead.estimated_net_monthly ? formatCurrency(lead.estimated_net_monthly * 12) + '/yr' : '—'}
            </p>
            <p className="text-[10px] text-muted-foreground">TRAVLR Estimate</p>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Prospect Score</p>
            <p className="text-sm font-bold text-foreground">{lead.prospect_score || 0}/100</p>
            <p className="text-[10px] text-muted-foreground">
              {lead.primary_agent_name ? `Assigned: ${lead.primary_agent_name}` : 'Unassigned'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="border-b border-border bg-card shrink-0 overflow-x-auto">
        <div className="flex items-center gap-0 px-4 min-w-max">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-primary text-primary' :'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-5">

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5"><Home size={12} />Property Details</h3>
                <DataRow label="Address" value={lead.address} />
                <DataRow label="City" value={lead.city} />
                <DataRow label="State" value={lead.state} />
                <DataRow label="ZIP" value={lead.zip} />
                <DataRow label="Property Type" value={lead.property_type || 'Unknown'} />
                <DataRow label="Bedrooms" value={lead.beds} source={lead.beds_source} />
                <DataRow label="Bathrooms" value={lead.baths} />
                <DataRow label="Square Feet" value={lead.square_feet ? `${lead.square_feet.toLocaleString()} sq ft` : null} />
                <DataRow label="Year Built" value={lead.year_built} />
                <DataRow label="Lot Size" value={lead.lot_size ? `${lead.lot_size} acres` : null} />
                <DataRow label="Portfolio" value={lead.portfolio_name} />
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5"><Star size={12} />Verification Status</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Verified Owner</span>
                    <VerificationBadge label="✓ Verified Owner" verified={verifiedOwner} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Verified Address</span>
                    <VerificationBadge label="✓ Verified Address" verified={verifiedAddress} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Verified Number</span>
                    <VerificationBadge label="✓ Verified Number" verified={verifiedNumber} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Manual Verified Import</span>
                    {isManualImport ? (
                      <span className="text-[11px] font-semibold text-purple-600">Yes</span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">No</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Priority Tier</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${priorityColor}`}>{priorityLabel}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Enrichment Status</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ENRICHMENT_STATUS_COLORS[lead.enrichment_status || 'PENDING'] || 'bg-muted text-muted-foreground'}`}>
                      {lead.enrichment_status || 'PENDING'}
                    </span>
                  </div>
                  {(lead.enrichment_status === 'ERROR' || lead.enrichment_status === 'NO_MATCH' || lead.enrichment_status === 'PARTIAL') && (
                    <button
                      onClick={handleRetryEnrichment}
                      disabled={retryingEnrichment}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50"
                    >
                      {retryingEnrichment ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                      Retry Enrichment
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Amenities */}
            {(lead.has_pool || lead.has_parking || lead.is_waterfront) && (
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-xs font-semibold text-foreground mb-3">Amenities</h3>
                <div className="flex flex-wrap gap-2">
                  {lead.has_pool && <span className="px-2 py-1 bg-blue-500/10 text-blue-600 text-xs rounded-full">Pool</span>}
                  {lead.has_parking && <span className="px-2 py-1 bg-green-500/10 text-green-600 text-xs rounded-full">Parking</span>}
                  {lead.is_waterfront && <span className="px-2 py-1 bg-cyan-500/10 text-cyan-600 text-xs rounded-full">Waterfront</span>}
                  {lead.hoa_fee && <span className="px-2 py-1 bg-amber-500/10 text-amber-600 text-xs rounded-full">HOA: {formatCurrency(lead.hoa_fee)}/mo</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* REVENUE TAB */}
        {activeTab === 'revenue' && (
          <div className="space-y-4">
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-400">
              <p className="font-semibold mb-1">Revenue Transparency</p>
              <p>Values labeled <strong>TRAVLR Estimate</strong> are calculated by the TRAVLR revenue model, not sourced from a listing. Values labeled with a source (e.g., Manual Research, Zillow) are from that source.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Current Rent */}
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5"><DollarSign size={12} />Current Rental Income</h3>
                <DataRow
                  label="Current Asking Rent"
                  value={lead.current_asking_rent ? formatCurrency(lead.current_asking_rent) + '/mo' : 'Not Found'}
                  source={lead.rent_source}
                />
                <DataRow
                  label="Estimated Market Rent"
                  value={lead.estimated_market_rent ? formatCurrency(lead.estimated_market_rent) + '/mo' : '—'}
                  sourceLabel="TRAVLR Estimate"
                />
                <DataRow
                  label="Annualized Current Rent"
                  value={lead.current_asking_rent ? formatCurrency(lead.current_asking_rent * 12) + '/yr' : '—'}
                />
                <DataRow
                  label="Rent Verification"
                  value={
                    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${lead.rent_verification_status === 'FOUND' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                      {lead.rent_verification_status || 'NOT_FOUND'}
                    </span>
                  }
                />
              </div>

              {/* TRAVLR Projections */}
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5"><TrendingUp size={12} />TRAVLR Revenue Opportunity</h3>
                <DataRow label="Projected ADR" value={lead.estimated_adr ? formatCurrency(lead.estimated_adr) + '/night' : '—'} sourceLabel="TRAVLR Estimate" />
                <DataRow label="Projected Occupancy" value={lead.estimated_occupancy ? `${lead.estimated_occupancy}%` : '—'} sourceLabel="TRAVLR Estimate" />
                <DataRow label="Monthly Gross Revenue" value={lead.estimated_gross_monthly ? formatCurrency(lead.estimated_gross_monthly) + '/mo' : '—'} sourceLabel="TRAVLR Estimate" />
                <DataRow label="Annual Gross Revenue" value={lead.estimated_gross_monthly ? formatCurrency(lead.estimated_gross_monthly * 12) + '/yr' : '—'} sourceLabel="TRAVLR Estimate" />
                <DataRow label="TRAVLR Mgmt Fee (20%)" value={lead.estimated_gross_monthly ? formatCurrency(lead.estimated_gross_monthly * 12 * 0.20) + '/yr' : '—'} sourceLabel="TRAVLR Estimate" />
                <DataRow label="Owner Gross Revenue" value={lead.estimated_gross_monthly ? formatCurrency(lead.estimated_gross_monthly * 12 * 0.80) + '/yr' : '—'} sourceLabel="TRAVLR Estimate" />
                <DataRow label="Owner Net Revenue" value={lead.estimated_net_monthly ? formatCurrency(lead.estimated_net_monthly * 12) + '/yr' : '—'} sourceLabel="TRAVLR Estimate" />
              </div>
            </div>

            {/* Uplift comparison */}
            {lead.current_asking_rent && lead.estimated_gross_monthly && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-3">Potential Revenue Uplift</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Current Long-Term Rent</p>
                    <p className="text-base font-bold text-foreground">{formatCurrency(lead.current_asking_rent)}/mo</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(lead.current_asking_rent * 12)}/yr</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">TRAVLR Projected Gross</p>
                    <p className="text-base font-bold text-emerald-600">{formatCurrency(lead.estimated_gross_monthly)}/mo</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(lead.estimated_gross_monthly * 12)}/yr</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Potential Increase</p>
                    <p className="text-base font-bold text-emerald-600">
                      +{formatCurrency((lead.estimated_gross_monthly - lead.current_asking_rent) * 12)}/yr
                    </p>
                    <p className="text-xs text-emerald-600">
                      +{Math.round(((lead.estimated_gross_monthly - lead.current_asking_rent) / lead.current_asking_rent) * 100)}%
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-3 text-center">
                  TRAVLR Estimate — not a guarantee. Actual results depend on property condition, market, and management.
                </p>
              </div>
            )}

            {lead.calculation_version && (
              <p className="text-[10px] text-muted-foreground text-right">
                Calculation: {lead.calculation_version} · {lead.calculated_at ? new Date(lead.calculated_at).toLocaleDateString() : '—'}
              </p>
            )}
          </div>
        )}

        {/* LISTING TAB */}
        {activeTab === 'listing' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5"><Building2 size={12} />Listing Information</h3>
              <DataRow label="Listing Status" value={lead.listing_status || 'Unknown'} source={lead.listing_status_source} />
              <DataRow label="Current Asking Rent" value={lead.current_asking_rent ? formatCurrency(lead.current_asking_rent) + '/mo' : 'Not Found'} source={lead.rent_source} />
              <DataRow label="Days on Market" value={lead.days_on_market_listing !== null ? `${lead.days_on_market_listing} days` : null} />
              <DataRow label="Listing Date" value={lead.listing_date} />
              <DataRow label="Source" value={lead.source} />
              {lead.listing_source_url ? (
                <div className="flex items-start justify-between py-2 border-b border-border/50">
                  <span className="text-xs text-muted-foreground shrink-0 w-40">Listing URL</span>
                  <a
                    href={lead.listing_source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <ExternalLink size={10} />
                    View Listing
                  </a>
                </div>
              ) : (
                <DataRow label="Listing URL" value="No verified listing found" />
              )}
            </div>

            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-400">
              <p className="font-semibold mb-1 flex items-center gap-1.5"><AlertCircle size={11} />Data Integrity Notice</p>
              <p>Listing URLs are only shown when returned by an authorized data source. No URLs are fabricated from addresses. If no listing is shown, the property was not found in an active listing database at time of import.</p>
            </div>
          </div>
        )}

        {/* OWNER / CONTACT TAB */}
        {activeTab === 'contact' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5"><User size={12} />Owner / Contact</h3>
                <button
                  onClick={() => setEditingContact(v => !v)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Edit3 size={11} />
                  {editingContact ? 'Cancel' : 'Edit (Admin Override)'}
                </button>
              </div>

              {editingContact ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Contact Name</label>
                    <input
                      value={contactEdits.contactName}
                      onChange={e => setContactEdits(p => ({ ...p, contactName: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Phone</label>
                    <input
                      value={contactEdits.contactPhone}
                      onChange={e => setContactEdits(p => ({ ...p, contactPhone: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleSaveContactEdits} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors">
                      <Save size={11} />Save Override
                    </button>
                    <button onClick={() => setEditingContact(false)} className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
                  </div>
                  <p className="text-[10px] text-amber-600">Admin overrides are stored with provenance and will not be overwritten by automated enrichment.</p>
                </div>
              ) : (
                <>
                  <DataRow label="Contact Name" value={lead.contact_name || lead.owner_name} source={lead.owner_source} />
                  <DataRow label="Phone" value={lead.contact_phone} source={lead.phone_source} />
                  <DataRow label="Owner Verified" value={verifiedOwner ? '✓ Yes (Manual Research)' : 'Not verified'} />
                  <DataRow label="Phone Verified" value={verifiedNumber ? '✓ Yes (Manual Research)' : 'No phone'} />
                  <DataRow label="Ownership Record" value={lead.ownership_record_verified ? '✓ Title Confirmed' : 'Manual Research Only'} />
                  {lead.admin_override_fields && Object.keys(lead.admin_override_fields).length > 0 && (
                    <div className="mt-2 p-2 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                      <p className="text-[10px] text-amber-600 font-medium">Admin Override Applied</p>
                      <p className="text-[10px] text-muted-foreground">Fields: {Object.keys(lead.admin_override_fields).join(', ')}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Contact actions */}
            {lead.contact_phone && (
              <div className="flex gap-2">
                <a
                  href={`tel:${lead.contact_phone}`}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 rounded-lg text-sm font-medium hover:bg-emerald-500/20 transition-colors"
                >
                  <Phone size={13} />
                  Call
                </a>
                <a
                  href={`sms:${lead.contact_phone}`}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20 rounded-lg text-sm font-medium hover:bg-blue-500/20 transition-colors"
                >
                  <MessageSquare size={13} />
                  SMS
                </a>
              </div>
            )}
          </div>
        )}

        {/* REGULATIONS TAB */}
        {activeTab === 'regulations' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-xs font-semibold text-foreground mb-4 flex items-center gap-1.5">
                <Shield size={12} />
                City Regulations / STR Rules
              </h3>
              <PropertyRegulationPanel
                leadId={leadId}
                city={lead?.city}
                state={lead?.state}
                isAdmin={true}
              />
            </div>

            {/* State vs City distinction */}
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-400">
              <p className="font-semibold mb-1">City vs. State Rules</p>
              <p>The regulation shown above is the <strong>local/city jurisdiction layer</strong>. State-level regulations are tracked separately and may impose additional requirements. Always verify both layers before advising on STR feasibility.</p>
            </div>
          </div>
        )}

        {/* OUTREACH TAB */}
        {activeTab === 'outreach' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5"><MessageSquare size={12} />Outreach Status</h3>
              <div className="grid grid-cols-2 gap-2">
                {OUTREACH_STATUSES.map(status => (
                  <button
                    key={status}
                    onClick={() => handleOutreachStatusChange(status)}
                    disabled={savingOutreach}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                      outreachStatus === status
                        ? `${OUTREACH_COLORS[status] || 'bg-primary/10 text-primary'} border-current`
                        : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <span>{status.replace(/_/g, ' ')}</span>
                    {outreachStatus === status && <CheckCircle2 size={11} />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ACTIVITY TAB */}
        {activeTab === 'activity' && (
          <div className="space-y-3">
            {activityLog.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <Activity size={24} className="mx-auto mb-2 opacity-40" />
                No activity recorded yet
              </div>
            ) : (
              activityLog.map(entry => (
                <div key={entry.id} className="flex items-start gap-3 p-3 bg-card border border-border rounded-xl">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Activity size={12} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{entry.activity_type?.replace(/_/g, ' ')}</p>
                    {entry.activity_data && Object.keys(entry.activity_data).length > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {JSON.stringify(entry.activity_data).slice(0, 100)}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ASSIGNMENT TAB */}
        {activeTab === 'assignment' && (
          <div className="space-y-4">
            {/* Current assignments */}
            {assignedAgents.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-4">
                <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5"><Users size={12} />Assigned Agents</h3>
                <div className="space-y-2">
                  {assignedAgents.map(assignment => (
                    <div key={assignment.id} className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {(assignment.agent_name || 'A').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-xs font-medium text-foreground">{assignment.agent_name || 'Unknown'}</p>
                          {assignment.is_primary && (
                            <span className="text-[10px] text-primary font-medium">Primary Agent</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveAssignment(assignment.agent_id)}
                        className="text-xs text-red-500 hover:underline flex items-center gap-1"
                      >
                        <X size={10} />Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Assign new agent */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5"><UserCheck size={12} />Assign Agent</h3>
              {agents.length === 0 ? (
                <p className="text-xs text-muted-foreground">No active agents found. Invite agents first.</p>
              ) : (
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {agents.map(agent => (
                    <button
                      key={agent.id}
                      onClick={() => handleAssignAgent(agent.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
                        lead.primary_agent_id === agent.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
                      }`}
                    >
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {agent.full_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{agent.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{agent.email}</p>
                      </div>
                      {lead.primary_agent_id === agent.id && <Check size={14} className="text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* DATA SOURCES TAB */}
        {activeTab === 'sources' && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5"><Database size={12} />Field-Level Source Provenance</h3>
              <DataRow label="Address Source" value={lead.address_source || '—'} />
              <DataRow label="Owner Source" value={lead.owner_source || '—'} />
              <DataRow label="Phone Source" value={lead.phone_source || '—'} />
              <DataRow label="Rent Price Source" value={lead.rent_price_source || '—'} />
              <DataRow label="Property Details Source" value={lead.property_details_source || '—'} />
              <DataRow label="Listing Source" value={lead.listing_source_name || '—'} />
              <DataRow label="Record Source" value={lead.record_source || '—'} />
              <DataRow label="Source Type" value={lead.source_type || '—'} />
              <DataRow label="Import Batch" value={lead.import_batch_id || '—'} />
              <DataRow label="Import File" value={lead.import_filename || '—'} />
              <DataRow label="Imported At" value={lead.imported_at ? new Date(lead.imported_at).toLocaleString() : '—'} />
              <DataRow label="Enrichment Status" value={lead.enrichment_status || '—'} />
              <DataRow label="Enrichment Source" value={lead.enrichment_source || '—'} />
              <DataRow label="Calculation Version" value={lead.calculation_version || '—'} />
              <DataRow label="Calculated At" value={lead.calculated_at ? new Date(lead.calculated_at).toLocaleString() : '—'} />
              {lead.admin_override_fields && Object.keys(lead.admin_override_fields).length > 0 && (
                <div className="mt-3 p-2 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                  <p className="text-[10px] text-amber-600 font-semibold">Admin Overrides</p>
                  <p className="text-[10px] text-muted-foreground">Fields: {Object.keys(lead.admin_override_fields).join(', ')}</p>
                  {lead.admin_override_at && <p className="text-[10px] text-muted-foreground">At: {new Date(lead.admin_override_at).toLocaleString()}</p>}
                </div>
              )}
            </div>

            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-400">
              <p className="font-semibold mb-1">Source Integrity</p>
              <p>All data values retain their origin. Automated enrichment will not overwrite Admin Override fields. TRAVLR Estimates are clearly distinguished from source data.</p>
            </div>
          </div>
        )}

        {/* OWNER INTELLIGENCE TAB */}
        {activeTab === 'owner-intelligence' && (
          <div className="space-y-4">
            {/* Compliance Notice */}
            <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
              <Shield size={13} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                <strong>Compliance:</strong> Owner data sourced from licensed property/people APIs only. No Zillow/Trulia scraping. No TruePeopleSearch automation. Phone found ≠ SMS consent.
              </p>
            </div>

            {/* Enrichment Job Status */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Database size={12} />
                  Owner &amp; Contact Intelligence
                </h3>
                <div className="flex items-center gap-2">
                  {enrichmentJob && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      enrichmentJob.job_status === 'FOUND' ? 'bg-emerald-500/10 text-emerald-600' :
                      enrichmentJob.job_status === 'RUNNING' ? 'bg-blue-500/10 text-blue-600' :
                      enrichmentJob.job_status === 'REVIEW_REQUIRED' ? 'bg-amber-500/10 text-amber-600' :
                      enrichmentJob.job_status === 'NO_MATCH' ? 'bg-orange-500/10 text-orange-600' :
                      enrichmentJob.job_status === 'FAILED'? 'bg-red-500/10 text-red-600' : 'bg-muted text-muted-foreground'
                    }`}>
                      {String(enrichmentJob.job_status || '').replace(/_/g, ' ')}
                    </span>
                  )}
                  <button
                    onClick={loadOwnerIntelligence}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>
              </div>

              {enrichmentLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 size={18} className="animate-spin text-muted-foreground" />
                </div>
              ) : ownerMatches.length === 0 && ownerPhones.length === 0 ? (
                <div className="text-center py-6">
                  <User size={28} className="mx-auto mb-2 text-muted-foreground opacity-30" />
                  <p className="text-xs text-muted-foreground mb-3">No owner intelligence data yet</p>
                  <button
                    onClick={handleStartEnrichment}
                    disabled={startingEnrichment}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 mx-auto"
                  >
                    {startingEnrichment ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    {startingEnrichment ? 'Queuing...' : 'Refresh Owner Data'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Owner Matches */}
                  {ownerMatches.map((match: Record<string, unknown>) => (
                    <div key={String(match.id)} className="p-3 rounded-lg bg-muted/40 border border-border/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users size={13} className="text-primary" />
                          <span className="text-sm font-semibold text-foreground">{String(match.owner_name || '—')}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          match.confidence === 'VERIFIED' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                          match.confidence === 'HIGH_CONFIDENCE' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' :
                          match.confidence === 'MEDIUM_CONFIDENCE' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' :
                          match.confidence === 'CONFLICT'? 'bg-red-500/10 text-red-600 border-red-500/20' : 'bg-muted text-muted-foreground border-border'
                        }`}>
                          {String(match.confidence || 'UNKNOWN').replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-[11px]">
                        <div><span className="text-muted-foreground">Owner Type: </span><span className="text-foreground">{String(match.owner_type || '—')}</span></div>
                        <div><span className="text-muted-foreground">Match Score: </span><span className="text-foreground">{String(match.match_score ?? '—')}/100</span></div>
                        <div><span className="text-muted-foreground">Source: </span><span className="text-foreground">{String(match.source_provider || '—')}</span></div>
                        <div><span className="text-muted-foreground">Status: </span><span className="text-foreground">{String(match.match_status || '—').replace(/_/g, ' ')}</span></div>
                      </div>
                      {match.owner_verified_at && (
                        <div className="flex items-center gap-1 text-[10px] text-emerald-600">
                          <CheckCircle2 size={10} />
                          Verified {new Date(String(match.owner_verified_at)).toLocaleDateString()}
                        </div>
                      )}
                      {match.match_status === 'PENDING_REVIEW' && (
                        <div className="flex items-center gap-1.5 text-[10px] text-amber-600 bg-amber-500/5 border border-amber-500/20 rounded px-2 py-1">
                          <AlertCircle size={10} />
                          Awaiting review — visit Enrichment Review Queue
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Phone Evidence */}
                  {ownerPhones.length > 0 && (
                    <div>
                      <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Phone Numbers</h4>
                      <div className="space-y-1.5">
                        {ownerPhones.map((phone: Record<string, unknown>) => (
                          <div key={String(phone.id)} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/50">
                            <div className="flex items-center gap-2">
                              <Phone size={12} className="text-teal-500" />
                              <span className="text-xs font-medium text-foreground">{String(phone.phone_e164 || '—')}</span>
                              <span className="text-[10px] text-muted-foreground">{String(phone.phone_type || 'UNKNOWN')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-semibold ${
                                phone.phone_status === 'CURRENT_HIGH_CONFIDENCE' ? 'text-emerald-600' :
                                phone.phone_status === 'CURRENT_MEDIUM_CONFIDENCE' ? 'text-amber-600' :
                                phone.phone_status === 'HISTORICAL' ? 'text-muted-foreground' :
                                'text-orange-600'
                              }`}>
                                {String(phone.phone_status || '').replace(/_/g, ' ')}
                              </span>
                              {phone.verified_number && <CheckCircle2 size={11} className="text-emerald-500" />}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                        <Shield size={10} />
                        Phone found ≠ SMS consent. Outreach consent tracked separately.
                      </p>
                    </div>
                  )}

                  <button
                    onClick={handleStartEnrichment}
                    disabled={startingEnrichment}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {startingEnrichment ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                    Refresh Owner Data
                  </button>
                </div>
              )}
            </div>

            {/* Last Enriched */}
            {enrichmentJob && (
              <div className="bg-card border border-border rounded-xl p-4 text-xs space-y-1">
                <h3 className="font-semibold text-foreground mb-2">Enrichment Details</h3>
                <DataRow label="Last Enriched" value={enrichmentJob.completed_at ? new Date(String(enrichmentJob.completed_at)).toLocaleString() : 'In progress'} />
                <DataRow label="Property Verified" value={enrichmentJob.property_verified ? 'Yes' : 'No'} />
                <DataRow label="Property Provider" value={String(enrichmentJob.property_provider || '—')} />
                <DataRow label="Match Confidence" value={String(enrichmentJob.match_confidence || '—').replace(/_/g, ' ')} />
                <DataRow label="Match Score" value={enrichmentJob.match_score ? `${enrichmentJob.match_score}/100` : '—'} />
              </div>
            )}
          </div>
        )}

        {/* PROPERTYREACH TAB */}
        {activeTab === 'propertyreach' && (
          <div className="space-y-4">

            {/* Compliance notice */}
            <div className="flex items-start gap-2 p-3 rounded-xl border border-blue-500/20 bg-blue-500/5">
              <Shield size={13} className="text-blue-600 mt-0.5 shrink-0" />
              <div className="text-[11px] text-blue-700 dark:text-blue-400 space-y-0.5">
                <p><strong>PropertyReach Integration</strong> — Licensed property data API. No scraping. No CAPTCHA bypass.</p>
                <p>Phone found ≠ SMS consent. Manual research data is protected from automated overwrites. Wrong homeowner is worse than no result.</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {!prLeadState?.property_reach_id ? (
                <button
                  onClick={() => handleStartPrEnrichment(false)}
                  disabled={startingPrEnrichment}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {startingPrEnrichment ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                  {startingPrEnrichment ? 'Starting...' : 'Enrich Owner & Contact'}
                </button>
              ) : (
                <button
                  onClick={() => handleStartPrEnrichment(true)}
                  disabled={startingPrEnrichment}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                >
                  {startingPrEnrichment ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  {startingPrEnrichment ? 'Queuing...' : 'Refresh Owner Data'}
                </button>
              )}
              <button
                onClick={loadPropertyReachData}
                className="flex items-center gap-1.5 px-3 py-2 text-xs border border-border rounded-lg hover:bg-muted transition-colors"
              >
                <RefreshCw size={12} />
                Refresh Status
              </button>
            </div>

            {prLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Latest job status */}
                {prJobs.length > 0 && (() => {
                  const latestJob = prJobs[0] as Record<string, unknown>;
                  const statusColors: Record<string, string> = {
                    PENDING: 'bg-muted text-muted-foreground',
                    RUNNING: 'bg-blue-500/10 text-blue-600',
                    PROPERTY_MATCHED: 'bg-teal-500/10 text-teal-600',
                    OWNER_RESOLVED: 'bg-emerald-500/10 text-emerald-600',
                    CONTACT_ENRICHED: 'bg-emerald-600/10 text-emerald-700',
                    REVIEW_REQUIRED: 'bg-amber-500/10 text-amber-600',
                    NO_MATCH: 'bg-orange-500/10 text-orange-600',
                    FAILED: 'bg-red-500/10 text-red-600',
                    RATE_LIMITED: 'bg-purple-500/10 text-purple-600',
                  };
                  return (
                    <div className="bg-card border border-border rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Activity size={12} />
                          Latest Enrichment Job
                        </h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColors[String(latestJob.job_status || 'PENDING')] || 'bg-muted text-muted-foreground'}`}>
                          {String(latestJob.job_status || 'PENDING').replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                        <div><span className="text-muted-foreground">Property Match: </span><span className="font-medium text-foreground">{String(latestJob.property_match_status || '—').replace(/_/g, ' ')}</span></div>
                        <div><span className="text-muted-foreground">PropertyReach ID: </span><span className="font-medium text-foreground font-mono">{String(latestJob.property_reach_id || '—')}</span></div>
                        <div><span className="text-muted-foreground">APN: </span><span className="font-medium text-foreground">{String(latestJob.resolved_apn || lead?.property_reach_apn || '—')}</span></div>
                        <div><span className="text-muted-foreground">FIPS: </span><span className="font-medium text-foreground">{String(latestJob.resolved_fips || '—')}</span></div>
                        <div><span className="text-muted-foreground">Owners Found: </span><span className="font-medium text-foreground">{String(latestJob.owner_candidates_count ?? '—')}</span></div>
                        <div><span className="text-muted-foreground">Phones Found: </span><span className="font-medium text-foreground">{String(latestJob.phones_found ?? '—')}</span></div>
                        <div><span className="text-muted-foreground">Confidence Score: </span><span className="font-medium text-foreground">{latestJob.match_confidence_score ? `${latestJob.match_confidence_score}/100` : '—'}</span></div>
                        <div><span className="text-muted-foreground">Confidence: </span><span className="font-medium text-foreground">{String(latestJob.match_confidence_label || '—').replace(/_/g, ' ')}</span></div>
                        <div><span className="text-muted-foreground">Auto Accepted: </span><span className={`font-medium ${latestJob.auto_accepted ? 'text-emerald-600' : 'text-muted-foreground'}`}>{latestJob.auto_accepted ? 'Yes' : 'No'}</span></div>
                        <div><span className="text-muted-foreground">Review Required: </span><span className={`font-medium ${latestJob.requires_review ? 'text-amber-600' : 'text-muted-foreground'}`}>{latestJob.requires_review ? 'Yes' : 'No'}</span></div>
                        <div><span className="text-muted-foreground">Started: </span><span className="font-medium text-foreground">{latestJob.started_at ? new Date(String(latestJob.started_at)).toLocaleString() : '—'}</span></div>
                        <div><span className="text-muted-foreground">Completed: </span><span className="font-medium text-foreground">{latestJob.completed_at ? new Date(String(latestJob.completed_at)).toLocaleString() : 'In progress...'}</span></div>
                      </div>
                      {latestJob.error_message && (
                        <div className="mt-2 p-2 bg-red-500/5 border border-red-500/20 rounded text-[11px] text-red-600">
                          Error: {String(latestJob.error_message)}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Owner & Contact Intelligence */}
                {prMatches.length > 0 && (() => {
                  const bestMatch = prMatches[0] as Record<string, unknown>;
                  const phoneCandidates = (bestMatch.phone_candidates as Record<string, unknown>[]) || [];
                  const emailCandidates = (bestMatch.email_candidates as Record<string, unknown>[]) || [];
                  const ownerCandidates = (bestMatch.owner_candidates as Record<string, unknown>[]) || [];

                  const confidenceColors: Record<string, string> = {
                    VERIFIED: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
                    HIGH_CONFIDENCE: 'bg-blue-500/10 text-blue-700 border-blue-500/20',
                    MEDIUM_CONFIDENCE: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
                    LOW_CONFIDENCE: 'bg-orange-500/10 text-orange-700 border-orange-500/20',
                    CONFLICT: 'bg-red-500/10 text-red-700 border-red-500/20',
                    NO_MATCH: 'bg-muted text-muted-foreground border-border',
                  };

                  return (
                    <div className="space-y-3">
                      {/* OWNER section */}
                      <div className="bg-card border border-border rounded-xl p-4">
                        <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                          <User size={12} className="text-primary" />
                          Owner
                        </h3>
                        <div className="space-y-2">
                          <DataRow label="Full Name" value={String(bestMatch.best_owner_name || '—')} />
                          <DataRow label="Owner Type" value={String(bestMatch.best_owner_type || '—').replace(/_/g, ' ')} />
                          {bestMatch.legal_owner_name && bestMatch.legal_owner_name !== bestMatch.best_owner_name && (
                            <DataRow label="Legal Owner" value={String(bestMatch.legal_owner_name)} />
                          )}
                          {bestMatch.associated_contact_name && (
                            <DataRow label="Associated Contact" value={String(bestMatch.associated_contact_name)} />
                          )}
                          {bestMatch.owner_mailing_address && (
                            <DataRow label="Mailing Address" value={String(bestMatch.owner_mailing_address)} />
                          )}
                          {ownerCandidates.length > 1 && (
                            <div className="mt-2 p-2 bg-muted/40 rounded-lg">
                              <p className="text-[10px] text-muted-foreground font-medium mb-1">Additional Owners ({ownerCandidates.length - 1} more)</p>
                              {ownerCandidates.slice(1).map((o: Record<string, unknown>, i: number) => (
                                <p key={i} className="text-[11px] text-foreground">{String(o.fullName || o.full_name || '—')} <span className="text-muted-foreground">({String(o.ownerType || o.owner_type || 'UNKNOWN')})</span></p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* CONTACT section */}
                      <div className="bg-card border border-border rounded-xl p-4">
                        <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                          <Phone size={12} className="text-teal-500" />
                          Contact
                        </h3>
                        {phoneCandidates.length > 0 ? (
                          <div className="space-y-2">
                            {phoneCandidates.map((p: Record<string, unknown>, i: number) => (
                              <div key={i} className={`flex items-center justify-between p-2.5 rounded-lg border ${i === 0 ? 'border-teal-500/30 bg-teal-500/5' : 'border-border bg-muted/20'}`}>
                                <div className="flex items-center gap-2">
                                  <Phone size={12} className={i === 0 ? 'text-teal-600' : 'text-muted-foreground'} />
                                  <div>
                                    <p className="text-xs font-medium text-foreground">{String(p.phoneE164 || p.phone_e164 || '—')}</p>
                                    <p className="text-[10px] text-muted-foreground">{String(p.phoneType || p.phone_type || 'UNKNOWN')} · Confidence: {String(p.confidence ?? '—')}%</p>
                                  </div>
                                </div>
                                {i === 0 && <span className="text-[10px] font-semibold text-teal-600 bg-teal-500/10 px-2 py-0.5 rounded-full">Primary</span>}
                              </div>
                            ))}
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                              <Shield size={10} />
                              Phone found ≠ SMS consent. Outreach consent tracked separately.
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No phone numbers found</p>
                        )}

                        {emailCandidates.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border/50">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Email</p>
                            {emailCandidates.map((e: Record<string, unknown>, i: number) => (
                              <div key={i} className="flex items-center justify-between py-1.5">
                                <span className="text-xs text-foreground">{String(e.email || '—')}</span>
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                  e.emailStatus === 'HIGH_CONFIDENCE' ? 'bg-emerald-500/10 text-emerald-600' :
                                  e.emailStatus === 'MEDIUM_CONFIDENCE'? 'bg-amber-500/10 text-amber-600' : 'bg-muted text-muted-foreground'
                                }`}>
                                  {String(e.emailStatus || 'UNVERIFIED').replace(/_/g, ' ')}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* VERIFICATION section */}
                      <div className="bg-card border border-border rounded-xl p-4">
                        <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                          <CheckCircle2 size={12} className="text-emerald-500" />
                          Verification
                        </h3>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Property Match</span>
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${bestMatch.address_match_exact ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' : 'bg-amber-500/10 text-amber-700 border-amber-500/20'}`}>
                              {bestMatch.address_match_exact ? 'Verified' : 'Partial Match'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Owner Match</span>
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${confidenceColors[String(bestMatch.match_confidence_label || 'NO_MATCH')] || 'bg-muted text-muted-foreground border-border'}`}>
                              {String(bestMatch.match_confidence_label || 'NO_MATCH').replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Phone</span>
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${phoneCandidates.length > 0 ? 'bg-teal-500/10 text-teal-700 border-teal-500/20' : 'bg-muted text-muted-foreground border-border'}`}>
                              {phoneCandidates.length > 0 ? `${phoneCandidates.length} Found` : 'Not Found'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Overall</span>
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                              prLeadState?.verified_owner && prLeadState?.verified_number
                                ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                                : prLeadState?.verified_owner || prLeadState?.verified_number
                                ? 'bg-amber-500/10 text-amber-700 border-amber-500/20' :'bg-muted text-muted-foreground border-border'
                            }`}>
                              {prLeadState?.verified_owner && prLeadState?.verified_number
                                ? 'Fully Verified'
                                : prLeadState?.verified_owner || prLeadState?.verified_number
                                ? 'Partial' :'Unverified'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Confidence Score</span>
                            <span className="text-[11px] font-semibold text-foreground">{bestMatch.match_confidence_score ? `${bestMatch.match_confidence_score}/100` : '—'}</span>
                          </div>
                        </div>
                      </div>

                      {/* SOURCE section */}
                      <div className="bg-card border border-border rounded-xl p-4">
                        <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                          <Database size={12} />
                          Source
                        </h3>
                        <DataRow label="Provider" value={String(bestMatch.provider_name || 'PROPERTYREACH')} />
                        <DataRow label="PropertyReach ID" value={<span className="font-mono text-[11px]">{String(bestMatch.property_reach_id || prLeadState?.property_reach_id || '—')}</span>} />
                        <DataRow label="APN" value={String(bestMatch.apn || prLeadState?.property_reach_apn || '—')} />
                        <DataRow label="FIPS" value={String(bestMatch.fips || '—')} />
                        <DataRow label="Last Enriched" value={prLeadState?.property_reach_last_enriched_at ? new Date(String(prLeadState.property_reach_last_enriched_at)).toLocaleString() : '—'} />
                        <DataRow label="Decision" value={String(bestMatch.match_decision || '—').replace(/_/g, ' ')} />
                      </div>

                      {/* VIEW EVIDENCE button */}
                      <button
                        onClick={() => setShowEvidencePanel(showEvidencePanel === String(bestMatch.id) ? null : String(bestMatch.id))}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors w-full justify-center"
                      >
                        <Eye size={12} />
                        {showEvidencePanel === String(bestMatch.id) ? 'Hide Evidence' : 'View Evidence'}
                      </button>

                      {/* Evidence Panel */}
                      {showEvidencePanel === String(bestMatch.id) && (
                        <div className="bg-card border border-border rounded-xl p-4 space-y-4">
                          <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <FileSearch size={12} />
                            Match Evidence
                          </h3>

                          {/* Property Evidence */}
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Property Evidence</p>
                            <div className="space-y-1 text-[11px]">
                              <div className="flex justify-between"><span className="text-muted-foreground">TRAVLR Property ID</span><span className="font-mono text-foreground">{leadId.slice(0, 8)}...</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Canonical Address</span><span className="text-foreground">{String(bestMatch.canonical_address || lead?.address || '—')}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">PropertyReach ID</span><span className="font-mono text-foreground">{String(bestMatch.property_reach_id || '—')}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">APN</span><span className="text-foreground">{String(bestMatch.apn || '—')}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">FIPS</span><span className="text-foreground">{String(bestMatch.fips || '—')}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Address Match</span><span className={bestMatch.address_match_exact ? 'text-emerald-600 font-medium' : 'text-amber-600'}>{bestMatch.address_match_exact ? '✓ Exact' : 'Partial'}</span></div>
                            </div>
                          </div>

                          {/* Owner Evidence */}
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Owner Evidence</p>
                            <div className="space-y-1 text-[11px]">
                              <div className="flex justify-between"><span className="text-muted-foreground">Owner Returned</span><span className="text-foreground">{String(bestMatch.best_owner_name || '—')}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Owner Type</span><span className="text-foreground">{String(bestMatch.best_owner_type || '—').replace(/_/g, ' ')}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Mailing Address</span><span className="text-foreground">{String(bestMatch.owner_mailing_address || '—')}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Evidence Tier</span><span className="text-foreground">{String(bestMatch.evidence_tier || '—').replace(/_/g, ' ')}</span></div>
                            </div>
                          </div>

                          {/* Phone Evidence */}
                          {phoneCandidates.length > 0 && (
                            <div>
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Phone Evidence</p>
                              <div className="space-y-1.5">
                                {phoneCandidates.slice(0, 4).map((p: Record<string, unknown>, i: number) => (
                                  <div key={i} className="flex items-center justify-between text-[11px]">
                                    <span className="font-mono text-foreground">{String(p.phoneE164 || p.phone_e164 || '—')}</span>
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                      <span>{String(p.phoneType || p.phone_type || 'UNKNOWN')}</span>
                                      <span>{String(p.confidence ?? '—')}%</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Match Decision */}
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Match Decision</p>
                            <div className="space-y-1 text-[11px]">
                              <div className="flex justify-between"><span className="text-muted-foreground">TRAVLR Confidence Score</span><span className="font-semibold text-foreground">{bestMatch.match_confidence_score ? `${bestMatch.match_confidence_score}/100` : '—'}</span></div>
                              <div className="flex justify-between"><span className="text-muted-foreground">Decision</span><span className={`font-semibold ${bestMatch.match_decision === 'AUTO_ACCEPTED' ? 'text-emerald-600' : bestMatch.match_decision === 'CONFLICT' ? 'text-red-600' : 'text-amber-600'}`}>{String(bestMatch.match_decision || '—').replace(/_/g, ' ')}</span></div>
                            </div>
                            {/* Match signals */}
                            {Array.isArray(bestMatch.match_signals) && (bestMatch.match_signals as Record<string, unknown>[]).length > 0 && (
                              <div className="mt-2 space-y-1">
                                <p className="text-[10px] text-muted-foreground font-medium">Signal Breakdown</p>
                                {(bestMatch.match_signals as Record<string, unknown>[])
                                  .filter((s: Record<string, unknown>) => s.present)
                                  .map((s: Record<string, unknown>, i: number) => (
                                    <div key={i} className="flex items-center justify-between text-[10px]">
                                      <span className="text-muted-foreground">{String(s.signal || '').replace(/([A-Z])/g, ' $1').trim()}</span>
                                      <span className={`font-semibold ${Number(s.score) > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        {Number(s.score) > 0 ? '+' : ''}{String(s.score)}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* No data yet */}
                {prJobs.length === 0 && prMatches.length === 0 && (
                  <div className="text-center py-12 bg-card border border-border rounded-xl">
                    <Zap size={32} className="mx-auto mb-3 text-muted-foreground opacity-30" />
                    <p className="text-sm font-medium text-foreground mb-1">No PropertyReach enrichment yet</p>
                    <p className="text-xs text-muted-foreground mb-4">Click "Enrich Owner & Contact" to start the enrichment pipeline</p>
                    <button
                      onClick={() => handleStartPrEnrichment(false)}
                      disabled={startingPrEnrichment}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 mx-auto"
                    >
                      {startingPrEnrichment ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                      Enrich Owner & Contact
                    </button>
                  </div>
                )}

                {/* Audit trail */}
                {prAuditEvents.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                      <Activity size={12} />
                      Enrichment Audit Trail
                    </h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {prAuditEvents.map((event: Record<string, unknown>) => (
                        <div key={String(event.id)} className="flex items-start gap-2 text-[11px]">
                          <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                            String(event.event_type).includes('ERROR') || String(event.event_type).includes('CONFLICT') ? 'bg-red-500' :
                            String(event.event_type).includes('ACCEPTED') || String(event.event_type).includes('MATCHED') ? 'bg-emerald-500' :
                            String(event.event_type).includes('REVIEW') ? 'bg-amber-500' : 'bg-blue-500'
                          }`} />
                          <div className="flex-1">
                            <span className="font-medium text-foreground">{String(event.event_type || '').replace(/_/g, ' ')}</span>
                            <span className="text-muted-foreground ml-2">{event.created_at ? new Date(String(event.created_at)).toLocaleString() : ''}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
