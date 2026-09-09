'use client';

import React, { useState } from 'react';
import { X, GitMerge, Info, Star, FileText, Zap, CheckCircle } from 'lucide-react';
import type { Lead } from '@/data/mockLeads';

interface DuplicateMergeModalProps {
  group: { leads: Lead[]; matchReason: string; confidence: 'high' | 'medium' | 'low' };
  onMerge: (primaryId: string, mergeIds: string[]) => void;
  onDismiss: () => void;
  onClose: () => void;
}

const CONFIDENCE_STYLES = {
  high: 'bg-red-500/10 text-red-500 border-red-500/20',
  medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  low: 'bg-muted text-muted-foreground border-border',
};

export default function DuplicateMergeModal({ group, onMerge, onDismiss, onClose }: DuplicateMergeModalProps) {
  const [primaryId, setPrimaryId] = useState(group.leads[0].id);

  const primary = group.leads.find(l => l.id === primaryId)!;
  const mergeIds = group.leads.filter(l => l.id !== primaryId).map(l => l.id);

  const mergedScore = Math.max(...group.leads.map(l => l.score ?? 0));
  const mergedNotes = group.leads.flatMap(l => (l as any).notes ? [(l as any).notes] : []).join(' | ');
  const mergedSources = [...new Set(group.leads.map(l => l.source))].join(', ');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <GitMerge size={18} className="text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Merge Duplicate Leads</h3>
              <p className="text-xs text-muted-foreground">Select the primary record to keep</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold capitalize ${CONFIDENCE_STYLES[group.confidence]}`}>
              {group.confidence} confidence
            </span>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X size={15} className="text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Info banner */}
          <div className="flex items-start gap-2 p-3 bg-info/5 border border-info/20 rounded-lg">
            <Info size={13} className="text-info mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Match reason:</strong> {group.matchReason}. The primary record is kept. Scores, notes, and enrichment from all duplicates are preserved and merged into the primary.
            </p>
          </div>

          {/* Lead selection */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Choose Primary Record</p>
            {group.leads.map(lead => (
              <label
                key={lead.id}
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  primaryId === lead.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'
                }`}
              >
                <input
                  type="radio"
                  name="primary"
                  value={lead.id}
                  checked={primaryId === lead.id}
                  onChange={() => setPrimaryId(lead.id)}
                  className="mt-0.5 accent-primary"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground truncate">{lead.address}</span>
                    {primaryId === lead.id && (
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold">PRIMARY</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{lead.city}, {lead.state} {lead.zip}</p>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Star size={10} className="text-amber-500" />
                      Score: <strong className="text-foreground">{lead.score ?? 'N/A'}</strong>
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Zap size={10} className="text-violet-500" />
                      Source: <strong className="text-foreground">{lead.source}</strong>
                    </span>
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      Stage: <strong className="text-foreground capitalize">{lead.stage}</strong>
                    </span>
                    {(lead as any).ownerName && (
                      <span className="text-[11px] text-muted-foreground">
                        Owner: <strong className="text-foreground">{(lead as any).ownerName}</strong>
                      </span>
                    )}
                  </div>
                </div>
              </label>
            ))}
          </div>

          {/* Merge preview */}
          <div className="bg-muted/40 border border-border rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Merge Preview — What Will Be Preserved</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-start gap-2">
                <Star size={13} className="text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold text-foreground">Best Score</p>
                  <p className="text-xs text-muted-foreground">{mergedScore} (highest across duplicates)</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <FileText size={13} className="text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold text-foreground">Notes</p>
                  <p className="text-xs text-muted-foreground truncate">{mergedNotes || 'No notes to merge'}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Zap size={13} className="text-violet-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold text-foreground">Sources</p>
                  <p className="text-xs text-muted-foreground">{mergedSources}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              <CheckCircle size={12} className="text-emerald-500" />
              <p className="text-[11px] text-muted-foreground">Enrichment data, outreach history, and pipeline stage will be preserved from the primary record.</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
          <button
            onClick={onDismiss}
            className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors"
          >
            Not Duplicates — Dismiss
          </button>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-colors">
              Cancel
            </button>
            <button
              onClick={() => onMerge(primaryId, mergeIds)}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              <GitMerge size={13} />
              Merge {mergeIds.length} Duplicate{mergeIds.length > 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
