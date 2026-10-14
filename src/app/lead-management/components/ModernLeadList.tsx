'use client';

import React, { memo, useState } from 'react';
import { AlertTriangle, ExternalLink, Eye, Flame, MapPin, MessageSquare, Phone, ShieldCheck, Star } from 'lucide-react';
import type { Lead, LeadStage } from '@/data/mockLeads';
import { stageOrder } from '@/data/mockLeads';
import StageBadge from '@/components/ui/StageBadge';
import { getAddressDisplayValue, getPropertyListingUrl } from '@/lib/addressUtils';
import { STAGE_LABEL, STAGE_STYLE, type StageKey } from '@/app/pipeline/types';

export interface CampaignInfo { board_stage: StageKey; last_activity: string | null; last_activity_at: string | null; reply_text: string | null; reply_intent: string | null; batch: string | null; twilio_status: string | null; human_clicks: number | null; scheduled_for: string | null }
export const campaignOf = (l: Lead) => (l as unknown as { campaign?: CampaignInfo | null }).campaign ?? null;

const ago = (iso: string | null | undefined) => { if (!iso) return ''; const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000)); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const scoreRing = (s: number) => (s >= 80 ? 'text-orange-600 border-orange-500 bg-orange-500/10' : s >= 60 ? 'text-amber-600 border-amber-500 bg-amber-500/10' : 'text-muted-foreground border-border bg-muted/40');

function monthly(l: Lead): { v: number; label: string } {
  if (l.priceType === 'sale') { if (l.estimatedMonthlyRent && l.estimatedMonthlyRent > 0) return { v: l.estimatedMonthlyRent, label: 'est. rent' }; }
  else if (l.price > 0) return { v: l.price, label: 'rent' };
  if (l.estimatedNetMonthly > 0) return { v: l.estimatedNetMonthly, label: 'est. net' };
  if (l.estimatedGrossMonthly > 0) return { v: l.estimatedGrossMonthly, label: 'est. gross' };
  return { v: 0, label: '' };
}

