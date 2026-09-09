'use client';

import React, { useState } from 'react';
import type { LeadStage } from '@/data/mockLeads';
import { stageOrder } from '@/data/mockLeads';
import { X, Trash2, Tag, PlusCircle, Download, ChevronDown, UserCheck, Mail, Zap, GitBranch, RefreshCw, MapPin, MessageSquare, UserPlus, Archive, ShieldCheck, Filter } from 'lucide-react';

interface BulkActionBarProps {
  count: number;
  onDelete: () => void;
  onStageChange: (stage: LeadStage) => void;
  onDeselect: () => void;
  onAddToList: () => void;
  onExport: (format: 'csv' | 'json' | 'crm') => void;
  onReassign: () => void;
  onAssignAgentZone?: () => void;
  onMassEmail?: () => void;
  onMassEnrich?: () => void;
  onAssignSequence?: () => void;
  onReScore?: () => void;
  onRetagPortfolio?: () => void;
  onBulkSMS?: () => void;
  onArchive?: () => void;
  onTriggerReValidation?: () => void;
  onExportFilteredBatch?: () => void;
  onRetryEnrichment?: () => void;
  massEnriching?: boolean;
  reScoring?: boolean;
  reValidating?: boolean;
}

export default function BulkActionBar({
  count, onDelete, onStageChange, onDeselect, onAddToList, onExport, onReassign,
  onAssignAgentZone, onMassEmail, onMassEnrich, onAssignSequence, onReScore,
  onRetagPortfolio, onBulkSMS, onArchive, onTriggerReValidation, onExportFilteredBatch,
  onRetryEnrichment, massEnriching, reScoring, reValidating
}: BulkActionBarProps) {
  const [stageDropOpen, setStageDropOpen] = useState(false);
  const [exportDropOpen, setExportDropOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 mb-3 bg-primary text-primary-foreground rounded-lg shadow-lg fade-in flex-wrap">
      <span className="text-sm font-semibold">{count} selected</span>
      <div className="h-4 w-px bg-primary-foreground/30" />

      {/* Stage change */}
      <div className="relative">
        <button
          onClick={() => { setStageDropOpen((v) => !v); setExportDropOpen(false); }}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-white/15 hover:bg-white/25 rounded transition-all"
        >
          <Tag size={12} />
          Change Stage
        </button>
        {stageDropOpen && (
          <div className="absolute left-0 top-full mt-1 w-44 bg-card border border-border rounded-lg shadow-xl z-30 fade-in overflow-hidden">
            {stageOrder.map((stage) => (
              <button
                key={`bulk-stage-${stage}`}
                onClick={() => { onStageChange(stage); setStageDropOpen(false); }}
                className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-muted transition-colors"
              >
                {stage}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Reassign */}
      <button
        onClick={onReassign}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-white/20 hover:bg-white/35 border border-white/30 rounded transition-all"
      >
        <UserCheck size={12} />
        Reassign
      </button>

      {/* Assign to Agent & Zone */}
      {onAssignAgentZone && (
        <button
          onClick={onAssignAgentZone}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-indigo-500/30 hover:bg-indigo-500/50 border border-indigo-300/30 rounded transition-all"
          title="Assign selected leads to a specific agent and portfolio zone"
        >
          <UserPlus size={12} />
          Assign to Agent &amp; Zone
        </button>
      )}

      {/* Archive */}
      {onArchive && (
        <button
          onClick={onArchive}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-orange-500/25 hover:bg-orange-500/45 border border-orange-300/30 rounded transition-all"
          title="Archive selected leads — removes from active queue, preserves data"
        >
          <Archive size={12} />
          Archive
        </button>
      )}

      {/* Trigger Re-Validation */}
      {onTriggerReValidation && (
        <button
          onClick={onTriggerReValidation}
          disabled={reValidating}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-cyan-500/25 hover:bg-cyan-500/45 border border-cyan-300/30 rounded transition-all disabled:opacity-50"
          title="Re-run Anthropic enrichment validation on selected leads"
        >
          {reValidating ? (
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          ) : (
            <ShieldCheck size={12} />
          )}
          {reValidating ? 'Validating…' : 'Re-Validate'}
        </button>
      )}

      {/* Assign to Sequence */}
      {onAssignSequence && (
        <button
          onClick={onAssignSequence}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-violet-500/30 hover:bg-violet-500/50 border border-violet-300/30 rounded transition-all"
        >
          <GitBranch size={12} />
          Assign Sequence
        </button>
      )}

      {/* Bulk SMS Dispatch */}
      {onBulkSMS && (
        <button
          onClick={onBulkSMS}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-green-500/30 hover:bg-green-500/50 border border-green-300/30 rounded transition-all"
          title="Dispatch SMS to filtered cohort"
        >
          <MessageSquare size={12} />
          Bulk SMS
        </button>
      )}

      {/* Re-Score Selected */}
      {onReScore && (
        <button
          onClick={onReScore}
          disabled={reScoring}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-amber-500/25 hover:bg-amber-500/45 border border-amber-300/30 rounded transition-all disabled:opacity-50"
          title="Recalculate prospect scores for selected leads"
        >
          {reScoring ? (
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          ) : (
            <RefreshCw size={12} />
          )}
          {reScoring ? 'Re-Scoring…' : 'Re-Score Selected'}
        </button>
      )}

      {/* Re-tag Portfolio */}
      {onRetagPortfolio && (
        <button
          onClick={onRetagPortfolio}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-teal-500/25 hover:bg-teal-500/45 border border-teal-300/30 rounded transition-all"
          title="Move selected leads to a different portfolio"
        >
          <MapPin size={12} />
          Re-tag Portfolio
        </button>
      )}

      {/* Mass Enrich */}
      {onMassEnrich && (
        <button
          onClick={onMassEnrich}
          disabled={massEnriching}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-blue-500/30 hover:bg-blue-500/50 border border-blue-300/30 rounded transition-all disabled:opacity-50"
        >
          {massEnriching ? (
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          ) : (
            <Zap size={12} />
          )}
          {massEnriching ? 'Enriching…' : 'Mass Enrich'}
        </button>
      )}

      {/* Mass Email */}
      {onMassEmail && (
        <button
          onClick={onMassEmail}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-green-500/20 hover:bg-green-500/35 border border-green-300/30 rounded transition-all"
        >
          <Mail size={12} />
          Mass Email
        </button>
      )}

      {/* Add To List */}
      <button
        onClick={onAddToList}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-white/15 hover:bg-white/25 rounded transition-all"
      >
        <PlusCircle size={12} />
        Add To List
      </button>

      {/* Export Filtered Batch */}
      {onExportFilteredBatch && (
        <button
          onClick={onExportFilteredBatch}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-white/20 hover:bg-white/35 border border-white/30 rounded transition-all"
          title="Export entire filtered batch (not just selected rows)"
        >
          <Filter size={12} />
          Export Filtered
        </button>
      )}

      {/* Export */}
      <div className="relative">
        <button
          onClick={() => { setExportDropOpen((v) => !v); setStageDropOpen(false); }}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-white/15 hover:bg-white/25 rounded transition-all"
        >
          <Download size={12} />
          Export
          <ChevronDown size={10} className={`transition-transform ${exportDropOpen ? 'rotate-180' : ''}`} />
        </button>
        {exportDropOpen && (
          <div className="absolute left-0 top-full mt-1 w-44 bg-card border border-border rounded-lg shadow-xl z-30 fade-in overflow-hidden">
            <button
              onClick={() => { onExport('csv'); setExportDropOpen(false); }}
              className="w-full text-left px-3 py-2.5 text-xs text-foreground hover:bg-muted transition-colors"
            >
              <p className="font-medium">Export as CSV</p>
              <p className="text-[10px] text-muted-foreground">Spreadsheet-ready format</p>
            </button>
            <button
              onClick={() => { onExport('json'); setExportDropOpen(false); }}
              className="w-full text-left px-3 py-2.5 text-xs text-foreground hover:bg-muted transition-colors border-t border-border"
            >
              <p className="font-medium">Export as JSON</p>
              <p className="text-[10px] text-muted-foreground">Full data with all fields</p>
            </button>
            <button
              onClick={() => { onExport('crm'); setExportDropOpen(false); }}
              className="w-full text-left px-3 py-2.5 text-xs text-foreground hover:bg-muted transition-colors border-t border-border"
            >
              <p className="font-medium">Export CRM-Ready</p>
              <p className="text-[10px] text-muted-foreground">HubSpot / Salesforce format</p>
            </button>
          </div>
        )}
      </div>

      <button
        onClick={onDelete}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-white/15 hover:bg-danger/30 rounded transition-all"
      >
        <Trash2 size={12} />
        Delete
      </button>

      <button
        onClick={onDeselect}
        className="ml-auto p-1 rounded hover:bg-white/15 transition-all"
        title="Deselect all"
      >
        <X size={14} />
      </button>
    </div>
  );
}