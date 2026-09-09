'use client';

import React, { useState } from 'react';
import type { Lead } from '@/data/mockLeads';
import type { RegulationRule } from '@/data/regulations';
import RegulationBadge from '@/components/ui/RegulationBadge';
import StageBadge from '@/components/ui/StageBadge';
import ProspectScoreBar from '@/components/ui/ProspectScoreBar';
import SMSSendModal from '@/app/lead-profile/components/SMSSendModal';
import {
  X,
  ExternalLink,
  Phone,
  User,
  DollarSign,
  BarChart2,
  MessageSquare,
  CheckCircle,
  AlertTriangle,
  Info,
  Calendar,
  Home,
} from 'lucide-react';
import { toast } from 'sonner';

interface MapDetailPanelProps {
  lead: Lead;
  regulation: RegulationRule | null;
  onClose: () => void;
  onOpenFullDetail?: () => void;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

const outreachTemplate = (lead: Lead) =>
  `Hi${lead.contactName ? ` ${lead.contactName.split(' ')[0]}` : ''},

I came across your listing at ${lead.address} and I'm interested in discussing a long-term lease arrangement. I manage short-term rental properties in the ${lead.city} area and would love to learn more.

Would you be open to a quick call this week?

Best,
Jordan Reeves
TRAVLR Properties
720-555-0100`;

export default function MapDetailPanel({ lead, regulation, onClose, onOpenFullDetail }: MapDetailPanelProps) {
  const [tab, setTab] = useState<'overview' | 'regulation' | 'outreach'>('overview');
  const [copied, setCopied] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);

