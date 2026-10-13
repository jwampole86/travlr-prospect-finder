'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { useRouter } from 'next/navigation';
import { mockLeads } from '@/data/mockLeads';
import type { Lead } from '@/data/mockLeads';
import { cityRegulations } from '@/data/regulations';
import { createClient } from '@/lib/supabase/client';
import { normalizeLeadStage } from '@/lib/leadStage';
import StageBadge from '@/components/ui/StageBadge';
import RegulationBadge from '@/components/ui/RegulationBadge';
import ProspectScoreBar from '@/components/ui/ProspectScoreBar';
import { Phone, Mail, MapPin, Home, DollarSign, Star, Clock, FileText, MessageSquare, User, Tag, TrendingUp, Shield, AlertCircle, RefreshCw, ExternalLink, CheckCircle, Plus, Send, Save, ChevronDown, ChevronRight, Activity, Users, Zap, BarChart2, Copy, Check, Inbox, Link2, Globe, ClipboardCopy, Handshake, Building2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { showErrorWithRetry } from '@/lib/hooks/useRetryToast';
import SMSSendModal from './SMSSendModal';
import BreadcrumbNav from '@/components/ui/BreadcrumbNav';
import LeadTaskBoard from './LeadTaskBoard';

import { useAuth } from '@/contexts/AuthContext';
import { activityService } from '@/lib/services/activityService';
import { outreachDisplay } from '@/lib/services/smsSendState';
import { assessLead, assessLeadData, lastVerified, outreachCleared } from '@/lib/leadVerification';
import PipelineStatusBadge, { PIPELINE_STATUS_CONFIG, PIPELINE_STATUS_ORDER, type PipelineStatus } from '@/components/ui/PipelineStatusBadge';
import ConfidenceBandBadge, { getConfidenceBand, CONFIDENCE_BAND_CONFIG } from '@/components/ui/ConfidenceBandBadge';
import Icon from '@/components/ui/AppIcon';
import AILeadQualificationPanel from '@/components/AILeadQualificationPanel';
import type { LeadQualificationSignals } from '@/components/AILeadQualificationPanel';


interface ContactHistoryEntry {
  id: string;
  lead_id: string;
  type: 'email' | 'call' | 'text' | 'note';
  subject: string;
  body: string;
  outcome: string;
  contacted_at: string;
}

interface TeamNote {
  id: string;
  lead_id: string;
  author: string;
  content: string;
  created_at: string;
}

interface EnrichmentEvent {
  id: string;
  label: string;
  detail: string;
  timestamp: string;
  type: 'sync' | 'verify' | 'score' | 'stage' | 'note';
}

interface OutreachLogEntry {
  id: string;
  lead_id: string;
  channel: 'email' | 'sms';
  subject: string | null;
  body_preview: string | null;
  full_body: string | null;
  status: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  reply_detected: boolean;
  reply_snippet: string | null;
  sent_at: string;
  agent_id: string | null;
  metadata?: Record<string, any> | null;
}

interface DealRecord {
  id: string;
  lead_id: string;
  revenue: number | null;
  closed_at: string;
  notes: string | null;
  portfolio_key: string | null;
}

const typeIcons: Record<string, React.ReactNode> = {
  email: <Mail size={13} />,
  call: <Phone size={13} />,
  text: <MessageSquare size={13} />,
  note: <FileText size={13} />,
};

const typeColors: Record<string, string> = {
  email: 'text-blue-500 bg-blue-500/10',
  call: 'text-green-500 bg-green-500/10',
  text: 'text-purple-500 bg-purple-500/10',
  note: 'text-amber-500 bg-amber-500/10',
};

const enrichmentTypeColors: Record<string, string> = {
  sync: 'bg-blue-500/10 text-blue-600',
  verify: 'bg-green-500/10 text-green-600',
  score: 'bg-purple-500/10 text-purple-600',
  stage: 'bg-amber-500/10 text-amber-600',
  note: 'bg-muted text-muted-foreground',
};

const outreachStatusColors: Record<string, string> = {
  sent: 'bg-blue-500/10 text-blue-600',
  delivered: 'bg-green-500/10 text-green-600',
  opened: 'bg-emerald-500/10 text-emerald-600',
  replied: 'bg-purple-500/10 text-purple-600',
  bounced: 'bg-red-500/10 text-red-600',
  failed: 'bg-red-500/10 text-red-600',
};
const outreachToneColors: Record<string, string> = {
  blue: 'bg-blue-500/10 text-blue-600',
  amber: 'bg-amber-500/10 text-amber-600',
  green: 'bg-green-500/10 text-green-600',
  red: 'bg-red-500/10 text-red-600',
  purple: 'bg-purple-500/10 text-purple-600',
  gray: 'bg-muted text-muted-foreground',
};
const fmtLogTime = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

type DetailRow = { label: string; value: React.ReactNode };
const hasValue = (v: unknown) => v !== null && v !== undefined && v !== '' && v !== false;
function DetailRows({ rows, stacked = false }: { rows: DetailRow[]; stacked?: boolean }) {
  const shown = rows.filter(r => hasValue(r.value));
  return (
    <div className={stacked ? 'grid grid-cols-1 gap-y-2.5' : 'grid grid-cols-2 gap-x-8 gap-y-3'}>
      {shown.map(f => (
        <div key={f.label} className="flex items-start gap-2">
          <span className="text-xs text-muted-foreground w-28 shrink-0 pt-0.5">{f.label}</span>
          <span className="text-xs font-medium text-foreground break-words min-w-0">{f.value}</span>
        </div>
      ))}
    </div>
  );
}

const Section = React.memo(function Section({ title, icon, children, defaultOpen = true }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-primary">{icon}</span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
        {open ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  );
});

// ── Skeleton components for fast perceived loading ────────────────────────────
function LeadProfileSkeleton() {
  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {/* Top bar skeleton */}
        <div className="flex items-center gap-4 px-6 py-3.5 border-b border-border bg-card shrink-0">
          <div className="h-4 w-32 bg-muted animate-pulse rounded" />
          <div className="flex items-center gap-3 flex-1 min-w-0 ml-2">
            <div className="w-9 h-9 rounded-lg bg-muted animate-pulse shrink-0" />
            <div className="space-y-1.5 min-w-0">
              <div className="h-4 w-48 bg-muted animate-pulse rounded" />
              <div className="h-3 w-32 bg-muted animate-pulse rounded" />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-6 w-20 bg-muted animate-pulse rounded-full" />
            <div className="h-6 w-24 bg-muted animate-pulse rounded-full" />
            <div className="h-7 w-24 bg-muted animate-pulse rounded-lg" />
          </div>
        </div>

        {/* Main content skeleton */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-3 gap-6">
            {/* Left column */}
            <div className="col-span-2 flex flex-col gap-5">
              {/* Outreach message skeleton */}
              <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-muted animate-pulse" />
                    <div className="space-y-1">
                      <div className="h-3.5 w-32 bg-muted animate-pulse rounded" />
                      <div className="h-3 w-48 bg-muted animate-pulse rounded" />
                    </div>
                  </div>
                  <div className="h-8 w-28 bg-muted animate-pulse rounded-lg" />
                </div>
                <div className="bg-card border border-border rounded-lg p-4 space-y-2">
                  <div className="h-3 w-full bg-muted animate-pulse rounded" />
                  <div className="h-3 w-5/6 bg-muted animate-pulse rounded" />
                  <div className="h-3 w-4/6 bg-muted animate-pulse rounded" />
                  <div className="h-3 w-full bg-muted animate-pulse rounded" />
                  <div className="h-3 w-3/4 bg-muted animate-pulse rounded" />
                </div>
              </div>

              {/* KPI strip skeleton */}
              <div className="grid grid-cols-4 gap-3">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="bg-card border border-border rounded-xl p-4">
                    <div className="h-3 w-20 bg-muted animate-pulse rounded mb-2" />
                    <div className="h-7 w-16 bg-muted animate-pulse rounded" />
                  </div>
                ))}
              </div>

              {/* Score bar skeleton */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="h-4 w-40 bg-muted animate-pulse rounded mb-3" />
                <div className="h-4 w-full bg-muted animate-pulse rounded" />
              </div>

              {/* Section skeletons */}
              {[1, 2].map(i => (
                <div key={i} className="border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 bg-muted/30 flex items-center gap-2.5">
                    <div className="w-4 h-4 bg-muted animate-pulse rounded" />
                    <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                  </div>
                  <div className="p-5 space-y-2">
                    {[1, 2, 3].map(j => (
                      <div key={j} className="h-14 bg-muted/50 animate-pulse rounded-lg" />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Right column */}
            <div className="col-span-1 flex flex-col gap-5">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-card border border-border rounded-xl p-5">
                  <div className="h-4 w-24 bg-muted animate-pulse rounded mb-4" />
                  <div className="space-y-2">
                    <div className="h-3 w-full bg-muted animate-pulse rounded" />
                    <div className="h-3 w-4/5 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-3/5 bg-muted animate-pulse rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default function LeadProfileContent({ leadId }: { leadId: string | null }) {
  const router = useRouter();
  const { user, session } = useAuth();

  // ── Lead resolution: try DB first, fall back to mockLeads ────────────────
  const [lead, setLead] = useState<Lead | undefined>(undefined);
  const [leadLoading, setLeadLoading] = useState(true);
  const [leadNotFound, setLeadNotFound] = useState(false);
  const [fillNote, setFillNote] = useState<string | null>(null);
  const [domNote, setDomNote] = useState<string | null>(null);
  const [marketRent, setMarketRent] = useState(0);
  const [records, setRecords] = useState<{ ownership: Record<string, any>; comparables: Array<Record<string, any>> } | null>(null);
  const ownerMatch = records?.ownership?.match ? { name: String(records.ownership.match.name), percent: Number(records.ownership.match.percent) } : null;
  const recordsFor = useRef<string | null>(null);
  const linkFor = useRef<string | null>(null);
  const [scoreMeta, setScoreMeta] = useState<{ refreshedAt: string; band: string; factors: Array<{ label: string; score: number; weight: number; explanation: string }> } | null>(null);
  const scoreFor = useRef<string | null>(null);
  const [signing, setSigning] = useState<{ state: 'signed' | 'sent' | 'viewed' | 'declined' | 'voided' | 'none' | 'loading' }>({ state: 'loading' });
  const signingFor = useRef<string | null>(null);
  const [linkLooking, setLinkLooking] = useState(false);
  const [relatedLink, setRelatedLink] = useState<{ url: string; address: string } | null>(null);
  const filledFor = useRef<string | null>(null);

  // Blank estimates and days on market are filled from the revenue model and the listing date, for display only.
  // The score is recomputed from everything on file when the profile opens (and by a job every 15 minutes), so it is never a month old.
  useEffect(() => {
    if (!lead?.id || scoreFor.current === lead.id) return;
    scoreFor.current = lead.id;
    const id = lead.id;
    fetch('/api/leads/score-refresh', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) }, body: JSON.stringify({ leadId: id }) })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (j && typeof j.score === 'number') { setLead(p => (p && p.id === id ? { ...p, prospectScore: j.score } : p)); setScoreMeta({ refreshedAt: j.refreshedAt, band: j.band, factors: j.factors ?? [] }); } })
      .catch(() => { /* the stored score stays */ });
  }, [lead, session?.access_token]);

  // Closing a deal waits on the homeowner's signed DocuSign agreements.
  useEffect(() => {
    if (!lead?.id || signingFor.current === lead.id) return;
    signingFor.current = lead.id;
    fetch(`/api/leads/signing-status?leadId=${encodeURIComponent(lead.id)}`, { headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined })
      .then(r => (r.ok ? r.json() : null)).then(j => setSigning({ state: j?.state ?? 'none' })).catch(() => setSigning({ state: 'none' }));
  }, [lead, session?.access_token]);

  // A lead with no stored listing link is searched for on Zillow by address once, then the link is saved to the lead.
  useEffect(() => {
    if (!lead?.id || linkFor.current === lead.id) return;
    linkFor.current = lead.id;
    const ev = (lead.extra?.listing_evidence as { related_zillow?: { url?: string; address?: string } } | null | undefined)?.related_zillow;
    if (ev?.url) setRelatedLink({ url: ev.url, address: ev.address ?? '' });
    const stored = [lead.listingUrl, lead.extra?.listing_source_url, lead.extra?.sync_source_url].some(u => typeof u === 'string' && /^https?:\/\/[^/]+\/.+/.test(u));
    const factsMissing = !(lead.beds > 0) || !(lead.baths > 0) || !(lead.price > 0);
    if ((stored && !factsMissing) || !lead.address || !lead.state) return;
    const id = lead.id;
    setLinkLooking(true);
    fetch('/api/leads/listing-link', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) }, body: JSON.stringify({ leadId: id }) })
      .then(r => (r.ok ? r.json() : null))
      .then((j: { status: string; url?: string; address?: string; facts?: { beds?: number; baths?: number; price?: number; priceType?: 'rent' | 'sale' } } | null) => {
        const f = j?.facts;
        if (f && (j?.status === 'found' || j?.status === 'filled')) setLead(p => (p && p.id === id ? { ...p, listingUrl: j.url ?? p.listingUrl, beds: f.beds ?? p.beds, baths: f.baths ?? p.baths, price: f.price ?? p.price, priceType: f.priceType ?? p.priceType } : p));
        else if (j?.status === 'related' && j.url) setRelatedLink({ url: j.url, address: j.address ?? '' });
      })
      .catch(() => { /* the no-link message stays */ })
      .then(() => setLinkLooking(false));
  }, [lead, session?.access_token]);

  useEffect(() => {
    if (!lead?.id || recordsFor.current === lead.id) return;
    recordsFor.current = lead.id;
    fetch(`/api/leads/records?leadId=${encodeURIComponent(lead.id)}`, { headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined })
      .then(r => (r.ok ? r.json() : null)).then(j => { if (j) setRecords(j); }).catch(() => { /* the empty states show */ });
  }, [lead, session?.access_token]);

  useEffect(() => {
    if (!lead?.id || filledFor.current === lead.id) return;
    filledFor.current = lead.id;
    const base = lead;
    fetch(`/api/leads/fill?leadId=${encodeURIComponent(base.id)}`, { headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined })
      .then(r => (r.ok ? r.json() : null))
      .then((j: { fill: { adr: number; occupancy: number; grossMonthly: number; netMonthly: number; basisLabel: string; assumedBeds: boolean; marketRent: number; source: 'airdna' | 'airdna_area' | 'model' } | null; daysOnMarket: { days: number; basis: string; note: string } | null } | null) => {
        if (!j) return;
        const f = j.fill;
        // The stored estimates come from an older bedroom model that ran high against AirDNA, so the profile shows the same AirDNA-backed figures the homeowner page uses.
        setLead(p => p ? { ...p, estimatedADR: f?.adr || p.estimatedADR || 0, estimatedOccupancy: f?.occupancy || p.estimatedOccupancy || 0, estimatedGrossMonthly: f?.grossMonthly || p.estimatedGrossMonthly || 0, estimatedNetMonthly: f?.netMonthly || p.estimatedNetMonthly || 0, daysOnMarket: j.daysOnMarket?.days ?? p.daysOnMarket ?? 0 } : p);
        if (j.daysOnMarket) setDomNote(j.daysOnMarket.note);
        if (f?.marketRent) setMarketRent(f.marketRent);
        if (f) setFillNote(f.source === 'airdna' ? `AirDNA's estimate for this address (nightly rate and occupancy), after our standard cost shares${f.assumedBeds ? '; bedrooms are assumed to be 3 because the count is not on file' : ''}. Not saved to the lead.` : `${f.basisLabel}, calibrated to AirDNA${f.assumedBeds ? ', assuming a 3-bedroom home because the bedroom count is not on file' : ''}. It is not specific to this home. Not saved to the lead.`);
      })
      .catch(() => { /* the blanks simply stay blank */ });
  }, [lead, session?.access_token]);

  useEffect(() => {
    if (!leadId) {
      setLeadLoading(false);
      setLeadNotFound(true);
      return;
    }

    const controller = { cancelled: false };
    const timeout = setTimeout(() => {
      if (!controller.cancelled) {
        setLeadLoading(false);
        setLeadNotFound(true);
      }
    }, 8000); // 8s hard timeout

    fetch(`/api/agent/lead/${encodeURIComponent(leadId)}`, {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    })
      .then(async response => {
        if (!response.ok) return null;
        const data = await response.json();
        const found = data.lead as Record<string, unknown> | undefined;
        if (!found) return null;
        return {
          id: String(found.id), address: String(found.address || ''), city: String(found.city || ''), state: String(found.state || ''), zip: String(found.zip || ''),
          lat: Number(found.lat || 0), lng: Number(found.lng || 0), beds: Number(found.beds || 0), baths: Number(found.baths || 0), price: Number(found.price || 0),
          priceType: (found.price_type || 'rent') as Lead['priceType'], source: (found.source || 'Direct') as Lead['source'], stage: normalizeLeadStage(found.stage) as Lead['stage'],
          regulationStatus: (found.regulation_status || 'Unknown') as Lead['regulationStatus'], prospectScore: Number(found.prospect_score || 0), daysOnMarket: Number(found.days_on_market || 0),
          lastChecked: String(found.last_checked || ''), listingUrl: String(found.listing_url || ''), notes: String(found.notes || ''), contactName: found.contact_name ? String(found.contact_name) : undefined,
          contactPhone: found.contact_phone ? String(found.contact_phone) : undefined, tags: (found.tags || []) as string[], estimatedADR: Number(found.estimated_adr || 0),
          estimatedOccupancy: Number(found.estimated_occupancy || 0), estimatedGrossMonthly: Number(found.estimated_gross_monthly || 0), estimatedNetMonthly: Number(found.estimated_net_monthly || 0),
          photos: (found.photos || []) as string[], createdAt: String(found.created_at || ''), updatedAt: String(found.updated_at || ''), isSynthetic: Boolean(found.is_synthetic),
          ownerName: found.owner_name ? String(found.owner_name) : undefined, skipTraceFound: found.skip_trace_status === 'FOUND',
          skipTraceConfidence: (found.skip_trace as { confidence?: string } | null)?.confidence ?? undefined,
          skipTracePhones: Array.isArray(found.secondary_phones) ? (found.secondary_phones as string[]).slice(0, 2) : [],
          skipTraceEmails: ((found.skip_trace as { emails?: string[] } | null)?.emails ?? []),
          extra: found,
          verificationStatus: found.verification_status ? String(found.verification_status) : undefined, verificationScore: Number(found.verification_score || 0), verificationMethod: found.verification_method ? String(found.verification_method) : undefined,
          verificationTimestamp: found.verification_timestamp ? String(found.verification_timestamp) : undefined, verifiedAddress: found.verified_address ? String(found.verified_address) : undefined, normalizedAddress: found.normalized_address ? String(found.normalized_address) : undefined,
          apn: found.apn ? String(found.apn) : undefined, propertyProvider: found.property_provider ? String(found.property_provider) : undefined, providerPropertyId: found.provider_property_id ? String(found.provider_property_id) : undefined,
          county: found.county ? String(found.county) : undefined, verificationNotes: found.verification_notes ? String(found.verification_notes) : undefined,
        } as Lead;
      })
      .then((found) => {
        if (controller.cancelled) return;
        clearTimeout(timeout);
        if (found) {
          setLead(found);
        } else {
          setLeadNotFound(true);
        }
        setLeadLoading(false);
      })
      .catch(() => {
        if (controller.cancelled) return;
        clearTimeout(timeout);
        setLeadLoading(false);
        setLeadNotFound(true);
      });

    return () => {
      controller.cancelled = true;
      clearTimeout(timeout);
    };
  }, [leadId, session?.access_token]);

  // ── Secondary data — loaded independently after lead is resolved ──────────
  const [history, setHistory] = useState<ContactHistoryEntry[]>([]);
  const [teamNotes, setTeamNotes] = useState<TeamNote[]>([]);
  const [outreachLog, setOutreachLog] = useState<OutreachLogEntry[]>([]);

  // Per-section loading states (independent, not a single blocking flag)
  const [historyLoading, setHistoryLoading] = useState(true);
  const [contactData, setContactData] = useState<{ events: Array<Record<string, any>>; upcoming: Array<Record<string, any>>; lastContactAt: string | null; counts: { texts: number; calls: number; emails: number; replies: number } } | null>(null);
  const [notesLoading, setNotesLoading] = useState(true);
  const [outreachLoading, setOutreachLoading] = useState(true);

  const [showSMSModal, setShowSMSModal] = useState(false);
  const [messageCopied, setMessageCopied] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);

  const [noteContent, setNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const [logType, setLogType] = useState<'email' | 'call' | 'text' | 'note'>('note');
  const [logSubject, setLogSubject] = useState('');
  const [logBody, setLogBody] = useState('');
  const [logOutcome, setLogOutcome] = useState('');
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [savingLog, setSavingLog] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);

  const [dealClosed, setDealClosed] = useState(false);
  const [dealRevenue, setDealRevenue] = useState<string>('');
  const [dealNotes, setDealNotes] = useState('');
  const [dealClosedAt, setDealClosedAt] = useState<string | null>(null);
  const [savingDeal, setSavingDeal] = useState(false);
  const [showDealForm, setShowDealForm] = useState(false);
  const [dealRecord, setDealRecord] = useState<DealRecord | null>(null);
  const [profileFirstName, setProfileFirstName] = useState<string>('');

  // ── Pipeline status state ─────────────────────────────────────────────────
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus>(null);
  const [pipelineUpdatedAt, setPipelineUpdatedAt] = useState<string | null>(null);
  const [savingPipelineStatus, setSavingPipelineStatus] = useState(false);

  // ── Ownership & market data state ─────────────────────────────────────────
  const [ownershipData, setOwnershipData] = useState<Record<string, unknown> | null>(null);
  const [marketComparables, setMarketComparables] = useState<Array<Record<string, unknown>>>([]);

  const supabase = createClient();

  // Load agent first name from user_profiles if not in metadata
  useEffect(() => {
    if (!user?.id) return;
    const metaName =
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.user_metadata?.first_name ||
      '';
    if (metaName.trim()) return;
    supabase
      .from('user_profiles')
      .select('full_name, first_name')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const name = (data.first_name as string) || (data.full_name as string) || '';
          if (name.trim()) setProfileFirstName(name.trim().split(/\s+/)[0]);
        }
      })
      .then(undefined, () => {});
  }, [user?.id]);

  const regulation = lead ? cityRegulations.find(
    r => r.city.toLowerCase() === lead.city.toLowerCase()
  ) : null;

  const propertyAddress = lead ? `${lead.address}, ${lead.city}, ${lead.state} ${lead.zip}` : '';
  const agentFirstName = (() => {
    const fullName: string =
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.user_metadata?.first_name ||
      '';
    if (fullName.trim()) {
      return fullName.trim().split(/\s+/)[0];
    }
    if (profileFirstName) return profileFirstName;
    const emailPrefix = user?.email?.split('@')[0] || '';
    return emailPrefix
      ? emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1).replace(/[._]/g, ' ').split(' ')[0]
      : 'Your Agent';
  })();

  // ── Load secondary data in parallel, each section independently ──────────
  // Fires immediately after lead is resolved — does NOT block the main render
  const secondaryLoadedRef = useRef(false);

  // Contact History is every real contact (texts, replies, calls, emails, link opens), refreshed while the profile is open.
  const loadContactHistory = useCallback(() => {
    if (!lead?.id) return;
    fetch(`/api/leads/contact-history?leadId=${encodeURIComponent(lead.id)}`, { headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined })
      .then(r => (r.ok ? r.json() : null)).then(j => { if (j) setContactData(j); }).catch(() => { /* keeps the last view */ });
  }, [lead?.id, session?.access_token]);

  useEffect(() => {
    loadContactHistory();
    const t = setInterval(loadContactHistory, 60_000);
    return () => clearInterval(t);
  }, [loadContactHistory]);

  useEffect(() => {
    if (!lead || secondaryLoadedRef.current) return;
    secondaryLoadedRef.current = true;

    // Contact history
    supabase
      .from('contact_history')
      .select('id,lead_id,type,subject,body,outcome,contacted_at')
      .eq('lead_id', lead.id)
      .order('contacted_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setHistory(data as ContactHistoryEntry[]);
      })
      .then(undefined, () => {})
      .then(() => setHistoryLoading(false));

    // Team notes
    supabase
      .from('team_notes')
      .select('id,lead_id,author,content,created_at')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setTeamNotes(data as TeamNote[]);
      })
      .then(undefined, () => {})
      .then(() => setNotesLoading(false));

    // Outreach log
    supabase
      .from('outreach_history')
      .select('id,lead_id,channel,subject,body_preview,full_body,status,recipient_email,recipient_phone,reply_detected,reply_snippet,sent_at,agent_id,metadata')
      .eq('lead_id', lead.id)
      .order('sent_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setOutreachLog(data as OutreachLogEntry[]);
      })
      .then(undefined, () => {})
      .then(() => setOutreachLoading(false));

    // Deal status — lightweight select of only needed columns
    supabase
      .from('leads')
      .select('deal_closed,deal_revenue,deal_closed_at,deal_notes')
      .eq('id', lead.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setDealClosed(data.deal_closed ?? false);
          setDealClosedAt(data.deal_closed_at ?? null);
          if (data.deal_revenue) setDealRevenue(String(data.deal_revenue));
          if (data.deal_notes) setDealNotes(data.deal_notes);
        }
      })
      .then(undefined, () => {});

    // Closed deals log — deferred, non-blocking
    supabase
      .from('closed_deals')
      .select('id,lead_id,revenue,closed_at,notes,portfolio_key')
      .eq('lead_id', lead.id)
      .order('closed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setDealRecord(data as DealRecord);
      })
      .then(undefined, () => {});

    // Pipeline status & ownership/market data
    supabase
      .from('leads')
      .select('pipeline_status,pipeline_status_updated_at,ownership_data,market_comparables')
      .eq('id', lead.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          if (data.pipeline_status) setPipelineStatus(data.pipeline_status as PipelineStatus);
          setPipelineUpdatedAt((data.pipeline_status_updated_at as string | null) ?? null);
          if (data.ownership_data) setOwnershipData(data.ownership_data as Record<string, unknown>);
          if (data.market_comparables) setMarketComparables(data.market_comparables as Array<Record<string, unknown>>);
        }
      })
      .then(undefined, () => {});
  }, [lead]);

  // Replies, form submissions, offers and signatures move the pipeline on the server, so keep the track in step while the page is open.
  useEffect(() => {
    if (!lead?.id) return;
    const id = lead.id;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      supabase.from('leads').select('pipeline_status,pipeline_status_updated_at').eq('id', id).maybeSingle()
        .then(({ data }) => { if (data) { setPipelineStatus((data.pipeline_status as PipelineStatus) ?? null); setPipelineUpdatedAt((data.pipeline_status_updated_at as string | null) ?? null); } })
        .then(undefined, () => {});
    };
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

  // Reload secondary data after mutations
  const reloadSecondaryData = useCallback(() => {
    if (!lead) return;
    secondaryLoadedRef.current = false;

    setHistoryLoading(true);
    setNotesLoading(true);
    setOutreachLoading(true);

    supabase
      .from('contact_history')
      .select('id,lead_id,type,subject,body,outcome,contacted_at')
      .eq('lead_id', lead.id)
      .order('contacted_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { if (data) setHistory(data as ContactHistoryEntry[]); })
      .then(undefined, () => {})
      .then(() => setHistoryLoading(false));

    supabase
      .from('team_notes')
      .select('id,lead_id,author,content,created_at')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { if (data) setTeamNotes(data as TeamNote[]); })
      .then(undefined, () => {})
      .then(() => setNotesLoading(false));

    supabase
      .from('outreach_history')
      .select('id,lead_id,channel,subject,body_preview,full_body,status,recipient_email,recipient_phone,reply_detected,reply_snippet,sent_at,agent_id,metadata')
      .eq('lead_id', lead.id)
      .order('sent_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { if (data) setOutreachLog(data as OutreachLogEntry[]); })
      .then(undefined, () => {})
      .then(() => setOutreachLoading(false));

    secondaryLoadedRef.current = true;
  }, [lead, supabase]);

  const enrichmentTimeline: EnrichmentEvent[] = lead ? [
    {
      id: 'e-created',
      label: 'Lead Created',
      detail: `Sourced from ${lead.source}`,
      timestamp: lead.createdAt || '',
      type: 'sync' as const,
    },
    {
      id: 'e-scored',
      label: 'Prospect Score Calculated',
      detail: `Score: ${lead.prospectScore}/100`,
      timestamp: lead.createdAt || '',
      type: 'score' as const,
    },
    {
      id: 'e-stage',
      label: `Stage Set to "${lead.stage}"`,
      detail: 'Initial stage assignment',
      timestamp: lead.updatedAt || '',
      type: 'stage' as const,
    },
    {
      id: 'e-checked',
      label: 'Listing Verified',
      detail: `Last checked ${lead.lastChecked}`,
      timestamp: lead.lastChecked || '',
      type: 'verify' as const,
    },
    ...(contactData?.events ?? []).filter(e => e.kind !== 'link').slice(0, 3).map((e, i) => ({
      id: `e-hist-${i}`,
      label: String(e.title),
      detail: String(e.status ?? e.source ?? ''),
      timestamp: String(e.at),
      type: 'note' as const,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) : [];

  if (!lead) return null;

  async function handleSaveNote() {
    if (!noteContent.trim() || !lead) return;
    setSavingNote(true);
    try {
      const { error } = await supabase.from('team_notes').insert({
        lead_id: lead.id,
        author: 'Operator',
        content: noteContent.trim(),
      });
      if (error) throw error;
      setNoteContent('');
      toast.success('Note added');
      reloadSecondaryData();
    } catch {
      setTeamNotes(prev => [{
        id: `local-${Date.now()}`,
        lead_id: lead.id,
        author: 'Operator',
        content: noteContent.trim(),
        created_at: new Date().toISOString(),
      }, ...prev]);
      setNoteContent('');
      toast.success('Note added');
    } finally {
      setSavingNote(false);
    }
  }

  async function handleSaveLog() {
    if (!logBody.trim() || !lead) return;
    setSavingLog(true);
    try {
      const { error } = await supabase.from('contact_history').insert({
        lead_id: lead.id,
        type: logType,
        subject: logSubject,
        body: logBody,
        outcome: logOutcome,
        contacted_at: logDate,
      });
      if (error) throw error;
      setLogSubject(''); setLogBody(''); setLogOutcome(''); setShowLogForm(false);
      toast.success('Contact logged');
      reloadSecondaryData();
      loadContactHistory();
    } catch {
      setHistory(prev => [{
        id: `local-${Date.now()}`,
        lead_id: lead.id,
        type: logType,
        subject: logSubject,
        body: logBody,
        outcome: logOutcome,
        contacted_at: logDate,
      }, ...prev]);
      setLogSubject(''); setLogBody(''); setLogOutcome(''); setShowLogForm(false);
      toast.success('Contact logged');
    } finally {
      setSavingLog(false);
    }
  }

  async function handleMarkDealClosed() {
    if (!lead) return;
    if (signing.state !== 'signed') { toast.error('The homeowner must sign the DocuSign agreements before this deal can be closed.'); return; }
    setSavingDeal(true);
    try {
      const revenueNum = dealRevenue ? parseFloat(dealRevenue.replace(/[^0-9.]/g, '')) : null;
      const closedAt = new Date().toISOString();

      const { error: closeError } = await supabase.from('leads').update({
        deal_closed: true,
        deal_closed_at: closedAt,
        deal_revenue: revenueNum,
        deal_notes: dealNotes || null,
        stage: 'closed',
      }).eq('id', lead.id);
      if (closeError) throw closeError;

      const portfolioKey = lead.state ? lead.state.toLowerCase() : null;
      await supabase.from('closed_deals').insert({
        lead_id: lead.id,
        state: lead.state,
        portfolio_key: portfolioKey,
        revenue: revenueNum,
        closed_at: closedAt,
        closed_by: user?.id ?? null,
        notes: dealNotes || null,
      });

      fetch('/api/hubspot/push-closed-deal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: lead.id,
          address: lead.address,
          city: lead.city,
          state: lead.state,
          zip: lead.zip,
          contactName: lead.contactName,
          contactEmail: lead.contactEmail,
          contactPhone: lead.contactPhone,
          dealRevenue: revenueNum,
          dealNotes: dealNotes || undefined,
          closedAt,
          portfolioKey,
        }),
      }).then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) {
          toast.success('Deal synced to HubSpot');
        } else if (data.skipped) {
          // HubSpot key not configured — silent skip
        } else if (!res.ok) {
          toast.error(`HubSpot sync failed: ${data.error || 'Unknown error'}`);
        }
      }).then(undefined, () => {});

      setDealClosed(true);
      setDealClosedAt(closedAt);
      setShowDealForm(false);
      toast.success('Deal marked as closed!');
      reloadSecondaryData();
    } catch {
      toast.error('Failed to mark deal as closed. Please try again.');
    } finally {
      setSavingDeal(false);
    }
  }

  async function handleReopenDeal() {
    if (!lead) return;
    try {
      await supabase.from('leads').update({
        deal_closed: false,
        deal_closed_at: null,
      }).eq('id', lead.id);
      setDealClosed(false);
      setDealClosedAt(null);
      toast.success('Deal reopened');
    } catch {
      toast.error('Failed to reopen deal');
    }
  }

  async function handlePipelineStatusChange(status: PipelineStatus) {
    if (!lead) return;
    const newStatus = pipelineStatus === status ? null : status;
    setSavingPipelineStatus(true);
    try {
      await supabase.from('leads').update({
        pipeline_status: newStatus,
        pipeline_status_updated_at: new Date().toISOString(),
      } as Record<string, unknown>).eq('id', lead.id);
      setPipelineStatus(newStatus);
      setPipelineUpdatedAt(new Date().toISOString());
      toast.success(newStatus ? `Pipeline status: ${PIPELINE_STATUS_CONFIG[newStatus].label}` : 'Pipeline status cleared');
    } catch {
      toast.error('Failed to update pipeline status');
    } finally {
      setSavingPipelineStatus(false);
    }
  }

  // ── Show skeleton while lead is loading ───────────────────────────────────
  if (leadLoading) {
    return <LeadProfileSkeleton />;
  }

  // ── Fast-fail: lead not found ─────────────────────────────────────────────
  if (!lead || leadNotFound) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <AlertCircle size={20} className="text-muted-foreground" />
            </div>
            <p className="text-foreground font-semibold">Lead not found</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              {leadId
                ? <>The lead ID <code className="bg-muted px-1 rounded text-xs">{leadId}</code> does not match any record.</>
                : 'No lead ID was provided in the URL.'}
            </p>
            <button
              onClick={() => router.push('/lead-management')}
              className="mt-3 px-4 py-2 text-xs bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
            >
              Back to Lead Management
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const grossMonthly = lead.estimatedGrossMonthly;
  const netMonthly = lead.estimatedNetMonthly;
  const annualNet = netMonthly * 12;
  const askingRent = lead.priceType === 'rent' && lead.price >= 400 && lead.price <= 25000 ? lead.price : 0;
  const leaseCost = askingRent || marketRent || Number(lead.extra?.estimated_market_rent) || 0;
  const roi = leaseCost > 0 && netMonthly > 0 ? Math.round((netMonthly / leaseCost) * 100) : null;

  // ── Source site map for fallback ──────────────────────────────────────────
  const SOURCE_SITE_MAP: Record<string, { label: string; url: string }> = {
    'Zillow': { label: 'Zillow', url: 'https://www.zillow.com' },
    'Trulia': { label: 'Trulia', url: 'https://www.trulia.com' },
    'Craigslist': { label: 'Craigslist', url: 'https://craigslist.org' },
    'Facebook Marketplace': { label: 'Facebook Marketplace', url: 'https://www.facebook.com/marketplace/category/propertyrentals' },
    'Realtor.com': { label: 'Realtor.com', url: 'https://www.realtor.com' },
    'Redfin': { label: 'Redfin', url: 'https://www.redfin.com' },
    'HotPads': { label: 'HotPads', url: 'https://hotpads.com' },
    'Apartments.com': { label: 'Apartments.com', url: 'https://www.apartments.com' },
    'LoopNet': { label: 'LoopNet', url: 'https://www.loopnet.com' },
    'Airbnb': { label: 'Airbnb', url: 'https://www.airbnb.com' },
    'VRBO': { label: 'VRBO', url: 'https://www.vrbo.com' },
    'MLS': { label: 'MLS', url: 'https://www.mls.com' },
    'Direct': { label: 'Google', url: 'https://www.google.com/maps' },
    'Referral': { label: 'Google', url: 'https://www.google.com/maps' },
    'Other': { label: 'Google', url: 'https://www.google.com' },
  };
  const sourceSite = SOURCE_SITE_MAP[lead.source] ?? { label: 'Source Site', url: 'https://www.google.com' };

  // ── Direct listing URL resolution ─────────────────────────────────────────
  const PLACEHOLDER_DOMAINS = ['example.com', 'placeholder.com', 'test.com', 'localhost', 'synthetic.travlr'];
  function isRealListingUrl(url: string | null | undefined): boolean {
    if (!url || url.trim() === '') return false;
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      if (PLACEHOLDER_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) return false;
      if (!['http:', 'https:'].includes(parsed.protocol)) return false;
      // Must have a meaningful path — bare domain homepages are not listing URLs
      const path = parsed.pathname;
      if (path === '/' || path === '') return false;
      return true;
    } catch {
      return false;
    }
  }

  function buildSearchUrl(source: string, address: string, city: string, state: string, zip: string): string | null {
    const fullAddress = `${address}, ${city}, ${state} ${zip}`.trim();
    const encodedAddress = encodeURIComponent(fullAddress);
    const encodedCity = encodeURIComponent(city);
    const encodedState = encodeURIComponent(state.toLowerCase());
    const encodedZip = encodeURIComponent(zip);
    const citySlug = city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    switch (source) {
      case 'Zillow':
        return `https://www.zillow.com/homes/${encodeURIComponent(address + ' ' + city + ' ' + state + ' ' + zip)}_rb/`;
      case 'HotPads':
        return `https://hotpads.com/search?q=${encodedAddress}`;
      case 'Trulia':
        return `https://www.trulia.com/for_rent/${citySlug},${encodedState}/`;
      case 'Realtor.com':
        return `https://www.realtor.com/realestateandhomes-search/${citySlug}_${state.toUpperCase()}`;
      case 'Redfin':
        return `https://www.redfin.com/city/${citySlug}/${state.toUpperCase()}/filter/property-type=house`;
      case 'Apartments.com':
        return `https://www.apartments.com/${citySlug}-${encodedState}/`;
      case 'Craigslist':
        return `https://www.google.com/search?q=${encodeURIComponent(address + ' ' + city + ' ' + state + ' site:craigslist.org')}`;
      case 'Facebook Marketplace':
        return `https://www.facebook.com/marketplace/category/propertyrentals/?query=${encodedAddress}`;
      case 'LoopNet':
        return `https://www.loopnet.com/search/commercial-real-estate/${citySlug}-${encodedState}/for-lease/`;
      case 'Airbnb':
        return `https://www.airbnb.com/s/${encodedCity}--${encodedState}/homes`;
      case 'VRBO':
        return `https://www.vrbo.com/vacation-rentals/${encodedCity.toLowerCase()}-${encodedState.toLowerCase()}`;
      case 'MLS':
        return `https://www.mls.com/search.mvc?city=${encodedCity}&state=${encodedState}&zip=${encodedZip}`;
      default:
        return `https://www.google.com/search?q=${encodedAddress}+rental+listing`;
    }
  }

  const extra = (lead.extra ?? {}) as Record<string, any>;
  const directListingUrl: string | null = [lead.listingUrl, extra.listing_source_url, extra.sync_source_url].find(u => isRealListingUrl(u)) ?? null; // never a search URL

  const isStoredUrl = !!directListingUrl;

  // ── Outreach message with slight variation to avoid spam flags ────────────
  const msgVariants = [
    { opening: `Hi! I came across your listing at ${propertyAddress} and wanted to reach out —`, cta: `If you're ever curious what ${propertyAddress} could earn as a professionally managed vacation rental, here's a free instant estimate, no strings attached:` },
    { opening: `Hello! I noticed your property at ${propertyAddress} and thought I'd get in touch —`, cta: `Curious what ${propertyAddress} could bring in as a short-term rental? Here's a free estimate with no commitment:` },
    { opening: `Hi there! Your property at ${propertyAddress} caught my eye and I wanted to connect —`, cta: `If you've ever wondered what ${propertyAddress} might earn as a vacation rental, here's a free, no-obligation estimate:` },
    { opening: `Hello! I came across ${propertyAddress} and wanted to reach out —`, cta: `Wondering what ${propertyAddress} could generate as a professionally managed STR? Here's a free estimate:` },
  ];
  const variantIdx = lead.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % msgVariants.length;
  const variant = msgVariants[variantIdx];
  const outreachMessage = `${variant.opening} I'm with TRAVLR Vacation Homes, a property management company. ${variant.cta}\nstaytrvlr.com/estimate\nYou can also learn more about us at staytrvlr.com. Happy to answer any questions!\n— ${agentFirstName}, TRAVLR Vacation Homes`;

  async function handleCopyMessage() {
    const text = outreachMessage;
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        setMessageCopied(true);
        toast.success('Message copied to clipboard!');
        setTimeout(() => setMessageCopied(false), 2500);
        return;
      } catch {
        // Fall through to textarea fallback
      }
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const success = document.execCommand('copy');
      document.body.removeChild(ta);
      if (success) {
        setMessageCopied(true);
        toast.success('Message copied to clipboard!');
        setTimeout(() => setMessageCopied(false), 2500);
        return;
      }
    } catch {
      // Fall through
    }
    toast.error('Copy failed — please select the message text and copy manually (Ctrl+C / Cmd+C).');
  }

  async function handleCopyAddress() {
    if (!lead) return;
    const text = propertyAddress;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setAddressCopied(true);
      toast.success('Address copied!');
      activityService.record({
        leadId: lead.id,
        leadAddress: lead.address,
        leadState: lead.state,
        eventType: 'lead_edited',
        description: `Agent copied address for ${lead.address}`,
        detail: 'Copy Address fallback used',
        source: 'manual',
      }).then(undefined, () => {});
      setTimeout(() => setAddressCopied(false), 2500);
    } catch {
      toast.error('Copy failed — please copy the address manually.');
    }
  }

  async function handleSendEmail() {
    if (!lead) return;
    if (!lead.contactEmail) {
      toast.error('No email address on file for this homeowner.');
      return;
    }
    // Block outreach on unverified properties
    if (!outreachCleared(lead, ownerMatch)) {
      toast.error('Cannot send email — this property is not a strong data match (75+) and has not passed verification.');
      return;
    }
    setSendingEmail(true);
    try {
      const res = await fetch('/api/send-homeowner-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: lead.contactEmail,
          subject: `TRAVLR Vacation Homes — ${lead.address}`,
          message: outreachMessage,
          leadId: lead.id,
          agentId: user?.id,
          propertyAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send email');
      setEmailSent(true);
      toast.success('Email sent to homeowner!');
      setTimeout(() => setEmailSent(false), 3000);
      reloadSecondaryData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send email';
      showErrorWithRetry({
        message: `Email send failed: ${message}`,
        detail: `To: ${lead.contactEmail}`,
        onRetry: handleSendEmail,
      });
    } finally {
      setSendingEmail(false);
    }
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-4 px-6 py-3.5 border-b border-border bg-card shrink-0">
          <BreadcrumbNav
            items={[
              { label: 'Lead Management', href: '/lead-management' },
              { label: lead.address },
            ]}
            showBack
          />
          <div className="flex items-center gap-3 flex-1 min-w-0 ml-2">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Home size={16} className="text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-foreground truncate">{lead.address}</h1>
              <p className="text-xs text-muted-foreground">{lead.city}, {lead.state} {lead.zip}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StageBadge stage={lead.stage} />
            <RegulationBadge status={lead.regulationStatus} />
            {/* ── Verification Badge ─────────────────────────────────────────── */}
            {lead.verificationStatus === 'VERIFIED' && (lead.verificationScore ?? 0) >= 75 ? (
              <span
                title={`Verified property — Score: ${lead.verificationScore ?? 0}/100 | Method: ${lead.verificationMethod || 'structural'} | ${lastVerified(lead) ? new Date(lastVerified(lead)!.at).toLocaleString() : ''}`}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-full bg-green-500/15 text-green-600 border border-green-500/30"
              >
                <CheckCircle size={10} />
                VERIFIED
              </span>
            ) : outreachCleared(lead, ownerMatch) ? (
              <span
                title={`Strong match on the data on file (${assessLead(lead, ownerMatch).score}/100). The licensed property-record check has not been run.`}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-full bg-green-500/15 text-green-600 border border-green-500/30"
              >
                <CheckCircle size={10} />
                DATA MATCH {assessLead(lead, ownerMatch).score}
              </span>
            ) : (
              <span
                title={`Unverified property — Status: ${lead.verificationStatus || 'CANDIDATE'} | Score: ${lead.verificationScore ?? 0}/100${lead.verificationNotes ? ' | ' + lead.verificationNotes : ''}`}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-full bg-amber-500/15 text-amber-600 border border-amber-500/30"
              >
                <AlertCircle size={10} />
                UNVERIFIED
              </span>
            )}
            <button
              onClick={() => {
                if (!outreachCleared(lead, ownerMatch)) {
                  toast.error('Cannot send SMS — this property is not a strong data match (75+) and has not passed verification.');
                  return;
                }
                setShowSMSModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
            >
              <MessageSquare size={12} />
              Send SMS
            </button>
            {directListingUrl ? (
              <a
                href={directListingUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  activityService.record({
                    leadId: lead.id,
                    leadAddress: lead.address,
                    leadState: lead.state,
                    eventType: 'lead_edited',
                    description: `Agent viewed listing for ${lead.address}`,
                    detail: 'Direct listing link clicked from outreach section',
                    source: 'manual',
                  }).then(undefined, () => {});
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground"
              >
                <ExternalLink size={12} />
                View Original Listing
              </a>
            ) : (
              <span
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground/40 cursor-not-allowed"
                title="No listing URL captured for this lead"
              >
                <ExternalLink size={12} />
                No Listing URL
              </span>
            )}
          </div>
        </div>

        {/* Synthetic lead warning banner */}
        {lead.isSynthetic && (
          <div className="flex items-center gap-3 px-6 py-2.5 bg-amber-50 border-b border-amber-200 shrink-0">
            <AlertCircle size={15} className="text-amber-600 shrink-0" />
            <p className="text-xs text-amber-800 font-medium">
              <span className="font-semibold">Demo / Synthetic Lead</span> — This address was generated by the sync process and does not correspond to a real property listing on Zillow, HotPads, or other sites. Do not contact or outreach to this lead.
            </p>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-3 gap-6">

            {/* Left column (2/3) */}
            <div className="col-span-2 flex flex-col gap-5">

              {/* ── Outreach Message Section ── */}
              <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                      <MessageSquare size={15} className="text-primary" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">Outreach Message</h2>
                      <p className="text-[11px] text-muted-foreground">Ready to paste into Zillow, HotPads, etc.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {lead.contactEmail && (
                      <button
                        onClick={handleSendEmail}
                        disabled={sendingEmail}
                        className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${emailSent ? 'bg-green-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60'}`}
                      >
                        {sendingEmail ? <RefreshCw size={13} className="animate-spin" /> : emailSent ? <Check size={13} /> : <Mail size={13} />}
                        {sendingEmail ? 'Sending…' : emailSent ? 'Sent!' : 'Email Homeowner'}
                      </button>
                    )}
                    <button
                      onClick={handleCopyMessage}
                      className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${messageCopied ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
                    >
                      {messageCopied ? <Check size={13} /> : <Copy size={13} />}
                      {messageCopied ? 'Copied!' : 'Copy Message'}
                    </button>
                  </div>
                </div>
                {lead.contactEmail && (
                  <p className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1">
                    <Mail size={10} />
                    Will send to: <span className="font-medium text-foreground ml-1">{lead.contactEmail}</span>
                  </p>
                )}
                <div className="bg-card border border-border rounded-lg p-4 text-sm text-foreground leading-relaxed whitespace-pre-wrap font-mono text-[12px] select-all">
                  {outreachMessage}
                </div>

                {/* ── Listing Fallback ── */}
                <div className="mt-4 p-3.5 bg-card border border-border rounded-xl space-y-3">
                  <div className="flex items-center gap-2">
                    <Link2 size={13} className="text-primary" />
                    <p className="text-xs font-semibold text-foreground">Find This Listing</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-20 shrink-0">Direct link:</span>
                    {isStoredUrl && directListingUrl ? (
                      <a
                        href={directListingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={async () => {
                          try {
                            await supabase.from('activity_events').insert({
                              lead_id: lead.id,
                              event_type: 'listing_direct_link_clicked',
                              detail: `Agent clicked direct listing link from outreach section`,
                              agent_id: user?.id ?? null,
                            });
                          } catch { /* non-critical */ }
                        }}
                        className="flex items-center gap-1.5 text-xs text-primary hover:underline truncate max-w-[260px]"
                      >
                        <ExternalLink size={11} />
                        {directListingUrl.length > 50 ? directListingUrl.slice(0, 50) + '…' : directListingUrl}
                      </a>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground/60 italic">
                        <XCircle size={11} className="text-muted-foreground/40 shrink-0" />
                        {linkLooking ? 'Looking for the listing on Zillow…' : 'No verified listing URL on file — use the fallback below'}
                      </span>
                    )}
                    {isStoredUrl && extra.link_status && (
                      <span className={`text-[10px] shrink-0 ${extra.link_status === 'Unavailable' ? 'text-amber-600' : 'text-muted-foreground'}`}>
                        {extra.link_status === 'Unavailable' ? 'listing may be off market' : String(extra.link_status).toLowerCase()}
                        {extra.link_last_checked_at ? ` (checked ${new Date(extra.link_last_checked_at).toLocaleDateString()})` : ''}
                      </span>
                    )}
                  </div>
                  {!isStoredUrl && relatedLink && (
                    <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
                      <span className="w-20 shrink-0" />
                      <span>Zillow has only a single unit of this building ({relatedLink.address || 'unit record'}), which may not be this home.{' '}
                        <a href={relatedLink.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">View that record</a>
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                    <span className="text-[10px] text-muted-foreground w-20 shrink-0">Fallback:</span>
                    <button
                      onClick={handleCopyAddress}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${addressCopied ? 'bg-green-500 text-white border-green-500' : 'bg-background border-border text-foreground hover:border-primary/50 hover:bg-muted'}`}
                    >
                      {addressCopied ? <Check size={12} /> : <ClipboardCopy size={12} />}
                      {addressCopied ? 'Copied!' : 'Copy Address'}
                    </button>
                    <a
                      href={sourceSite.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        activityService.record({
                          leadId: lead.id,
                          leadAddress: lead.address,
                          leadState: lead.state,
                          eventType: 'outreach_sent',
                          description: `Agent opened ${sourceSite.label} to search for ${lead.address}`,
                          detail: 'Source site opened for manual search',
                          source: 'manual',
                        }).then(undefined, () => {});
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-background text-foreground hover:border-primary/50 hover:bg-muted transition-all"
                    >
                      <Globe size={12} />
                      Open {sourceSite.label}
                    </a>
                    <span className="text-[10px] text-muted-foreground">→ paste address → find listing → message homeowner</span>
                  </div>
                </div>
              </div>

              {/* KPI strip */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Prospect Score', value: `${lead.prospectScore}`, sub: scoreMeta ? `/100 · ${(() => { const m = Math.max(0, Math.round((Date.now() - Date.parse(scoreMeta.refreshedAt)) / 60_000)); return m < 1 ? 'updated just now' : m < 60 ? `updated ${m}m ago` : `updated ${Math.round(m / 60)}h ago`; })()}` : '/100', icon: <Star size={15} className="text-amber-500" />, color: 'text-amber-500' },
                  { label: 'Gross/Month', value: formatCurrency(grossMonthly), sub: 'estimated', icon: <TrendingUp size={15} className="text-green-500" />, color: 'text-green-600' },
                  { label: 'Net/Month', value: formatCurrency(netMonthly), sub: 'after costs', icon: <DollarSign size={15} className="text-primary" />, color: 'text-primary' },
                  { label: 'Days on Market', value: lead.daysOnMarket > 0 ? `${lead.daysOnMarket}` : '—', sub: lead.daysOnMarket > 0 ? 'days' : 'no listing date on file', icon: <Clock size={15} className="text-muted-foreground" />, color: 'text-foreground' },
                ].map(kpi => (
                  <div key={kpi.label} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center gap-1.5 mb-2">
                      {kpi.icon}
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{kpi.label}</span>
                    </div>
                    <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}<span className="text-xs font-normal text-muted-foreground ml-1">{kpi.sub}</span></p>
                  </div>
                ))}
              </div>
              {fillNote && <p className="text-[11px] text-muted-foreground -mt-1">Gross and net per month are modeled estimates: {fillNote}</p>}

              {/* Prospect Score Bar */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Star size={15} className="text-amber-500" />
                    <span className="text-sm font-semibold text-foreground">Prospect Score</span>
                  </div>
                  <ConfidenceBandBadge score={lead.prospectScore} showRange />
                </div>
                <ProspectScoreBar score={lead.prospectScore} showBand />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(['hot', 'warm', 'cold'] as const).map(band => {
                    const cfg = CONFIDENCE_BAND_CONFIG[band];
                    const Icon = cfg.icon;
                    const isCurrent = getConfidenceBand(lead.prospectScore) === band;
                    return (
                      <div key={band} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-medium ${isCurrent ? `${cfg.bg} ${cfg.color} ${cfg.border}` : 'bg-muted/30 text-muted-foreground border-border'}`}>
                        <Icon size={10} />
                        <span>{cfg.label}</span>
                        <span className="ml-auto opacity-60">{cfg.range}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── AI Lead Qualification Panel ── */}
              {(() => {
                const qualSignals: LeadQualificationSignals = {
                  leadId: lead.id,
                  propertyProfile: {
                    address: lead.address,
                    city: lead.city,
                    state: lead.state,
                    beds: lead.beds,
                    baths: lead.baths,
                    propertyType: lead.priceType === 'rent' ? 'rental' : 'sale',
                    estimatedRent: lead.price,
                    daysOnMarket: lead.daysOnMarket,
                    estimatedGrossMonthly: lead.estimatedGrossMonthly,
                    estimatedNetMonthly: lead.estimatedNetMonthly,
                    estimatedADR: lead.estimatedADR,
                    estimatedOccupancy: lead.estimatedOccupancy,
                  },
                  responsePatterns: {
                    emailOpens: outreachLog.filter(e => e.status === 'opened').length,
                    emailClicks: outreachLog.filter(e => e.status === 'clicked').length,
                    smsReplies: outreachLog.filter(e => e.channel === 'sms' && e.reply_detected).length,
                    totalCalls: contactData?.counts.calls ?? 0,
                    callsAnswered: (contactData?.events ?? []).filter(e => e.kind === 'call' && /answer|connect|spoke|talked/i.test(String(e.status ?? ''))).length,
                    lastContactedAt: contactData?.lastContactAt ?? null,
                  },
                  regulatoryContext: regulation ? {
                    cityRegulationStatus: regulation.status,
                    jurisdictionName: regulation.city,
                  } : undefined,
                  currentStage: lead.stage,
                  currentScore: lead.prospectScore,
                };
                return <AILeadQualificationPanel signals={qualSignals} variant="full" />;
              })()}

              {/* ── Conversion Pipeline Status ── */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp size={15} className="text-primary" />
                    <span className="text-sm font-semibold text-foreground">Conversion Pipeline</span>
                  </div>
                  {pipelineStatus && <PipelineStatusBadge status={pipelineStatus} />}
                </div>
                <p className="text-[11px] text-muted-foreground -mt-2 mb-3">Updates automatically from texts, replies, form submissions, offers and signatures. You can also set it by hand.{pipelineUpdatedAt ? ` Last changed ${new Date(pipelineUpdatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.` : ''}</p>
                {/* Pipeline progress track */}
                <div className="relative mb-4">
                  <div className="absolute top-3.5 left-0 right-0 h-0.5 bg-border" />
                  <div className="relative flex justify-between">
                    {PIPELINE_STATUS_ORDER.filter(s => s !== 'rejected').map((status, idx) => {
                      const cfg = PIPELINE_STATUS_CONFIG[status];
                      const Icon = cfg.icon;
                      const isActive = pipelineStatus === status;
                      const isPast = pipelineStatus && PIPELINE_STATUS_ORDER.indexOf(pipelineStatus) > idx && pipelineStatus !== 'rejected';
                      return (
                        <button
                          key={status}
                          onClick={() => handlePipelineStatusChange(status)}
                          disabled={savingPipelineStatus}
                          title={cfg.label}
                          className={`flex flex-col items-center gap-1.5 group transition-all ${savingPipelineStatus ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all z-10 ${
                            isActive
                              ? `${cfg.bg} ${cfg.border} ${cfg.color} border-current`
                              : isPast
                              ? 'bg-primary/10 border-primary text-primary' :'bg-card border-border text-muted-foreground group-hover:border-primary/50 group-hover:text-primary'
                          }`}>
                            <Icon size={12} />
                          </div>
                          <span className={`text-[9px] font-medium text-center leading-tight max-w-[52px] ${isActive ? cfg.color : isPast ? 'text-primary' : 'text-muted-foreground'}`}>
                            {cfg.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* Rejected button separate */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <span className="text-[11px] text-muted-foreground">Mark as rejected?</span>
                  <button
                    onClick={() => handlePipelineStatusChange('rejected')}
                    disabled={savingPipelineStatus}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                      pipelineStatus === 'rejected' ?'bg-red-500/10 text-red-500 border-red-500/30' :'bg-background border-border text-muted-foreground hover:bg-red-500/5 hover:text-red-500 hover:border-red-500/30'
                    } ${savingPipelineStatus ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <XCircle size={11} />
                    Rejected
                  </button>
                </div>
                {/* Actual vs predicted conversion note */}
                <div className="mt-3 p-2.5 bg-muted/30 rounded-lg">
                  <p className="text-[10px] text-muted-foreground">
                    <span className="font-medium text-foreground">Predicted score:</span> {lead.prospectScore}/100 ·{' '}
                    <span className="font-medium text-foreground">Band:</span> {getConfidenceBand(lead.prospectScore).charAt(0).toUpperCase() + getConfidenceBand(lead.prospectScore).slice(1)} ·{' '}
                    {pipelineStatus === 'signed' ? (
                      <span className="text-emerald-600 font-medium">✓ Converted</span>
                    ) : pipelineStatus === 'rejected' ? (
                      <span className="text-red-500 font-medium">✗ Did not convert</span>
                    ) : pipelineStatus ? (
                      <span className="text-primary font-medium">In progress</span>
                    ) : (
                      <span className="text-muted-foreground">No status set</span>
                    )}
                  </p>
                </div>
              </div>

              {/* ── Outreach Log Section — loads independently ── */}
              <Section title={`Outreach Log${outreachLog.length > 0 ? ` (${outreachLog.length})` : ''}`} icon={<Inbox size={15} />} defaultOpen={true}>
                {outreachLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map(i => <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />)}
                  </div>
                ) : outreachLog.length === 0 ? (
                  <div className="text-center py-8">
                    <Inbox size={24} className="text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No outreach sent yet</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-1">Emails sent and SMS messages will appear here</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {outreachLog.map(entry => { const disp = outreachDisplay(entry); const text = entry.body_preview || (entry.metadata?.message as string | undefined) || (entry.metadata?.body as string | undefined) || null; return (
                      <div key={entry.id} className="flex items-start gap-3 p-3.5 bg-muted/20 rounded-xl border border-border">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${entry.channel === 'email' ? 'bg-blue-500/10 text-blue-500' : 'bg-purple-500/10 text-purple-500'}`}>
                          {entry.channel === 'email' ? <Mail size={14} /> : <MessageSquare size={14} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-semibold text-foreground capitalize">{entry.channel}</span>
                            {entry.subject && (
                              <span className="text-xs text-muted-foreground truncate max-w-[200px]">— {entry.subject}</span>
                            )}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize ml-auto shrink-0 ${outreachToneColors[disp.tone]}`}>
                              {disp.label}
                            </span>
                          </div>
                          {(entry.recipient_email || entry.recipient_phone) && (
                            <p className="text-[11px] text-muted-foreground mb-1">
                              To: {entry.recipient_email || entry.recipient_phone}
                            </p>
                          )}
                          {entry.metadata?.campaign_name || entry.metadata?.batch ? (
                            <p className="text-[10px] text-muted-foreground/70 mb-1">Campaign: {String(entry.metadata?.campaign_name ?? entry.metadata?.batch)}</p>
                          ) : null}
                          {text && (
                            <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{text}</p>
                          )}
                          {entry.reply_detected && entry.reply_snippet && (
                            <div className="mt-2 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                              <p className="text-[10px] font-semibold text-emerald-600 mb-0.5 flex items-center gap-1">
                                <CheckCircle size={9} /> Homeowner replied
                              </p>
                              <p className="text-xs text-emerald-700 line-clamp-2">{entry.reply_snippet}</p>
                            </div>
                          )}
                          <div className="mt-1.5 space-y-0.5">
                            {disp.events.map(ev => (
                              <p key={ev.label} className="text-[10px] text-muted-foreground/70">{ev.label} {fmtLogTime(ev.at)}</p>
                            ))}
                          </div>
                        </div>
                      </div>
                    ); })}
                  </div>
                )}
              </Section>

              {/* All Lead Fields */}
              <Section title="Property Details" icon={<Home size={15} />}>
                <DetailRows rows={[
                  { label: 'Address', value: lead.address },
                  { label: 'City', value: lead.city },
                  { label: 'State', value: lead.state },
                  { label: 'ZIP', value: lead.zip },
                  { label: 'County', value: extra.county },
                  { label: 'Neighborhood', value: extra.neighborhood },
                  { label: 'Property type', value: extra.property_type_label || extra.property_type },
                  { label: 'Bedrooms', value: lead.beds > 0 ? `${lead.beds} bed` : null },
                  { label: 'Bathrooms', value: lead.baths > 0 ? `${lead.baths} bath` : null },
                  { label: 'Square feet', value: Number(extra.square_feet) > 0 ? Number(extra.square_feet).toLocaleString() : null },
                  { label: 'Lot size', value: extra.lot_size },
                  { label: 'Year built', value: Number(extra.year_built) > 0 ? extra.year_built : null },
                  { label: 'HOA fee', value: Number(extra.hoa_fee) > 0 ? `${formatCurrency(Number(extra.hoa_fee))}/mo` : null },
                  { label: 'Tax assessment', value: Number(extra.tax_assessment) > 0 ? formatCurrency(Number(extra.tax_assessment)) : null },
                  { label: 'APN', value: extra.apn },
                  { label: 'Parcel ID', value: extra.parcel_id },
                  { label: lead.priceType === 'rent' ? 'Asking rent' : 'List price', value: lead.price > 0 ? `${formatCurrency(lead.price)}${lead.priceType === 'rent' ? '/mo' : ''}` : null },
                  { label: 'Price type', value: lead.priceType === 'rent' ? 'Rental' : 'For Sale' },
                  { label: 'Amenities', value: Array.isArray(extra.amenities) ? extra.amenities.join(', ') : extra.amenities },
                  { label: 'Features', value: [extra.has_pool && 'Pool', extra.has_parking && 'Parking', extra.is_waterfront && 'Waterfront', extra.is_furnished && 'Furnished', extra.is_fsbo && 'For sale by owner', extra.is_apartment_community && 'Apartment community', extra.luxury && 'Luxury'].filter(Boolean).join(', ') },
                  { label: 'Source', value: lead.source },
                  { label: 'Days on market', value: lead.daysOnMarket > 0 ? `${lead.daysOnMarket} days${domNote ? ` (${domNote})` : ''}` : 'Not on file — no listing date or listing record' },
                  { label: 'Last checked', value: lead.lastChecked },
                  { label: 'Created', value: lead.createdAt },
                ]} />
                {lead.tags.length > 0 && (
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                    <Tag size={12} className="text-muted-foreground" />
                    <div className="flex flex-wrap gap-1.5">
                      {lead.tags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-medium rounded-full">{tag}</span>
                      ))}
                    </div>
                  </div>
                )}
              </Section>

              {/* ── Verification Status Panel ─────────────────────────────────── */}
              <Section title="Property Verification" icon={<Shield size={15} />} defaultOpen={true}>
                {(() => {
                  const isVerified = lead.verificationStatus === 'VERIFIED' && (lead.verificationScore ?? 0) >= 75;
                  const da = assessLeadData(lead, directListingUrl, ownerMatch);
                  const score = da.score;
                  const scoreColor = score >= 75 ? 'text-green-600' : score >= 50 ? 'text-amber-600' : 'text-red-500';
                  const scoreBarColor = score >= 75 ? 'bg-green-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500';
                  const formal = lead.verificationStatus && lead.verificationStatus !== 'CANDIDATE' ? lead.verificationStatus : 'Not run';
                  return (
                    <div className="space-y-4">
                      <div className={`flex items-center gap-3 p-3 rounded-lg border ${da.level === 'strong' ? 'bg-green-500/8 border-green-500/25' : 'bg-amber-500/8 border-amber-500/25'}`}>
                        {da.level === 'strong'
                          ? <CheckCircle size={18} className="text-green-600 shrink-0" />
                          : <AlertCircle size={18} className="text-amber-600 shrink-0" />}
                        <div>
                          <p className={`text-sm font-semibold ${da.level === 'strong' ? 'text-green-700' : 'text-amber-700'}`}>{da.label} · {score}/100</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {da.checks.filter(c => c.pass).length} of {da.checks.length} checks pass on the data on file. {isVerified ? 'Passed the property verification gate.' : 'The licensed property-record check has not been run for this lead.'}
                          </p>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] text-muted-foreground font-medium">Data match score</span>
                          <span className={`text-sm font-bold ${scoreColor}`}>{score}/100</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${scoreBarColor}`} style={{ width: `${score}%` }} />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                        {da.checks.map(c => (
                          <div key={c.label} className="flex items-start gap-2">
                            {c.pass ? <CheckCircle size={13} className="text-green-600 shrink-0 mt-0.5" /> : c.confirm ? <AlertCircle size={13} className="text-amber-600 shrink-0 mt-0.5" /> : <XCircle size={13} className="text-muted-foreground/50 shrink-0 mt-0.5" />}
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-foreground">{c.label}</p>
                              <p className="text-[10px] text-muted-foreground truncate" title={c.detail}>{c.detail}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 pt-3 border-t border-border">
                        {[
                          { label: 'Provider check', value: formal },
                          { label: 'Method', value: lead.verificationMethod },
                          { label: 'Verified address', value: lead.verifiedAddress || lead.normalizedAddress },
                          { label: 'APN', value: lead.apn },
                          { label: 'Provider', value: lead.propertyProvider },
                          { label: 'Provider ID', value: lead.providerPropertyId },
                          { label: 'County', value: lead.county },
                          { label: 'Last verified', value: (() => { const lv = lastVerified(lead); return lv ? `${new Date(lv.at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })} · ${lv.what}` : null; })() },
                          { label: 'Owner verified', value: lead.extra?.verified_owner ? 'Yes' : null },
                          { label: 'Phone verified', value: lead.extra?.verified_number ? 'Yes' : null },
                        ].filter(f => f.value).map(f => (
                          <div key={f.label} className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-muted-foreground">{f.label}</span>
                            <span className="text-xs font-medium text-foreground truncate" title={String(f.value)}>{f.value}</span>
                          </div>
                        ))}
                      </div>

                      {/* Notes */}
                      {lead.verificationNotes && (
                        <div className="p-2.5 bg-muted/40 rounded-lg">
                          <p className="text-[10px] text-muted-foreground font-medium mb-0.5">Verification Notes</p>
                          <p className="text-xs text-foreground">{lead.verificationNotes}</p>
                        </div>
                      )}

                      {/* Outreach block warning */}
                      {!outreachCleared(lead, ownerMatch) && (
                        <div className="flex items-start gap-2 p-2.5 bg-red-500/8 border border-red-500/20 rounded-lg">
                          <XCircle size={13} className="text-red-500 shrink-0 mt-0.5" />
                          <p className="text-[11px] text-red-600">
                            Outreach blocked — the property needs a data match score of 75 or more, or the formal verification, before SMS or email can be sent.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </Section>

              {/* Listing, agent, rent and AirDNA, shown only when on file */}
              {(() => {
                const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString() : null);
                const usd = (v: unknown) => (Number(v) > 0 ? formatCurrency(Number(v)) : null);
                const contact = (n: unknown, ph: unknown) => [n, ph].filter(Boolean).join(' · ');
                const groups: Array<{ title: string; icon: React.ReactNode; rows: DetailRow[] }> = [
                  { title: 'Listing & Agent', icon: <Link2 size={15} />, rows: [
                    { label: 'Listing status', value: extra.listing_status },
                    { label: 'Listed', value: dt(extra.listing_date) },
                    { label: 'Days on market (listing)', value: Number(extra.days_on_market_listing) > 0 ? `${extra.days_on_market_listing} days` : null },
                    { label: 'Listing source', value: extra.listing_source },
                    { label: 'MLS #', value: [extra.mls_number, extra.mls_source_name].filter(Boolean).join(' · ') },
                    { label: 'Listing agent', value: contact(extra.listing_agent_name, extra.listing_agent_phone) },
                    { label: 'Broker', value: contact(extra.listing_broker_name, extra.listing_broker_phone) },
                    { label: 'Price verified', value: dt(extra.price_verified_at) },
                    { label: 'Listing updated', value: dt(extra.listing_updated_at) },
                  ] },
                  { title: 'Rent & Market', icon: <BarChart2 size={15} />, rows: [
                    { label: 'Asking rent', value: usd(extra.current_asking_rent) },
                    { label: 'Current rent', value: usd(extra.current_monthly_rent) },
                    { label: 'Market rent', value: usd(extra.estimated_market_rent) },
                    { label: 'AI rent estimate', value: usd(extra.estimated_monthly_rent_ai) ? `${usd(extra.estimated_monthly_rent_ai)}${extra.estimated_monthly_rent_ai_confidence ? ` (${extra.estimated_monthly_rent_ai_confidence} confidence)` : ''}` : null },
                    { label: 'Historical rent', value: typeof extra.historical_rent === 'object' ? null : usd(extra.historical_rent) },
                    { label: 'Rent source', value: extra.rent_source },
                  ] },
                  { title: 'AirDNA', icon: <TrendingUp size={15} />, rows: [
                    { label: 'Nightly rate', value: usd(extra.airdna_adr) },
                    { label: 'Occupancy', value: Number(extra.airdna_occupancy) > 0 ? `${Math.round(Number(extra.airdna_occupancy) * (Number(extra.airdna_occupancy) <= 1 ? 100 : 1))}%` : null },
                    { label: 'Annual revenue', value: usd(extra.airdna_annual_revenue) },
                    { label: 'Confidence', value: extra.airdna_confidence },
                    { label: 'Market', value: [extra.airdna_data?.market, extra.airdna_data?.submarket].filter(Boolean).join(' / ') },
                    { label: 'Market score', value: extra.airdna_data?.marketScore ? `${Math.round(extra.airdna_data.marketScore)}/100${extra.airdna_data.marketType ? ` · ${String(extra.airdna_data.marketType).replace(/_/g, ' ')}` : ''}` : null },
                    { label: 'AirDNA home value', value: usd(extra.airdna_data?.homeValue) },
                    { label: 'Cleaning fee', value: usd(extra.airdna_data?.cleaningFee) },
                    { label: 'Comparables used', value: extra.airdna_data?.totalComps ? `${extra.airdna_data.totalComps}` : null },
                    { label: 'Checked', value: dt(extra.airdna_checked_at) },
                  ] },
                ].filter(g => g.rows.some(r => hasValue(r.value)));
                return groups.map(g => (
                  <Section key={g.title} title={g.title} icon={g.icon}>
                    <DetailRows rows={g.rows} />
                  </Section>
                ));
              })()}

              {/* Revenue Estimate */}
              <Section title="Revenue Estimate" icon={<BarChart2 size={15} />}>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {[
                    { label: 'Estimated ADR', value: formatCurrency(lead.estimatedADR), sub: 'per night' },
                    { label: 'Occupancy Rate', value: `${lead.estimatedOccupancy}%`, sub: 'estimated' },
                    { label: 'Gross Monthly', value: formatCurrency(grossMonthly), sub: 'before costs' },
                    { label: 'Net Monthly', value: formatCurrency(netMonthly), sub: 'after costs' },
                    { label: 'Annual Net', value: formatCurrency(annualNet), sub: 'projected' },
                    { label: 'Monthly ROI', value: roi != null ? `${roi}%` : '—', sub: leaseCost > 0 ? `net vs. ${formatCurrency(leaseCost)}/mo ${askingRent ? 'asking' : 'market'} rent` : 'no rent figure on file' },
                  ].map(item => (
                    <div key={item.label} className="bg-muted/40 rounded-lg p-3">
                      <p className="text-[10px] text-muted-foreground mb-1">{item.label}</p>
                      <p className="text-base font-bold text-foreground">{item.value}</p>
                      <p className="text-[10px] text-muted-foreground">{item.sub}</p>
                    </div>
                  ))}
                </div>
                {fillNote && <p className="text-[11px] text-muted-foreground mb-3">{fillNote}</p>}
                <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                  <TrendingUp size={14} className="text-primary" />
                  <p className="text-xs text-primary font-medium">
                    At {lead.estimatedOccupancy}% occupancy, this property generates ~{formatCurrency(annualNet)} net annually.
                  </p>
                </div>
              </Section>

              {/* Contact History — loads independently */}
              <Section title="Contact History" icon={<Activity size={15} />}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {contactData ? `${contactData.events.filter(e => e.kind !== 'link').length} contacts · ${contactData.counts.texts} texts · ${contactData.counts.calls} calls · ${contactData.counts.emails} emails · ${contactData.counts.replies} replies` : 'Loading…'}
                    </p>
                    {contactData?.lastContactAt && <p className="text-[10px] text-muted-foreground/70 mt-0.5">Last contact {fmtLogTime(contactData.lastContactAt)}</p>}
                  </div>
                  <button
                    onClick={() => setShowLogForm(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Plus size={12} />
                    Log Contact
                  </button>
                </div>

                {showLogForm && (
                  <div className="mb-4 p-4 bg-muted/30 border border-border rounded-xl">
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1 block">Type</label>
                        <select
                          value={logType}
                          onChange={e => setLogType(e.target.value as typeof logType)}
                          className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-card outline-none"
                        >
                          {['email', 'call', 'text', 'note'].map(t => (
                            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1 block">Date</label>
                        <input
                          type="date"
                          value={logDate}
                          onChange={e => setLogDate(e.target.value)}
                          className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-card outline-none"
                        />
                      </div>
                    </div>
                    <input
                      value={logSubject}
                      onChange={e => setLogSubject(e.target.value)}
                      placeholder="Subject..."
                      className="w-full text-xs border border-border rounded-lg px-3 py-1.5 bg-card outline-none mb-2"
                    />
                    <textarea
                      value={logBody}
                      onChange={e => setLogBody(e.target.value)}
                      placeholder="Notes / body..."
                      rows={3}
                      className="w-full text-xs border border-border rounded-lg px-3 py-1.5 bg-card outline-none resize-none mb-2"
                    />
                    <input
                      value={logOutcome}
                      onChange={e => setLogOutcome(e.target.value)}
                      placeholder="Outcome (optional)..."
                      className="w-full text-xs border border-border rounded-lg px-3 py-1.5 bg-card outline-none mb-3"
                    />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setShowLogForm(false)} className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors">Cancel</button>
                      <button
                        onClick={handleSaveLog}
                        disabled={savingLog || !logBody.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {savingLog ? <RefreshCw size={11} className="animate-spin" /> : <Save size={11} />}
                        Save
                      </button>
                    </div>
                  </div>
                )}

                {!contactData ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-14 bg-muted/50 rounded-lg animate-pulse" />)}
                  </div>
                ) : contactData.events.length === 0 && contactData.upcoming.length === 0 ? (
                  <div className="text-center py-8">
                    <Activity size={24} className="text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No contact history yet</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {contactData.upcoming.length > 0 && (
                      <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                        <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-1.5">Not sent yet</p>
                        {contactData.upcoming.map(u => (
                          <p key={u.id} className="text-[11px] text-muted-foreground">{u.title} {u.due ? 'was due' : 'scheduled'} {fmtLogTime(u.at)}</p>
                        ))}
                      </div>
                    )}
                    {contactData.events.map(e => {
                      const kind = e.kind === 'link' ? 'text' : String(e.kind);
                      return (
                        <div key={e.id} className="flex items-start gap-3 p-3 bg-muted/20 rounded-lg border border-border">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${typeColors[kind] ?? typeColors.note}`}>{typeIcons[kind] ?? typeIcons.note}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <span className="text-xs font-medium text-foreground">{e.title}</span>
                              <span className="text-[10px] text-muted-foreground">{e.direction === 'inbound' ? 'received' : 'sent'}</span>
                              {e.status && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-auto shrink-0 ${outreachToneColors[e.tone ?? 'gray']}`}>{e.status}</span>}
                            </div>
                            {e.body && <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{e.body}</p>}
                            <div className="mt-1 space-y-0.5">
                              <p className="text-[10px] text-muted-foreground/70">{e.dateOnly ? new Date(e.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : fmtLogTime(e.at)} · {e.source}</p>
                              {(e.details as Array<{ label: string; at?: string; text?: string }>).map(d => (
                                <p key={d.label} className="text-[10px] text-muted-foreground/70">{d.label} {d.at ? fmtLogTime(d.at) : d.text}</p>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>
            </div>

            {/* Right column (1/3) */}
            <div className="col-span-1 flex flex-col gap-5">

              {/* ── Deal / Closed Tracking ── */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${dealClosed ? 'bg-emerald-500/10' : 'bg-muted'}`}>
                      <Handshake size={13} className={dealClosed ? 'text-emerald-600' : 'text-muted-foreground'} />
                    </div>
                    <span className="text-sm font-semibold text-foreground">Deal Status</span>
                  </div>
                  {dealClosed ? (
                    <span className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600">
                      <CheckCircle size={11} />
                      Closed
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground px-2 py-0.5 rounded-full bg-muted">Open</span>
                  )}
                </div>

                <div className="p-4 space-y-3">
                  {dealClosed ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                        <CheckCircle size={15} className="text-emerald-600 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-emerald-700">Partnership Signed</p>
                          {dealClosedAt && (
                            <p className="text-[10px] text-emerald-600/70">
                              Closed {new Date(dealClosedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                      </div>
                      {(dealRevenue || dealRecord?.revenue) && (
                        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                          <div className="flex items-center gap-2">
                            <DollarSign size={13} className="text-emerald-600" />
                            <span className="text-xs font-medium text-foreground">Logged Revenue</span>
                          </div>
                          <span className="text-sm font-bold text-emerald-600">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
                              parseFloat(dealRevenue || String(dealRecord?.revenue || 0))
                            )}
                          </span>
                        </div>
                      )}
                      {(dealNotes || dealRecord?.notes) && (
                        <p className="text-xs text-muted-foreground leading-relaxed px-1">{dealNotes || dealRecord?.notes}</p>
                      )}
                      <button
                        onClick={handleReopenDeal}
                        className="w-full text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1"
                      >
                        Reopen deal
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {signing.state !== 'signed' ? (
                        <div className="p-3 bg-muted/40 border border-border rounded-xl">
                          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Handshake size={13} className="text-muted-foreground" />Mark as Deal / Closed is locked</p>
                          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                            It unlocks once the homeowner has signed the DocuSign agreements.{' '}
                            {signing.state === 'loading' ? 'Checking signing status…' : signing.state === 'none' ? 'No agreements have been sent yet.' : signing.state === 'sent' ? 'Agreements sent, waiting for the homeowner to open them.' : signing.state === 'viewed' ? 'The homeowner has opened the agreements but not finished signing.' : signing.state === 'declined' ? 'The homeowner declined to sign.' : 'The last envelope was voided; send new agreements.'}
                          </p>
                        </div>
                      ) : !showDealForm ? (
                        <button
                          onClick={() => setShowDealForm(true)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-xs hover:bg-emerald-700 transition-all active:scale-[0.98]"
                        >
                          <Handshake size={13} />
                          Mark as Deal / Closed
                        </button>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1 block">
                              Annual Revenue (optional)
                            </label>
                            <div className="relative">
                              <DollarSign size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                              <input
                                type="number"
                                value={dealRevenue}
                                onChange={e => setDealRevenue(e.target.value)}
                                placeholder="e.g. 48000"
                                className="w-full text-xs border border-border rounded-lg pl-7 pr-3 py-1.5 bg-card outline-none focus:ring-1 focus:ring-primary/30"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1 block">
                              Notes (optional)
                            </label>
                            <textarea
                              value={dealNotes}
                              onChange={e => setDealNotes(e.target.value)}
                              placeholder="e.g. Signed 12-month agreement, 20% management fee..."
                              rows={2}
                              className="w-full text-xs border border-border rounded-lg px-3 py-1.5 bg-card outline-none resize-none focus:ring-1 focus:ring-primary/30"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setShowDealForm(false)}
                              className="flex-1 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleMarkDealClosed}
                              disabled={savingDeal}
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors font-semibold"
                            >
                              {savingDeal ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                              {savingDeal ? 'Saving…' : 'Confirm Close'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Contact Info */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <User size={15} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">Contact</span>
                </div>
                {(lead.contactInfoRequested || lead.contactEmail || (lead.skipTraceFound && (lead.contactName || lead.ownerName || lead.contactPhone || (lead.skipTraceEmails?.length ?? 0) > 0))) ? (
                  <div className="flex flex-col gap-3">
                    {(lead.contactName || lead.ownerName) && (
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-primary">
                            {(lead.contactName || lead.ownerName || '').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{lead.contactName || lead.ownerName}</p>
                          <p className="text-[10px] text-muted-foreground">{lead.ownerName ? 'Property Owner' : 'Resident of record'}</p>
                        </div>
                      </div>
                    )}
                    {[lead.contactPhone, ...(lead.skipTracePhones ?? [])].filter((ph, i, all): ph is string => !!ph && all.indexOf(ph) === i).map(ph => (
                      <a key={ph} href={`tel:${ph}`} className="flex items-center gap-2 text-xs text-foreground hover:text-primary transition-colors">
                        <Phone size={13} className="text-muted-foreground" />
                        {ph}
                      </a>
                    ))}
                    {[lead.contactEmail, ...(lead.skipTraceEmails ?? [])].filter((em, i, all): em is string => !!em && all.indexOf(em) === i).map(em => (
                      <a key={em} href={`mailto:${em}`} className="flex items-center gap-2 text-xs text-foreground hover:text-primary transition-colors">
                        <Mail size={13} className="text-muted-foreground" />
                        {em}
                      </a>
                    ))}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin size={13} />
                      {lead.city}, {lead.state}
                    </div>
                    {lead.skipTraceFound && (
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Found by skip trace{lead.skipTraceConfidence ? ` (${lead.skipTraceConfidence.toLowerCase()} confidence)` : ''}. Confirm the person before outreach. A phone found is not text consent.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin size={13} />
                      {lead.city}, {lead.state}
                    </div>
                    <div className="flex items-start gap-2 p-3 bg-amber-500/8 border border-amber-500/20 rounded-lg">
                      <AlertCircle size={13} className="text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-foreground">Contact info available after homeowner submits estimate form</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                          To protect homeowner privacy, contact details are only revealed once the homeowner has submitted the estimate form and given consent.
                        </p>
                      </div>
                    </div>
                    {records?.ownership?.match && (
                      <div className="p-3 bg-muted/30 border border-border rounded-lg">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Potential owner match</p>
                        <p className="text-sm font-semibold text-foreground">
                          {records.ownership.match.name}
                          <span className={`ml-2 text-xs font-bold ${records.ownership.match.percent >= 85 ? 'text-green-600' : records.ownership.match.percent >= 65 ? 'text-amber-600' : 'text-red-500'}`}>{records.ownership.match.percent}% confidence</span>
                        </p>
                        <ul className="mt-1.5 space-y-0.5">
                          {(records.ownership.match.reasons as string[]).map(r => <li key={r} className="text-[11px] text-muted-foreground">• {r}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Regulation Summary */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Shield size={15} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">Regulation Summary</span>
                </div>
                {regulation ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <RegulationBadge status={regulation.status} />
                      <span className="text-xs text-muted-foreground">{regulation.city}, {regulation.state}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{regulation.summary}</p>
                    <div className="flex flex-col gap-1.5">
                      {regulation.keyRules.slice(0, 4).map((rule, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <CheckCircle size={11} className="text-primary mt-0.5 shrink-0" />
                          <span className="text-foreground/80">{rule}</span>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground">Permit Required</p>
                        <p className="text-xs font-semibold text-foreground">{regulation.permitRequired ? 'Yes' : 'No'}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground">License Fee</p>
                        <p className="text-xs font-semibold text-foreground">{regulation.licensingFee ? `$${regulation.licensingFee}/yr` : 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <AlertCircle size={20} className="text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No regulation data for {lead.city}</p>
                  </div>
                )}
              </div>

              {/* ── Ownership Records ── */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Building2 size={15} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">Ownership Records</span>
                </div>
                {(() => {
                  const o = records?.ownership;
                  const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString() : null);
                  const rows: DetailRow[] = o ? [
                    { label: 'Owner', value: o.ownerName ? `${o.ownerName}${o.verified ? ' (verified)' : ''}` : null },
                    { label: 'Match confidence', value: o.match ? `${o.match.percent}%` : null },
                    { label: 'Source', value: o.ownerSource },
                    { label: 'Verified', value: o.verified ? [o.verifiedMethod, dt(o.verifiedAt)].filter(Boolean).join(' · ') || 'Yes' : null },
                    { label: 'Ownership', value: o.ownershipStatus },
                    { label: 'Residence type', value: o.residenceType },
                    { label: 'Home age', value: o.homeAge },
                    { label: 'Est. home value', value: Number(o.homeValue) > 0 ? formatCurrency(Number(o.homeValue)) : null },
                    { label: 'Tax assessment', value: Number(o.taxAssessment) > 0 ? formatCurrency(Number(o.taxAssessment)) : null },
                    { label: 'APN', value: o.apn },
                    { label: 'County', value: o.county },
                    { label: 'Record match', value: o.recordMatch ? `${o.recordMatch.score}% · ${String(o.recordMatch.strategy).toLowerCase().replace(/_/g, ' ')}` : null },
                    { label: 'Skip trace', value: o.skipTrace ? [o.skipTrace.name, o.skipTrace.matchType && String(o.skipTrace.matchType).toLowerCase().replace(/_/g, ' '), o.skipTrace.confidence && `${String(o.skipTrace.confidence).toLowerCase()} confidence`].filter(Boolean).join(' · ') : null },
                    { label: 'Other possible', value: o.skipTrace?.alternates?.length ? o.skipTrace.alternates.join(', ') : null },
                  ] : [];
                  const registry: Array<Record<string, any>> = o?.registry ?? [];
                  if (!rows.some(r => hasValue(r.value)) && registry.length === 0) {
                    return (
                      <div className="text-center py-4">
                        <Building2 size={20} className="text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">{records ? 'No ownership records found for this address' : 'Loading ownership records…'}</p>
                      </div>
                    );
                  }
                  return (
                    <div className="flex flex-col gap-3">
                      <DetailRows rows={rows} stacked />
                      {registry.length > 0 && (
                        <div className="pt-3 border-t border-border space-y-1.5">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Short-term rental registry</p>
                          {registry.map((r, i) => (
                            <div key={i} className="text-xs text-foreground">
                              <span className="font-medium">{r.holder || 'Permit holder not listed'}</span>
                              <span className="text-muted-foreground"> · {[r.jurisdiction, r.license, r.permitId && `#${r.permitId}`, r.active === true ? 'active' : r.active === false ? 'inactive' : null].filter(Boolean).join(' · ')}</span>
                              {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary hover:underline">source</a>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* ── Market Comparables ── */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart2 size={15} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">Market Comparables</span>
                </div>
                {(() => {
                  const comps = records?.comparables ?? [];
                  if (comps.length === 0) {
                    return (
                      <div className="text-center py-4">
                        <BarChart2 size={20} className="text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">{records ? 'No comparable short-term rentals found near this address' : 'Loading comparables…'}</p>
                      </div>
                    );
                  }
                  const med = (xs: number[]) => { const v = xs.filter(x => x > 0).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 0; };
                  const mAdr = med(comps.map(c => Number(c.adr))), mOcc = med(comps.map(c => Number(c.occupancy))), mRev = med(comps.map(c => Number(c.revenue)));
                  return (
                    <div className="flex flex-col gap-3">
                      {comps.slice(0, 6).map((c, i) => (
                        <div key={i} className="p-3 bg-muted/30 rounded-lg border border-border">
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            {c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary hover:underline truncate">{c.title || `Comparable #${i + 1}`}</a> : <p className="text-xs font-medium text-foreground truncate">{c.title || `Comparable #${i + 1}`}</p>}
                            {Number(c.revenue) > 0 && <span className="text-xs font-bold text-primary shrink-0">{formatCurrency(Number(c.revenue))}/yr</span>}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                            {Number(c.beds) > 0 && <span>{c.beds} bd</span>}
                            {Number(c.baths) > 0 && <span>{c.baths} ba</span>}
                            {Number(c.adr) > 0 && <span>{formatCurrency(Number(c.adr))}/night</span>}
                            {Number(c.occupancy) > 0 && <span>{Math.round(Number(c.occupancy))}% booked</span>}
                            {Number(c.rating) > 0 && <span>{c.rating}★{Number(c.reviews) > 0 ? ` (${c.reviews})` : ''}</span>}
                            {c.miles != null && <span>{c.miles} mi away</span>}
                            <span className="ml-auto">{c.source}</span>
                          </div>
                        </div>
                      ))}
                      <div className="pt-2 border-t border-border">
                        <p className="text-[10px] text-muted-foreground">
                          Comparable median:{mAdr > 0 && <> <span className="font-medium text-foreground">{formatCurrency(mAdr)}/night</span></>}{mOcc > 0 && <> · <span className="font-medium text-foreground">{mOcc}% booked</span></>}{mRev > 0 && <> · <span className="font-medium text-foreground">{formatCurrency(mRev)}/yr</span></>}
                          {lead.estimatedADR > 0 && mAdr > 0 && <> · this home is estimated at {formatCurrency(lead.estimatedADR)}/night ({lead.estimatedADR >= mAdr ? '+' : ''}{Math.round(((lead.estimatedADR - mAdr) / mAdr) * 100)}% vs comps)</>}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* ── Task Board & Follow-up Sequence ── */}
              <LeadTaskBoard leadId={lead.id} leadName={lead.contactName || lead.address} />

              {/* Enrichment Timeline */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Zap size={15} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">Enrichment Timeline</span>
                </div>
                <div className="relative flex flex-col gap-0">
                  {enrichmentTimeline.map((event, idx) => (
                    <div key={event.id} className="flex items-start gap-3 relative">
                      {idx < enrichmentTimeline.length - 1 && (
                        <div className="absolute left-[13px] top-6 bottom-0 w-px bg-border" />
                      )}
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 ${enrichmentTypeColors[event.type]}`}>
                        <div className="w-2 h-2 rounded-full bg-current" />
                      </div>
                      <div className="flex-1 pb-4">
                        <p className="text-xs font-medium text-foreground">{event.label}</p>
                        <p className="text-[10px] text-muted-foreground">{event.detail}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{event.timestamp}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Team Notes — loads independently */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Users size={15} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">Team Notes</span>
                </div>
                <div className="mb-4">
                  <textarea
                    value={noteContent}
                    onChange={e => setNoteContent(e.target.value)}
                    placeholder="Add a team note for collaborative research..."
                    rows={3}
                    className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-muted/30 outline-none resize-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/60"
                  />
                  <button
                    onClick={handleSaveNote}
                    disabled={savingNote || !noteContent.trim()}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {savingNote ? <RefreshCw size={11} className="animate-spin" /> : <Send size={11} />}
                    Add Note
                  </button>
                </div>
                {notesLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map(i => <div key={i} className="h-12 bg-muted/50 rounded-lg animate-pulse" />)}
                  </div>
                ) : teamNotes.length === 0 ? (
                  <div className="text-center py-4">
                    <Users size={20} className="text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-[10px] text-muted-foreground">No team notes yet</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {teamNotes.map(note => (
                      <div key={note.id} className="p-3 bg-muted/30 rounded-lg border border-border">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                            <span className="text-[9px] font-bold text-primary">{note.author?.slice(0, 2).toUpperCase()}</span>
                          </div>
                          <span className="text-[10px] font-medium text-foreground">{note.author}</span>
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {new Date(note.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{note.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {lead.notes && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText size={15} className="text-primary" />
                    <span className="text-sm font-semibold text-foreground">Lead Notes</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{lead.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showSMSModal && (
        <SMSSendModal
          leadId={lead.id}
          leadName={lead.contactName || lead.address}
          recipientPhone={lead.contactPhone || ''}
          onClose={() => setShowSMSModal(false)}
          onSent={() => { reloadSecondaryData(); toast.success('SMS logged to Activity Timeline'); }}
        />
      )}
    </AppLayout>
  );
}
