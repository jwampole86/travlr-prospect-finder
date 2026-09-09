'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { enrichmentService, LeadEnrichment, EnrichedEmail, EnrichedPhone } from '@/lib/services/enrichmentService';
import { craigslistService, CraigslistSnapshot } from '@/lib/services/craigslistService';
import type { Lead } from '@/data/mockLeads';
import { Search, UserCheck, Phone, Mail, Building2, MapPin, ShieldAlert, ShieldCheck, AlertTriangle, CheckCircle2, Clock, DollarSign, Zap, RefreshCw, ChevronDown, ChevronUp, Ban, Info, ExternalLink, Camera } from 'lucide-react';
import { toast } from 'sonner';
import EnrichmentDiagnosticPanel from './EnrichmentDiagnosticPanel';

interface EnrichmentPanelProps {
  lead: Lead;
  onEnrichmentUpdate?: () => void;
}

function ConfidenceBadge({ confidence, verified }: { confidence: number; verified: 'Verified' | 'Unverified' }) {
  const isVerified = verified === 'Verified';
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
      isVerified
        ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :'bg-amber-500/10 text-amber-600 border-amber-500/20'
    }`}>
      {isVerified ? <ShieldCheck size={9} /> : <ShieldAlert size={9} />}
      {verified} · {confidence}%
    </span>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    stage1: { label: 'Stage 1', cls: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
    stage2: { label: 'Stage 2', cls: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
    stage3: { label: 'Skip Trace', cls: 'bg-orange-500/10 text-orange-600 border-orange-500/20' },
  };
  const s = map[stage] || { label: stage, cls: 'bg-muted text-muted-foreground border-border' };
  return (
    <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${s.cls}`}>
      {s.label}
    </span>
  );
}