  function copyTemplate() {
    navigator.clipboard.writeText(outreachTemplate(lead)).then(() => {
      setCopied(true);
      toast.success('Outreach message copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="w-80 shrink-0 border-l border-border bg-card flex flex-col overflow-hidden slide-in-right">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-border">
        <div className="min-w-0 flex-1 pr-2">
          <p className="text-sm font-semibold text-foreground truncate">{lead.address}</p>
          <p className="text-xs text-muted-foreground">{lead.city}, {lead.state} {lead.zip}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <StageBadge stage={lead.stage} size="sm" />
            <RegulationBadge status={lead.regulationStatus} size="sm" />
          </div>
          {onOpenFullDetail && (
            <button onClick={onOpenFullDetail}
              className="mt-2 text-[11px] text-primary hover:underline font-medium flex items-center gap-1">
              <ExternalLink size={10} />Open full detail panel
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0"
          aria-label="Close detail panel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['overview', 'regulation', 'outreach'] as const).map((t) => (
          <button
            key={`detail-tab-${t}`}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-medium transition-all duration-150 ${
              tab === t
                ? 'text-primary border-b-2 border-primary' :'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Overview tab */}
        {tab === 'overview' && (
          <div className="p-4 space-y-4">
            {/* Score */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prospect Score</span>
              </div>
              <ProspectScoreBar score={lead.prospectScore} />
            </div>

            {/* Key details */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border">
                <p className="text-[10px] text-muted-foreground mb-0.5">Beds/Baths</p>
                <p className="text-sm font-semibold font-mono-data text-foreground">{lead.beds}bd / {lead.baths}ba</p>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border">
                <p className="text-[10px] text-muted-foreground mb-0.5">Price</p>
                <p className="text-sm font-semibold font-mono-data text-foreground">{formatCurrency(lead.price)}/mo</p>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border">
                <p className="text-[10px] text-muted-foreground mb-0.5">Days on Market</p>
                <p className={`text-sm font-semibold font-mono-data ${lead.daysOnMarket > 30 ? 'text-warning' : 'text-foreground'}`}>
                  {lead.daysOnMarket}d
                </p>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/40 border border-border">
                <p className="text-[10px] text-muted-foreground mb-0.5">Source</p>
                <p className="text-xs font-medium text-foreground truncate">{lead.source}</p>
              </div>
            </div>

            {/* Revenue estimates */}
            <div className="p-3 rounded-lg bg-success-bg border border-success/30 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-success/80 mb-2">Revenue Estimate</p>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">ADR</span>
                <span className="font-mono-data font-semibold text-foreground">{formatCurrency(lead.estimatedADR)}/night</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Occupancy</span>
                <span className="font-mono-data font-semibold text-foreground">{lead.estimatedOccupancy}%</span>
              </div>
              <div className="flex justify-between text-xs border-t border-success/20 pt-1.5 mt-1">
                <span className="text-muted-foreground">Gross/mo</span>
                <span className="font-mono-data font-semibold text-foreground">{formatCurrency(lead.estimatedGrossMonthly)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <div className="flex items-center gap-1">
                  <DollarSign size={11} className="text-success" />
                  <span className="font-semibold text-foreground">Net/mo</span>
                </div>
                <span className="font-mono-data font-bold text-success text-sm">{formatCurrency(lead.estimatedNetMonthly)}</span>
              </div>
            </div>

            {/* Contact */}
            {(lead.contactName || lead.contactPhone) && (
              <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Contact</p>
                {lead.contactName && (
                  <div className="flex items-center gap-2 text-xs">
                    <User size={12} className="text-muted-foreground shrink-0" />
                    <span className="text-foreground">{lead.contactName}</span>
                  </div>
                )}
                {lead.contactPhone && (
                  <div className="flex items-center gap-2 text-xs">
                    <Phone size={12} className="text-muted-foreground shrink-0" />
                    <span className="text-foreground font-mono-data">{lead.contactPhone}</span>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            {lead.notes && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Notes</p>
                <p className="text-xs text-muted-foreground leading-relaxed bg-muted/30 p-2.5 rounded-lg border border-border">
                  {lead.notes}
                </p>
              </div>
            )}

            {/* Tags */}
            {lead.tags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {lead.tags.map((tag) => (
                  <span
                    key={`dtag-${lead.id}-${tag}`}
                    className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full border border-border"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Listing link */}
            {lead.listingUrl && (
              <a
                href={lead.listingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <ExternalLink size={12} />
                View original listing
              </a>
            )}
          </div>
        )}

        {/* Regulation tab */}
        {tab === 'regulation' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <RegulationBadge status={lead.regulationStatus} />
              <span className="text-sm font-semibold text-foreground">{lead.city} STR Rules</span>
            </div>

            {regulation ? (
              <>
                <p className="text-xs text-muted-foreground leading-relaxed">{regulation.summary}</p>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg bg-muted/40 border border-border">
                    <div className="flex items-center gap-1 mb-1">
                      <Home size={10} className="text-muted-foreground" />
                      <p className="text-[10px] text-muted-foreground">Permit</p>
                    </div>
                    <p className="text-xs font-semibold text-foreground">
                      {regulation.permitRequired ? 'Required' : 'Not required'}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/40 border border-border">
                    <div className="flex items-center gap-1 mb-1">
                      <DollarSign size={10} className="text-muted-foreground" />
                      <p className="text-[10px] text-muted-foreground">License Fee</p>
                    </div>
                    <p className="text-xs font-semibold font-mono-data text-foreground">
                      {regulation.licensingFee ? `$${regulation.licensingFee}/yr` : 'N/A'}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/40 border border-border">
                    <p className="text-[10px] text-muted-foreground mb-1">Primary only?</p>
                    <p className="text-xs font-semibold text-foreground">
                      {regulation.primaryResidenceOnly ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/40 border border-border">
                    <p className="text-[10px] text-muted-foreground mb-1">Night cap</p>
                    <p className="text-xs font-semibold text-foreground">
                      {regulation.nightCap ? `${regulation.nightCap} nights` : 'None'}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Key Rules</p>
                  <ul className="space-y-1.5">
                    {regulation.keyRules.map((rule, i) => (
                      <li key={`map-rule-${lead.id}-${i + 1}`} className="flex items-start gap-2 text-xs text-foreground">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        {rule}
                      </li>
                    ))}
                  </ul>
                </div>

                {regulation.sources.map((src, i) => (
                  <a
                    key={`map-src-${lead.id}-${i + 1}`}
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary hover:underline truncate"
                  >
                    <ExternalLink size={10} />
                    Official source
                  </a>
                ))}

                <p className="text-[10px] text-muted-foreground">Updated: {regulation.lastUpdated}</p>
              </>
            ) : (
              <div className="p-4 rounded-lg bg-warning-bg border border-warning/30 text-center">
                <AlertTriangle size={20} className="text-warning mx-auto mb-2" />
                <p className="text-sm font-semibold text-foreground">Regulation data not available</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {lead.city} has not been added to the regulation database yet. Research manually before proceeding.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Outreach tab */}
        {tab === 'outreach' && (
          <div className="p-4 space-y-4">
            <div className="p-3 rounded-lg bg-info-bg border border-info-border">
              <div className="flex items-center gap-1.5 mb-1">
                <Info size={12} className="text-info" />
                <span className="text-xs font-semibold text-info">Outreach Template</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Personalized with contact name and address. Copy and send via email or SMS.
              </p>
            </div>

            <div className="relative">
              <pre className="text-xs text-foreground bg-muted/30 border border-border rounded-lg p-3 whitespace-pre-wrap leading-relaxed font-sans">
                {outreachTemplate(lead)}
              </pre>
              <button
                onClick={copyTemplate}
                className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded transition-all ${
                  copied
                    ? 'bg-success text-white' :'bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {copied ? <CheckCircle size={11} /> : <MessageSquare size={11} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            {/* Mark as contacted */}
            <button
              onClick={() => toast.success(`${lead.address} marked as Contacted`, { description: 'Stage updated.' })}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-all active:scale-95"
            >
              <CheckCircle size={14} />
              Mark as Contacted
            </button>

            <div className="p-3 rounded-lg bg-muted/40 border border-border">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Log a Note</p>
              <textarea
                placeholder="Add a note about this outreach attempt…"
                className="w-full text-xs border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground p-2.5 focus:outline-none focus:ring-2 focus:ring-ring/30 resize-none"
                rows={3}
                aria-label="Outreach note"
              />
              <button
                onClick={() => toast.success('Note saved')}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-md hover:bg-muted transition-all"
              >
                <Calendar size={11} />
                Save Note
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick actions footer */}
      <div className="px-4 py-3 border-t border-border flex gap-2">
        <button
          onClick={() => setSmsOpen(true)}
          className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-blue-500/10 text-blue-600 border border-blue-200 rounded-md hover:bg-blue-500/20 transition-all"
          title="Send SMS to prospect"
        >
          <MessageSquare size={12} />
          Send SMS
        </button>
        <a
          href="/lead-management"
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-md hover:bg-muted transition-all"
        >
          <BarChart2 size={12} />
          Open in Leads
        </a>
        {lead.listingUrl && (
          <a
            href={lead.listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-md hover:bg-muted transition-all"
          >
            <ExternalLink size={12} />
            Listing
          </a>
        )}
      </div>

      {smsOpen && (
        <SMSSendModal
          leadId={lead.id}
          leadName={lead.contactName || lead.address}
          recipientPhone={lead.contactPhone || ''}
          leadAddress={lead.address}
          onClose={() => setSmsOpen(false)}
          onSent={() => setSmsOpen(false)}
        />
      )}
    </div>
  );
}