'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AgentOnboardingTour from '@/components/AgentOnboardingTour';
import { Phone, List, Calendar, Activity, Star, Shield, PhoneCall, AlertTriangle, CheckCircle2, RefreshCw, ChevronRight, Loader2, Zap, PhoneIncoming, ArrowRight, AlertCircle, HelpCircle, FileText } from 'lucide-react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import dynamic from 'next/dynamic';

const LiveTeleprompterPanel = dynamic(() => import('@/components/LiveTeleprompterPanel'), {
  ssr: false,
  loading: () => (
    <div className="h-64 rounded-xl bg-muted animate-pulse" />
  ),
});


// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentKPIs {
  assigned_leads: number;
  priority_leads: number;
  luxury_leads: number;
  fully_verified: number;
  phone_available: number;
  new_this_week: number;
  follow_ups_due: number;
  overdue_follow_ups: number;
  calls_today: number;
  connected_today: number;
  notes_today: number;
}

interface AgentLead {
  id: string;
  owner_name: string;
  property_address: string;
  city: string;
  state: string;
  phone: string;
  priority: boolean;
  luxury: boolean;
  verified_owner: boolean;
  verified_address: string;
  verified_number: boolean;
  lead_status: string;
  stage: string;
  prospect_score: number;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  do_not_contact: boolean;
  estimated_net_monthly: number;
}

