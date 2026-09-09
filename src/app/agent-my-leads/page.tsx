'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { List, Phone, Star, Shield, Clock, AlertTriangle, Search, Filter, Loader2, RefreshCw, CheckCircle2, Calendar, X, PhoneCall, FileText, MapPin, DollarSign } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Icon from '@/components/ui/AppIcon';


// ─── Types ────────────────────────────────────────────────────────────────────

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
  notes: string;
}

type FilterType = 'all' | 'priority' | 'followup' | 'overdue' | 'verified' | 'new';

// ─── Lead Card ────────────────────────────────────────────────────────────────

function LeadCard({ lead }: { lead: AgentLead }) {
  const isOverdue = lead.next_follow_up_at && new Date(lead.next_follow_up_at) < new Date();
  const isFollowUpDue = lead.next_follow_up_at && new Date(lead.next_follow_up_at) <= new Date(Date.now() + 24 * 60 * 60 * 1000);
  const isFullyVerified = lead.verified_owner && lead.verified_address && lead.verified_number;

  return (
    <div className={`bg-card border rounded-xl overflow-hidden hover:border-primary/30 transition-all ${
      lead.do_not_contact ? 'border-red-500/20' : isOverdue ? 'border-amber-500/30' : 'border-border'
    }`}>
      {/* Card header */}
      <div className="px-4 py-3 border-b border-border/50">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground truncate">{lead.owner_name || 'Unknown Owner'}</p>
              {lead.do_not_contact && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-500/15 text-red-400 rounded-full">DO NOT CONTACT</span>
              )}
              {lead.is_high_priority && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-500/15 text-amber-400 rounded-full">PRIORITY</span>
              )}
              {lead.luxury && (
                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-purple-500/15 text-purple-400 rounded-full">LUXURY</span>
              )}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin size={10} className="text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground truncate">
                {[lead.property_address, lead.city, lead.state].filter(Boolean).join(', ')}
              </p>
            </div>
          </div>
          {lead.prospect_score > 0 && (
            <div className="shrink-0 text-right">
              <p className="text-lg font-bold text-foreground">{lead.prospect_score}</p>
              <p className="text-[10px] text-muted-foreground">score</p>
            </div>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="px-4 py-3 space-y-2">
        {/* Verification badges */}
        <div className="flex flex-wrap gap-1.5">
          {lead.verified_number && (
            <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 rounded-full border border-emerald-500/20">
              ✓ Phone Verified
            </span>
          )}
          {isFullyVerified && (
            <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-500/10 text-blue-500 rounded-full border border-blue-500/20">
              ✓ Fully Verified
            </span>
          )}
          {lead.phone && !lead.verified_number && (
            <span className="px-2 py-0.5 text-[10px] font-semibold bg-muted text-muted-foreground rounded-full">
              Phone Available
            </span>
          )}
        </div>

        {/* Phone */}
        {lead.phone && (
          <div className="flex items-center gap-1.5">
            <Phone size={11} className="text-muted-foreground" />
            <p className="text-xs text-foreground font-mono">{lead.phone}</p>
          </div>
        )}

        {/* Revenue */}
        {lead.estimated_net_monthly > 0 && (
          <div className="flex items-center gap-1.5">
            <DollarSign size={11} className="text-emerald-500" />
            <p className="text-xs text-foreground">
              ~${lead.estimated_net_monthly.toLocaleString()}/mo opportunity
            </p>
          </div>
        )}

        {/* Follow-up */}
        {lead.next_follow_up_at && (
          <div className={`flex items-center gap-1.5 ${isOverdue ? 'text-red-400' : isFollowUpDue ? 'text-amber-400' : 'text-muted-foreground'}`}>
            <Clock size={11} />
            <p className="text-xs">
              {isOverdue ? 'Overdue: ' : 'Follow-up: '}
              {new Date(lead.next_follow_up_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        )}

        {/* Last contact */}
        {lead.last_contacted_at && (
          <p className="text-[11px] text-muted-foreground">
            Last contact: {new Date(lead.last_contacted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
        )}
      </div>

      {/* Card footer */}
      <div className="px-4 py-3 border-t border-border/50 flex items-center gap-2">
        <Link
          href={`/lead-profile?id=${lead.id}`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-muted/50 text-foreground hover:bg-muted transition-colors flex-1 justify-center"
        >
          <FileText size={11} />
          View Profile
        </Link>
        <Link
          href={`/teleprompter?leadId=${lead.id}`}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 justify-center ${
            lead.do_not_contact
              ? 'bg-muted text-muted-foreground cursor-not-allowed pointer-events-none'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          }`}
          onClick={e => lead.do_not_contact && e.preventDefault()}
        >
          <PhoneCall size={11} />
          {lead.do_not_contact ? 'DNC' : 'Start Call'}
        </Link>
      </div>
    </div>
  );
}

// ─── Inner Component (uses useSearchParams) ───────────────────────────────────

function AgentMyLeadsInner() {
  const { session } = useAuth();
  const searchParams = useSearchParams();

  const [leads, setLeads] = useState<AgentLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>(
    (searchParams.get('filter') as FilterType) || 'all'
  );
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 30;

  const fetchLeads = useCallback(async (reset = false) => {
    if (!session?.access_token) return;
    const offset = reset ? 0 : page * PAGE_SIZE;

    let url = `/api/agent/leads?limit=${PAGE_SIZE}&offset=${offset}`;
    if (activeFilter === 'priority') url += '&priority_only=true';
    if (activeFilter === 'followup' || activeFilter === 'overdue') url += '&follow_up_due=true';
    if (search) url += `&search=${encodeURIComponent(search)}`;

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const newLeads = data.leads || [];

        // Client-side filter for overdue (server returns all due within 24h)
        const filtered = activeFilter === 'overdue'
          ? newLeads.filter((l: AgentLead) => l.next_follow_up_at && new Date(l.next_follow_up_at) < new Date())
          : activeFilter === 'verified'
          ? newLeads.filter((l: AgentLead) => l.verified_owner && l.verified_address && l.verified_number)
          : newLeads;

        if (reset) {
          setLeads(filtered);
          setPage(0);
        } else {
          setLeads(prev => [...prev, ...filtered]);
        }
        setHasMore(newLeads.length === PAGE_SIZE);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [session, activeFilter, search, page]);

  useEffect(() => {
    setLoading(true);
    fetchLeads(true);
  }, [activeFilter, search]);

  const FILTERS: { key: FilterType; label: string; icon: React.ElementType }[] = [
    { key: 'all', label: 'All Leads', icon: List },
    { key: 'priority', label: 'Priority', icon: Star },
    { key: 'followup', label: 'Follow-Ups Due', icon: Calendar },
    { key: 'overdue', label: 'Overdue', icon: AlertTriangle },
    { key: 'verified', label: 'Fully Verified', icon: Shield },
  ];

  return (
    <div className="px-4 sm:px-6 py-5 max-w-screen-xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">My Leads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Your assigned homeowner opportunities</p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchLeads(true); }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-foreground transition-colors self-start sm:self-auto"
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, address, or city…"
          className="w-full pl-9 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={13} />
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {FILTERS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveFilter(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              activeFilter === key
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
            }`}
          >
            <Icon size={11} />
            {label}
          </button>
        ))}
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="py-16 text-center">
          <CheckCircle2 size={32} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No leads found</p>
          <p className="text-xs text-muted-foreground">
            {activeFilter !== 'all' ? 'Try changing the filter above' : 'No leads have been assigned to you yet'}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{leads.length} lead{leads.length !== 1 ? 's' : ''} shown</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {leads.map(lead => (
              <LeadCard key={lead.id} lead={lead} />
            ))}
          </div>
          {hasMore && (
            <div className="text-center pt-2">
              <button
                onClick={() => { setPage(p => p + 1); fetchLeads(false); }}
                className="px-6 py-2 border border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
              >
                Load More
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentMyLeadsPage() {
  return (
    <AppLayout>
      <Suspense fallback={
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      }>
        <AgentMyLeadsInner />
      </Suspense>
    </AppLayout>
  );
}