function CraigslistLinkStatusBadge({ status }: { status: CraigslistSnapshot['link_status'] }) {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    'Active': { cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: <CheckCircle2 size={10} /> },
    'Stale': { cls: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: <Clock size={10} /> },
    'Reposted': { cls: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: <RefreshCw size={10} /> },
    'Snapshot Only': { cls: 'bg-muted text-muted-foreground border-border', icon: <Camera size={10} /> },
  };
  const s = map[status] || map['Stale'];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${s.cls}`}>
      {s.icon}{status}
    </span>
  );
}

export default function EnrichmentPanel({ lead, onEnrichmentUpdate }: EnrichmentPanelProps) {
  const [enrichment, setEnrichment] = useState<LeadEnrichment | null>(null);
  const [emails, setEmails] = useState<EnrichedEmail[]>([]);
  const [phones, setPhones] = useState<EnrichedPhone[]>([]);
  const [snapshot, setSnapshot] = useState<CraigslistSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningStage, setRunningStage] = useState<'stage1' | 'stage2' | 'stage2sg' | 'stage3' | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [showCostInfo, setShowCostInfo] = useState(false);

  const isCraigslist = lead.source === 'Craigslist';
  const canRunStage2 = lead.prospectScore >= 70;
  const canRunStage3 = lead.prospectScore >= 80 || lead.price >= 3000;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [enr, em, ph] = await Promise.all([
        enrichmentService.getEnrichment(lead.id),
        enrichmentService.getEmails(lead.id),
        enrichmentService.getPhones(lead.id),
      ]);
      setEnrichment(enr);
      setEmails(em);
      setPhones(ph);

      if (isCraigslist) {
        const snap = await craigslistService.getSnapshot(lead.id);
        setSnapshot(snap);
      }
    } finally {
      setLoading(false);
    }
  }, [lead.id, isCraigslist]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function runStage(stage: 'stage1' | 'stage2' | 'stage2sg' | 'stage3') {
    if (enrichment?.do_not_contact) {
      toast.error('Do Not Contact flag is set — enrichment blocked');
      return;
    }
    setRunningStage(stage);
    try {
      let result;
      if (stage === 'stage1') {
        result = await enrichmentService.runStage1(lead.id, lead.address, lead.prospectScore);
      } else if (stage === 'stage2') {
        result = await enrichmentService.runStage2(lead.id, lead.prospectScore);
      } else if (stage === 'stage2sg') {
        result = await enrichmentService.runStage2Salesgenie(lead.id, lead.prospectScore);
      } else {
        result = await enrichmentService.runStage3(lead.id, lead.prospectScore, lead.price);
      }
      if (result.success) {
        toast.success(result.message);
        await loadData();
        onEnrichmentUpdate?.();
      } else {
        toast.error(result.message);
      }
    } finally {
      setRunningStage(null);
    }
  }

  async function toggleDNC() {
    const newVal = !enrichment?.do_not_contact;
    const ok = await enrichmentService.toggleDoNotContact(lead.id, newVal);
    if (ok) {
      toast.success(newVal ? 'Do Not Contact flag set' : 'Do Not Contact flag removed');
      await loadData();
    }
  }

  async function selectEmail(emailId: string) {
    await enrichmentService.selectEmail(emailId, lead.id);
    setEmails(prev => prev.map(e => ({ ...e, is_selected: e.id === emailId })));
    toast.success('Email selected for outreach');
  }

  async function selectPhone(phoneId: string) {
    await enrichmentService.selectPhone(phoneId, lead.id);
    setPhones(prev => prev.map(p => ({ ...p, is_selected: p.id === phoneId })));
    toast.success('Phone selected for outreach');
  }

  async function checkCraigslistLink() {
    if (!snapshot?.original_url) return;
    setRunningStage('stage1');
    try {
      const status = await craigslistService.checkLinkStatus(lead.id, snapshot.original_url);
      toast.info(`Link status: ${status}`);
      await loadData();
    } finally {
      setRunningStage(null);
    }
  }

  async function attemptRematch() {
    setRunningStage('stage1');
    try {
      let result = await craigslistService.attemptRematch(lead.id);
      if (result.found) {
        toast.success(`Re-match found! Confidence: ${result.confidence}%`);
      } else {
        toast.info('No re-match found — snapshot saved as fallback');
      }
      await loadData();
    } finally {
      setRunningStage(null);
    }
  }

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 animate-pulse">
        <div className="h-4 bg-muted rounded w-32 mb-3" />
        <div className="h-3 bg-muted rounded w-full mb-2" />
        <div className="h-3 bg-muted rounded w-3/4" />
      </div>
    );
  }

  const hasStage1 = !!enrichment?.stage1_completed_at;
  const hasStage2 = !!enrichment?.stage2_completed_at;
  const hasStage3 = !!enrichment?.stage3_completed_at;
  const isDNC = enrichment?.do_not_contact ?? false;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Search size={13} className="text-primary" />
          <span className="text-xs font-semibold text-foreground">Prospect Enrichment</span>
          {enrichment?.enrichment_status && (
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
              enrichment.enrichment_status === 'Complete' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
              enrichment.enrichment_status === 'Partial'? 'bg-blue-500/10 text-blue-600 border-blue-500/20' : 'bg-muted text-muted-foreground border-border'
            }`}>
              {enrichment.enrichment_status}
            </span>
          )}
          {isDNC && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
              <Ban size={9} />DNC
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCostInfo(v => !v)}
            className="p-1 rounded hover:bg-muted transition-colors"
            title="Cost tracking"
          >
            <DollarSign size={12} className="text-muted-foreground" />
          </button>
          <button onClick={() => setExpanded(v => !v)} className="p-1 rounded hover:bg-muted transition-colors">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {!expanded ? null : (
        <div className="p-4 space-y-4">
          {/* Compliance notice */}
          <div className="flex items-start gap-2 p-2.5 bg-amber-500/5 border border-amber-500/20 rounded-lg">
            <Info size={11} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-[10px] text-amber-700 leading-relaxed">
              <strong>Compliance:</strong> Stage 2 contact data requires legal review before production use. TCPA applies to phone/SMS outreach. Do Not Contact flags must be respected.
            </p>
          </div>

          {/* DNC Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ban size={12} className={isDNC ? 'text-red-500' : 'text-muted-foreground'} />
              <span className="text-xs text-foreground">Do Not Contact</span>
            </div>
            <button
              onClick={toggleDNC}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isDNC ? 'bg-red-500' : 'bg-muted border border-border'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${isDNC ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>

          {/* Stage 1 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${hasStage1 ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground border border-border'}`}>1</div>
                <span className="text-xs font-medium text-foreground">Owner Lookup</span>
                <span className="text-[10px] text-muted-foreground">BatchData · ~$0.05</span>
              </div>
              <button
                onClick={() => runStage('stage1')}
                disabled={!!runningStage || isDNC}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-50 ${
                  hasStage1
                    ? 'bg-muted text-muted-foreground hover:bg-muted/80 border border-border'
                    : 'bg-primary text-primary-foreground hover:opacity-90'
                }`}
              >
                {runningStage === 'stage1' ? <RefreshCw size={10} className="animate-spin" /> : <UserCheck size={10} />}
                {hasStage1 ? 'Re-enrich' : 'Enrich Owner'}
              </button>
            </div>

            {hasStage1 && enrichment && (
              <div className="ml-7 p-3 bg-muted/30 rounded-lg space-y-1.5 border border-border">
                <div className="flex items-center gap-1.5">
                  <Building2 size={11} className="text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">{enrichment.owner_name || '—'}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    enrichment.ownership_type === 'Individual' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' :
                    enrichment.ownership_type === 'LLC'? 'bg-purple-500/10 text-purple-600 border-purple-500/20' : 'bg-muted text-muted-foreground border-border'
                  }`}>{enrichment.ownership_type}</span>
                </div>
                {enrichment.owner_mailing_address && (
                  <div className="flex items-start gap-1.5">
                    <MapPin size={11} className="text-muted-foreground mt-0.5 shrink-0" />
                    <span className="text-[11px] text-muted-foreground">
                      {enrichment.owner_mailing_address}, {enrichment.owner_mailing_city}, {enrichment.owner_mailing_state} {enrichment.owner_mailing_zip}
                    </span>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground/70">
                  Source: {enrichment.stage1_provider} · {enrichment.stage1_completed_at ? new Date(enrichment.stage1_completed_at).toLocaleDateString() : '—'}
                </p>
              </div>
            )}
          </div>

          {/* Stage 2 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${hasStage2 ? 'bg-emerald-500 text-white' : canRunStage2 ? 'bg-muted text-muted-foreground border border-border' : 'bg-muted/50 text-muted-foreground/50 border border-border/50'}`}>2</div>
                <span className={`text-xs font-medium ${canRunStage2 ? 'text-foreground' : 'text-muted-foreground'}`}>Contact Enrichment</span>
                {!canRunStage2 && (
                  <span className="text-[10px] text-amber-600 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                    Score &lt; 70
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {/* PDL button */}
                <button
                  onClick={() => runStage('stage2')}
                  disabled={!!runningStage || !canRunStage2 || !hasStage1 || isDNC}
                  title="People Data Labs"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-40 ${
                    hasStage2 && enrichment?.stage2_provider === 'People Data Labs' ?'bg-muted text-muted-foreground hover:bg-muted/80 border border-border'
                      : canRunStage2 && hasStage1
                      ? 'bg-purple-600 text-white hover:bg-purple-700' :'bg-muted text-muted-foreground border border-border'
                  }`}
                >
                  {runningStage === 'stage2' ? <RefreshCw size={10} className="animate-spin" /> : <Mail size={10} />}
                  PDL · $0.25
                </button>
                {/* Salesgenie button */}
                <button
                  onClick={() => runStage('stage2sg')}
                  disabled={!!runningStage || !canRunStage2 || !hasStage1 || isDNC}
                  title="Salesgenie (Data Axle)"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-40 ${
                    hasStage2 && enrichment?.stage2_provider === 'Salesgenie' ?'bg-muted text-muted-foreground hover:bg-muted/80 border border-border'
                      : canRunStage2 && hasStage1
                      ? 'bg-teal-600 text-white hover:bg-teal-700' :'bg-muted text-muted-foreground border border-border'
                  }`}
                >
                  {runningStage === 'stage2sg' ? <RefreshCw size={10} className="animate-spin" /> : <Phone size={10} />}
                  Salesgenie · $0.20
                </button>
              </div>
            </div>

            {(emails.length > 0 || phones.length > 0) && (
              <div className="ml-7 space-y-2">
                {emails.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Emails</p>
                    {emails.map(e => (
                      <div key={e.id} className={`flex items-center justify-between p-2 rounded-lg border transition-colors cursor-pointer ${e.is_selected ? 'bg-primary/5 border-primary/30' : 'bg-muted/20 border-border hover:bg-muted/40'}`}
                        onClick={() => selectEmail(e.id)}>
                        <div className="flex items-center gap-2 min-w-0">
                          <Mail size={11} className="text-muted-foreground shrink-0" />
                          <span className="text-[11px] text-foreground truncate">{e.email_address}</span>
                          <StageBadge stage={e.stage} />
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <ConfidenceBadge confidence={e.confidence} verified={e.verified_status} />
                          {e.is_selected && <CheckCircle2 size={12} className="text-primary" />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {phones.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Phones</p>
                    {phones.map(p => (
                      <div key={p.id} className={`flex items-center justify-between p-2 rounded-lg border transition-colors cursor-pointer ${p.is_selected ? 'bg-primary/5 border-primary/30' : 'bg-muted/20 border-border hover:bg-muted/40'}`}
                        onClick={() => selectPhone(p.id)}>
                        <div className="flex items-center gap-2 min-w-0">
                          <Phone size={11} className="text-muted-foreground shrink-0" />
                          <span className="text-[11px] text-foreground">{p.phone_number}</span>
                          <span className="text-[10px] text-muted-foreground capitalize">{p.phone_type}</span>
                          <StageBadge stage={p.stage} />
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <ConfidenceBadge confidence={p.confidence} verified={p.verified_status} />
                          {p.is_selected && <CheckCircle2 size={12} className="text-primary" />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stage 3 — Skip Trace (premium) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${hasStage3 ? 'bg-orange-500 text-white' : 'bg-muted text-muted-foreground border border-border'}`}>3</div>
                <span className="text-xs font-medium text-foreground">Skip Trace</span>
                <span className="text-[10px] text-orange-600 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded font-semibold">PREMIUM · ~$1.50</span>
                {!canRunStage3 && (
                  <span className="text-[10px] text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded">
                    High-value only
                  </span>
                )}
              </div>
              <button
                onClick={() => runStage('stage3')}
                disabled={!!runningStage || !canRunStage3 || isDNC}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all disabled:opacity-40 border-2 ${
                  hasStage3
                    ? 'bg-muted text-muted-foreground border-border'
                    : canRunStage3
                    ? 'bg-orange-500 text-white border-orange-600 hover:bg-orange-600' :'bg-muted text-muted-foreground border-border'
                }`}
              >
                {runningStage === 'stage3' ? <RefreshCw size={10} className="animate-spin" /> : <Zap size={10} />}
                Skip Trace
              </button>
            </div>
            {hasStage3 && enrichment?.stage3_cost && (
              <div className="ml-7 p-2 bg-orange-500/5 border border-orange-500/20 rounded-lg">
                <p className="text-[11px] text-orange-700">
                  Skip trace completed · Cost: ${enrichment.stage3_cost.toFixed(2)} · Provider: {enrichment.stage3_provider}
                </p>
              </div>
            )}
          </div>

          {/* Craigslist-specific section */}
          {isCraigslist && (
            <div className="border-t border-border pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Camera size={12} className="text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">Craigslist Link Status</span>
                  {snapshot && <CraigslistLinkStatusBadge status={snapshot.link_status} />}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={checkCraigslistLink}
                    disabled={!!runningStage}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-muted hover:bg-muted/80 text-muted-foreground border border-border transition-all disabled:opacity-50"
                  >
                    <RefreshCw size={10} className={runningStage ? 'animate-spin' : ''} />
                    Check Link
                  </button>
                  {snapshot?.link_status === 'Stale' && (
                    <button
                      onClick={attemptRematch}
                      disabled={!!runningStage}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] bg-blue-600 text-white hover:bg-blue-700 transition-all disabled:opacity-50"
                    >
                      <Search size={10} />
                      Re-match
                    </button>
                  )}
                </div>
              </div>

              {snapshot && (
                <div className="p-3 bg-muted/20 border border-border rounded-lg space-y-2">
                  {snapshot.link_status !== 'Active' && (
                    <div className="flex items-start gap-2 p-2 bg-amber-500/5 border border-amber-500/20 rounded">
                      <AlertTriangle size={11} className="text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-[10px] text-amber-700">
                        {snapshot.link_status === 'Snapshot Only'
                          ? `Original Craigslist post no longer live — showing saved listing details from ${new Date(snapshot.snapshot_date).toLocaleDateString()}`
                          : snapshot.link_status === 'Reposted'
                          ? `Listing reposted — re-match found with ${snapshot.rematch_confidence}% confidence. Verify before trusting.`
                          : 'Link may be stale — Craigslist posts expire after ~30-45 days'}
                      </p>
                    </div>
                  )}

                  {snapshot.title && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Saved Snapshot</p>
                      <p className="text-xs font-medium text-foreground">{snapshot.title}</p>
                      {snapshot.description && (
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-3">{snapshot.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        {snapshot.price && <span>${snapshot.price.toLocaleString()}/mo</span>}
                        {snapshot.beds && <span>{snapshot.beds}bd</span>}
                        {snapshot.baths && <span>{snapshot.baths}ba</span>}
                        {snapshot.sqft && <span>{snapshot.sqft} sqft</span>}
                      </div>
                    </div>
                  )}

                  {snapshot.rematch_url && snapshot.link_status === 'Reposted' && (
                    <a href={snapshot.rematch_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                      <ExternalLink size={10} />View re-matched listing
                    </a>
                  )}

                  {snapshot.last_link_check_at && (
                    <p className="text-[10px] text-muted-foreground/60">
                      Last checked: {new Date(snapshot.last_link_check_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}

              {!snapshot && (
                <div className="p-3 bg-muted/20 border border-border rounded-lg">
                  <p className="text-[11px] text-muted-foreground">No snapshot captured yet. Snapshots are saved automatically at import time for Craigslist leads.</p>
                </div>
              )}
            </div>
          )}

          {/* Cost info panel */}
          {showCostInfo && (
            <div className="border-t border-border pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <DollarSign size={10} />Cost Reference
              </p>
              <div className="space-y-1">
                {[
                  { stage: 'Stage 1 (BatchData)', cost: '$0.05/lookup', note: 'Runs on every new lead' },
                  { stage: 'Stage 2 (PDL)', cost: '$0.25/lookup', note: 'Score ≥ 70 only' },
                  { stage: 'Stage 2 (Salesgenie)', cost: '$0.20/lookup', note: 'Score ≥ 70 only' },
                  { stage: 'Stage 3 (Skip Trace)', cost: '$1.50/lookup', note: 'Manual, high-value only' },
                ].map(item => (
                  <div key={item.stage} className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{item.stage}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-foreground">{item.cost}</span>
                      <span className="text-muted-foreground/60">{item.note}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-2">
                Results cached for 90 days. Re-enriching a cached lead does not re-charge.
              </p>
            </div>
          )}

          {/* Last enriched */}
          {enrichment?.last_enriched_at && (
            <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
              <Clock size={9} />
              Last enriched: {new Date(enrichment.last_enriched_at).toLocaleDateString()}
              {enrichment.cache_expires_at && ` · Cache expires: ${new Date(enrichment.cache_expires_at).toLocaleDateString()}`}
            </p>
          )}
        </div>
      )}

      {/* Diagnostic panel — always shown below enrichment panel */}
      <div className="border-t border-border">
        <EnrichmentDiagnosticPanel leadId={lead.id} leadAddress={lead.address} />
      </div>
    </div>
  );
}