interface ActivityEvent {
  id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  lead_id: string | null;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({
  label, value, icon: Icon, iconColor, bgColor, href, urgent = false
}: {
  label: string; value: number | string; icon: React.ElementType;
  iconColor: string; bgColor: string; href?: string; urgent?: boolean;
}) {
  const content = (
    <div className={`p-4 rounded-xl border ${urgent ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-card'} hover:border-primary/30 transition-all`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${bgColor}`}>
          <Icon size={16} className={iconColor} />
        </div>
        {urgent && <AlertCircle size={12} className="text-amber-500" />}
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AgentWorkspacePage() {
  const { user, session } = useAuth();
  const supabase = createClient();

  const [kpis, setKpis] = useState<AgentKPIs | null>(null);
  const [leads, setLeads] = useState<AgentLead[]>([]);
  const [followUpLeads, setFollowUpLeads] = useState<AgentLead[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'priority' | 'all' | 'followup'>('priority');
  const [showTour, setShowTour] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [selectedLeadForCall, setSelectedLeadForCall] = useState<AgentLead | null>(null);
  const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchKPIs = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const { data } = await supabase.rpc('get_agent_dashboard_summary');
      if (data) setKpis(data as AgentKPIs);
    } catch { /* silent */ } finally {
      setKpiLoading(false);
    }
  }, [session, supabase]);

  const fetchLeads = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/agent/leads?limit=30&priority_only=false', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
      }
    } catch { /* silent */ }
  }, [session]);

  const fetchFollowUps = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/agent/leads?limit=20&follow_up_due=true', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFollowUpLeads(data.leads || []);
      }
    } catch { /* silent */ }
  }, [session]);

  const fetchActivity = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase
        .from('activity_events')
        .select('id, event_type, metadata, created_at, lead_id')
        .eq('agent_id', user.id)
        .order('created_at', { ascending: false })
        .limit(15);
      if (data) setRecentActivity(data);
    } catch { /* silent */ }
  }, [user, supabase]);

  useEffect(() => {
    if (!user || !session) return;

    // Get agent name
    supabase
      .from('user_profiles')
      .select('full_name, agent_onboarding_completed_at, app_role')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.full_name) setAgentName(data.full_name.split(' ')[0]);
      });

    Promise.all([fetchKPIs(), fetchLeads(), fetchFollowUps(), fetchActivity()])
      .finally(() => setLoading(false));

    // Activity auto-refresh every 1 hour
    refreshRef.current = setInterval(() => {
      fetchActivity();
      fetchKPIs();
    }, 60 * 60 * 1000);

    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [user, session]);

  const priorityLeads = leads.filter(l => l.is_high_priority || l.luxury);
  const displayLeads = activeTab === 'priority' ? priorityLeads : activeTab === 'followup' ? followUpLeads : leads;

  const activityLabel = (type: string) => {
    const map: Record<string, string> = {
      call_outcome_recorded: 'Call outcome recorded',
      note_added: 'Note added',
      follow_up_scheduled: 'Follow-up scheduled',
      onboarding_completed: 'Onboarding completed',
      lead_viewed: 'Lead reviewed',
    };
    return map[type] || type.replace(/_/g, ' ');
  };

  return (
    <AppLayout>
      {showTour && <AgentOnboardingTour onComplete={() => setShowTour(false)} />}

      <div className="px-4 sm:px-6 py-5 max-w-screen-xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {agentName ? `Good day, ${agentName}` : 'My Dashboard'}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Your assigned homeowner leads and outreach workspace</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/agent-my-leads"
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-all"
            >
              <List size={14} />
              My Leads
            </Link>
            <button
              onClick={() => { fetchKPIs(); fetchLeads(); fetchFollowUps(); fetchActivity(); }}
              className="p-2 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* ── KPI Grid ── */}
        {kpiLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : kpis ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <KPICard label="Assigned Leads" value={kpis.assigned_leads} icon={List} iconColor="text-blue-500" bgColor="bg-blue-500/10" href="/agent-my-leads" />
            <KPICard label="Priority Leads" value={kpis.priority_leads} icon={Star} iconColor="text-amber-500" bgColor="bg-amber-500/10" href="/agent-my-leads?filter=priority" />
            <KPICard label="Follow-Ups Due" value={kpis.follow_ups_due} icon={Calendar} iconColor="text-orange-500" bgColor="bg-orange-500/10" urgent={kpis.follow_ups_due > 0} href="/agent-my-leads?filter=followup" />
            <KPICard label="Overdue" value={kpis.overdue_follow_ups} icon={AlertTriangle} iconColor="text-red-500" bgColor="bg-red-500/10" urgent={kpis.overdue_follow_ups > 0} href="/agent-my-leads?filter=overdue" />
            <KPICard label="Calls Today" value={kpis.calls_today} icon={Phone} iconColor="text-emerald-500" bgColor="bg-emerald-500/10" />
            <KPICard label="Connected Today" value={kpis.connected_today} icon={PhoneIncoming} iconColor="text-emerald-600" bgColor="bg-emerald-500/10" />
            <KPICard label="New This Week" value={kpis.new_this_week} icon={Zap} iconColor="text-violet-500" bgColor="bg-violet-500/10" />
            <KPICard label="Fully Verified" value={kpis.fully_verified} icon={Shield} iconColor="text-blue-500" bgColor="bg-blue-500/10" href="/agent-my-leads?filter=verified" />
          </div>
        ) : null}

        {/* ── Quick Start Call ── */}
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <PhoneCall size={20} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Ready to make calls?</p>
              <p className="text-xs text-muted-foreground">Open My Leads and start with your Priority queue</p>
            </div>
          </div>
          <Link
            href="/agent-my-leads?filter=priority"
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-all shrink-0"
          >
            Start Calling
            <ArrowRight size={14} />
          </Link>
        </div>

        {/* ── Leads + Activity + Teleprompter ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* My Leads Queue */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">My Leads</h2>
              <Link href="/agent-my-leads" className="text-xs text-primary hover:underline flex items-center gap-1">
                View All <ChevronRight size={12} />
              </Link>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border">
              {(['priority', 'followup', 'all'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    activeTab === tab
                      ? 'text-primary border-b-2 border-primary' :'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab === 'priority' ? `Priority (${priorityLeads.length})` : tab === 'followup' ? `Follow-Ups (${followUpLeads.length})` : `All (${leads.length})`}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="p-8 text-center">
                <Loader2 size={20} className="animate-spin text-muted-foreground mx-auto" />
              </div>
            ) : displayLeads.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 size={24} className="text-emerald-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {activeTab === 'followup' ? 'No follow-ups due — great work!' : 'No leads in this view'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {displayLeads.slice(0, 10).map(lead => (
                  <div key={lead.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors border-b border-border/50 last:border-0">
                    {/* Priority/Luxury indicator */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      {lead.is_high_priority && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Priority" />}
                      {lead.luxury && <div className="w-1.5 h-1.5 rounded-full bg-purple-500" title="Luxury" />}
                      {!lead.is_high_priority && !lead.luxury && <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20" />}
                    </div>
                    {/* Lead info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">{lead.owner_name || 'Unknown Owner'}</p>
                        {lead.do_not_contact && (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-500/15 text-red-400 rounded">DNC</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{lead.property_address}{lead.city ? `, ${lead.city}` : ''}{lead.state ? `, ${lead.state}` : ''}</p>
                    </div>
                    {/* Badges */}
                    <div className="hidden sm:flex items-center gap-1 shrink-0">
                      {lead.verified_number && (
                        <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-emerald-500/15 text-emerald-400 rounded">PHONE ✓</span>
                      )}
                    </div>
                    {/* Teleprompter button */}
                    <button
                      onClick={() => setSelectedLeadForCall(selectedLeadForCall?.id === lead.id ? null : lead)}
                      disabled={lead.do_not_contact}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                        selectedLeadForCall?.id === lead.id
                          ? 'bg-red-500/10 text-red-600 border border-red-500/30'
                          : lead.do_not_contact
                            ? 'bg-muted text-muted-foreground cursor-not-allowed'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                      }`}
                    >
                      <Phone size={11} />
                      <span className="hidden sm:inline">{selectedLeadForCall?.id === lead.id ? 'Close' : 'Call'}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right column: Teleprompter or Activity */}
          <div className="space-y-4">
            {/* Live Teleprompter Panel */}
            {selectedLeadForCall ? (
              <LiveTeleprompterPanel
                lead={{
                  id: selectedLeadForCall.id,
                  contactName: selectedLeadForCall.owner_name || 'Homeowner',
                  address: selectedLeadForCall.property_address || '',
                  city: selectedLeadForCall.city || '',
                  state: selectedLeadForCall.state || '',
                  phone: selectedLeadForCall.phone,
                }}
                agentName={agentName || 'Agent'}
                agentId={user?.id}
                onClose={() => setSelectedLeadForCall(null)}
              />
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-muted-foreground" />
                    <h2 className="text-sm font-semibold text-foreground">Teleprompter</h2>
                  </div>
                </div>
                <div className="p-6 text-center">
                  <Phone size={24} className="text-muted-foreground mx-auto mb-3 opacity-40" />
                  <p className="text-sm text-muted-foreground mb-1">Select a lead to start the live teleprompter</p>
                  <p className="text-xs text-muted-foreground/60">Click "Call" on any lead in the queue to open the script panel with dynamic variable substitution, stage tracking, and outcome recording.</p>
                </div>
              </div>
            )}

            {/* Recent Activity */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">My Activity</h2>
                <Activity size={14} className="text-muted-foreground" />
              </div>
              {recentActivity.length === 0 ? (
                <div className="p-6 text-center">
                  <Activity size={20} className="text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No activity yet — start making calls!</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {recentActivity.map(event => (
                    <div key={event.id} className="px-4 py-3">
                      <p className="text-xs font-medium text-foreground capitalize">{activityLabel(event.event_type)}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(event.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Help strip ── */}
        <div className="flex items-center justify-between p-4 bg-muted/30 border border-border rounded-xl">
          <div className="flex items-center gap-2">
            <HelpCircle size={14} className="text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Need a refresher on how to use TRAVLR?</p>
          </div>
          <button
            onClick={() => setShowTour(true)}
            className="text-xs text-primary hover:underline font-medium"
          >
            Take Platform Tour Again
          </button>
        </div>

      </div>
    </AppLayout>
  );
}