function campaignLine(c: CampaignInfo | null): string {
  if (!c) return '';
  if (c.reply_text) return `Replied: "${c.reply_text.slice(0, 70)}"`;
  if (c.last_activity) return c.last_activity;
  if (c.board_stage === 'queued' && c.scheduled_for) return `Scheduled ${new Date(c.scheduled_for).toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  if (c.twilio_status) return `Text ${c.twilio_status}`;
  return '';
}

function StageMenu({ lead, onSelect, disabled }: { lead: Lead; onSelect: (s: LeadStage) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button disabled={disabled} onClick={e => { e.stopPropagation(); setOpen(v => !v); }} onBlur={() => setTimeout(() => setOpen(false), 120)} aria-haspopup="listbox" aria-expanded={open} aria-label="Change CRM stage" className="disabled:opacity-60"><StageBadge stage={lead.stage} size="sm" /></button>
      {open && <div role="listbox" className="absolute z-30 left-0 top-full mt-1 w-40 bg-card border border-border rounded-lg shadow-xl overflow-hidden">{stageOrder.map(s => <button key={s} role="option" aria-selected={s === lead.stage} onMouseDown={e => { e.preventDefault(); onSelect(s); setOpen(false); }} className={`w-full text-left px-3 py-2 text-xs hover:bg-muted ${s === lead.stage ? 'font-semibold bg-muted/60' : ''}`}>{s}</button>)}</div>}
    </div>
  );
}

interface RowProps {
  lead: Lead; selected: boolean; focused: boolean; canAct: boolean; assignedTo?: string;
  onSelect: (id: string, checked: boolean) => void; onOpen: (l: Lead) => void; onPeek: (l: Lead) => void; onStage: (id: string, s: LeadStage) => void; onSMS?: (l: Lead) => void; onFocus: (id: string) => void;
}

const Row = memo(function Row({ lead, selected, focused, canAct, assignedTo, onSelect, onOpen, onPeek, onStage, onSMS, onFocus }: RowProps) {
  const x = lead as unknown as Record<string, any>;
  const { display, isIncomplete } = getAddressDisplayValue(lead.address);
  const c = campaignOf(lead); const m = monthly(lead);
  const hasPhone = !!(x.has_phone || x.verified_number || lead.contactPhone);
  const owner = lead.contactName || x.owner_name || null;
  const st = c ? STAGE_STYLE[c.board_stage] : null; const line = campaignLine(c);
  const verified = x.fully_verified || (x.verified_owner && x.verified_number);

  return (
    <div id={`lm-row-${lead.id}`} onClick={e => { if ((e.target as HTMLElement).closest('button,a,input,[role="listbox"]')) return; onFocus(lead.id); onOpen(lead); }}
      className={`group relative grid items-center gap-3 px-3 sm:px-4 py-3 border-b border-border cursor-pointer transition-colors grid-cols-[24px_44px_minmax(0,1fr)] md:grid-cols-[24px_44px_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.3fr)_88px_auto] ${selected ? 'bg-primary/5' : focused ? 'bg-muted/60' : 'hover:bg-muted/40'} ${focused ? 'ring-2 ring-inset ring-primary/40' : ''} ${!canAct ? 'opacity-60' : ''}`}>
      <input type="checkbox" checked={selected} disabled={!canAct} onChange={e => onSelect(lead.id, e.target.checked)} className="w-4 h-4 rounded accent-primary" aria-label={`Select ${display}`} />
      <div className={`w-11 h-11 rounded-full border-2 flex items-center justify-center text-sm font-bold ${scoreRing(lead.prospectScore)}`} title={`Prospect score ${lead.prospectScore}`}>{lead.prospectScore}</div>

      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">{isIncomplete && <AlertTriangle size={11} className="text-amber-500 shrink-0" />}<p className="text-sm font-semibold text-foreground truncate" title={display}>{display}</p></div>
        <p className="text-xs text-muted-foreground truncate flex items-center gap-1"><MapPin size={10} className="shrink-0" />{lead.city}, {lead.state} {lead.zip}{lead.beds ? ` · ${lead.beds} bd` : ''}{lead.baths ? ` / ${lead.baths} ba` : ''}</p>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {lead.prospectScore >= 80 && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600"><Flame size={9} />Hot</span>}
          {x.luxury && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600"><Star size={9} />Luxury</span>}
          {verified && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600"><ShieldCheck size={9} />Verified</span>}
          {lead.regulationStatus && lead.regulationStatus !== 'Unknown' && <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${lead.regulationStatus === 'Allowed' ? 'bg-emerald-500/10 text-emerald-600' : lead.regulationStatus === 'Prohibited' ? 'bg-red-500/10 text-red-600' : 'bg-amber-500/10 text-amber-600'}`}>STR {lead.regulationStatus}</span>}
        </div>
      </div>

      <div className="hidden md:block min-w-0">
        <p className="text-sm text-foreground truncate">{owner ?? <span className="text-muted-foreground">Owner not identified</span>}</p>
        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">{hasPhone ? <><Phone size={10} className="text-emerald-500" />{lead.contactPhone || 'Phone on file'}</> : <span>No phone yet</span>}</p>
        {assignedTo && <p className="text-[10px] text-muted-foreground truncate">Agent: {assignedTo}</p>}
      </div>

      <div className="hidden md:block min-w-0">
        {c && st ? <><span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${st.chip}`}>{STAGE_LABEL[c.board_stage]}</span><p className="text-xs text-muted-foreground truncate mt-0.5" title={line}>{line}{c.last_activity_at ? `${line ? ' · ' : ''}${ago(c.last_activity_at)}` : ''}</p></> : <span className="text-xs text-muted-foreground">Not in a campaign</span>}
      </div>

      <div className="hidden md:block text-right">
        {m.v > 0 ? <><p className="text-sm font-bold text-foreground tabular-nums">${Math.round(m.v).toLocaleString()}</p><p className="text-[10px] text-muted-foreground">{m.label}/mo</p></> : <span className="text-xs text-muted-foreground">No estimate</span>}
      </div>

      <div className="hidden md:flex items-center gap-1 justify-end">
        <StageMenu lead={lead} disabled={!canAct} onSelect={s => onStage(lead.id, s)} />
        <div className={`flex items-center gap-0.5 transition-opacity ${focused ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}>
          <button onClick={() => onPeek(lead)} title="Quick look (P)" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><Eye size={14} /></button>
          {hasPhone && onSMS && canAct && <button onClick={() => onSMS(lead)} title="Send a text" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><MessageSquare size={14} /></button>}
          <a href={getPropertyListingUrl(lead.listingUrl, lead.address, lead.city, lead.state, lead.zip, lead.source)} target="_blank" rel="noopener noreferrer" title="Open listing" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"><ExternalLink size={14} /></a>
        </div>
      </div>
    </div>
  );
});

export default function ModernLeadList({ leads, selectedIds, focusedId, canActOnLead, assignmentMap, onSelectAll, onSelectOne, onOpen, onPeek, onStageChange, onSendSMS, onFocus }: {
  leads: Lead[]; selectedIds: Set<string>; focusedId: string | null; canActOnLead: (l: Lead) => boolean; assignmentMap: Record<string, string>;
  onSelectAll: (checked: boolean) => void; onSelectOne: (id: string, checked: boolean) => void; onOpen: (l: Lead) => void; onPeek: (l: Lead) => void; onStageChange: (id: string, s: LeadStage) => void; onSendSMS?: (l: Lead) => void; onFocus: (id: string) => void;
}) {
  const all = leads.length > 0 && leads.every(l => selectedIds.has(l.id));
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="hidden md:grid grid-cols-[24px_44px_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.3fr)_88px_auto] gap-3 items-center px-4 py-2 border-b border-border bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <input type="checkbox" checked={all} onChange={e => onSelectAll(e.target.checked)} className="w-4 h-4 rounded accent-primary" aria-label="Select all on this page" />
        <span>Score</span><span>Property</span><span>Owner</span><span>Campaign</span><span className="text-right">Est. / mo</span><span className="text-right pr-1">Stage</span>
      </div>
      {leads.map(l => <Row key={l.id} lead={l} selected={selectedIds.has(l.id)} focused={focusedId === l.id} canAct={canActOnLead(l)} assignedTo={assignmentMap[l.id]} onSelect={onSelectOne} onOpen={onOpen} onPeek={onPeek} onStage={onStageChange} onSMS={onSendSMS} onFocus={onFocus} />)}
    </div>
  );
}
