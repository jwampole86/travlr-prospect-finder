'use client';

import React, { useState } from 'react';
import type { EmailTemplate } from '../page';
import { CADENCE_STEPS, getCadenceStepLabel, sortByCadence } from '@/lib/cadenceSteps';
import { Mail, Edit3, Trash2, Plus, Tag, Clock, Search, FileText } from 'lucide-react';

interface Props {
  templates: EmailTemplate[];
  loading: boolean;
  onEdit: (tpl: EmailTemplate) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onRefreshDefaults: () => void;
}

const categoryColors: Record<string, string> = {
  initial_outreach: 'bg-blue-500/10 text-blue-600 border-blue-200',
  follow_up_1: 'bg-amber-500/10 text-amber-600 border-amber-200',
  check_in: 'bg-cyan-500/10 text-cyan-600 border-cyan-200',
  proposal_introduction: 'bg-purple-500/10 text-purple-600 border-purple-200',
  closing: 'bg-green-500/10 text-green-600 border-green-200',
  // Legacy
  outreach: 'bg-blue-500/10 text-blue-600 border-blue-200',
  follow_up: 'bg-amber-500/10 text-amber-600 border-amber-200',
  proposal: 'bg-purple-500/10 text-purple-600 border-purple-200',
};

function getBlockCount(body: string): number {
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) return parsed.length;
  } catch { /* */ }
  return 1;
}

function getPreviewText(body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) {
      const textBlock = parsed.find((b: { type: string; content: string }) => b.type === 'text' || b.type === 'heading');
      return textBlock?.content?.slice(0, 120) || '';
    }
  } catch { /* */ }
  return body?.slice(0, 120) || '';
}

function getCadenceStep(category: string): number {
  const step = CADENCE_STEPS.find(s => s.category === category);
  return step?.step ?? 0;
}

export default function EmailTemplateList({ templates, loading, onEdit, onDelete, onNew, onRefreshDefaults }: Props) {
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const sorted = sortByCadence(templates);

  const filtered = sorted.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.subject.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === 'all' || t.category === filterCat;
    return matchSearch && matchCat;
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Cadence order legend */}
      <div className="px-4 sm:px-6 py-3 border-b border-border bg-muted/20 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">5-Step Cadence Order</p>
        <div className="flex flex-wrap gap-2">
          {CADENCE_STEPS.map((step) => (
            <div key={step.category} className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                {step.step}
              </span>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">{step.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3 border-b border-border bg-card/50 shrink-0">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-lg bg-card outline-none focus:ring-1 focus:ring-primary/30"
            aria-label="Search templates"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => setFilterCat('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all min-h-[32px] ${filterCat === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
          >
            All
          </button>
          {CADENCE_STEPS.map(step => (
            <button
              key={step.category}
              onClick={() => setFilterCat(step.category)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all min-h-[32px] ${filterCat === step.category ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            >
              {step.step}. {step.label.split(' ')[0]}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} template{filtered.length !== 1 ? 's' : ''}</span>
        <button
          onClick={onRefreshDefaults}
          className="px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-foreground hover:bg-muted transition-colors min-h-[32px]"
        >
          Refresh Defaults
        </button>
      </div>

      {/* Template grid */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-40 bg-muted/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <FileText size={28} className="text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">No templates yet</p>
            <p className="text-xs text-muted-foreground mb-4">Create templates following the 5-step cadence order</p>
            <button
              onClick={onNew}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors min-h-[44px]"
            >
              <Plus size={14} />
              Create Template
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(tpl => {
              const stepNum = getCadenceStep(tpl.category);
              return (
                <div
                  key={tpl.id}
                  className="group relative bg-card border border-border rounded-xl p-4 sm:p-5 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer"
                  onClick={() => onEdit(tpl)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onEdit(tpl)}
                  aria-label={`Edit template: ${tpl.name}`}
                >
                  {/* Step number + Category badge */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {stepNum > 0 && (
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">
                          {stepNum}
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${categoryColors[tpl.category] || 'bg-muted text-muted-foreground border-border'}`}>
                        <Tag size={9} />
                        {getCadenceStepLabel(tpl.category)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); onEdit(tpl); }}
                        className="p-1.5 rounded-lg hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors min-h-[36px] flex items-center"
                        aria-label={`Edit ${tpl.name}`}
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteConfirm(tpl.id); }}
                        className="p-1.5 rounded-lg hover:bg-danger/10 hover:text-danger text-muted-foreground transition-colors min-h-[36px] flex items-center"
                        aria-label={`Delete ${tpl.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Name */}
                  <h3 className="text-sm font-semibold text-foreground mb-1 truncate">{tpl.name}</h3>

                  {/* Subject */}
                  <p className="text-xs text-muted-foreground mb-2 truncate">
                    <span className="font-medium">Subject:</span> {tpl.subject || '(no subject)'}
                  </p>

                  {/* Preview */}
                  <p className="text-xs text-muted-foreground/70 line-clamp-2 leading-relaxed">
                    {getPreviewText(tpl.body) || 'No content'}
                  </p>

                  {/* Footer */}
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Mail size={10} />
                      <span>{getBlockCount(tpl.body)} block{getBlockCount(tpl.body) !== 1 ? 's' : ''}</span>
                    </div>
                    {tpl.created_at && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
                        <Clock size={10} />
                        <span>{new Date(tpl.created_at).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>

                  {/* Delete confirm overlay */}
                  {deleteConfirm === tpl.id && (
                    <div
                      className="absolute inset-0 bg-card/95 rounded-xl flex flex-col items-center justify-center gap-3 z-10 p-4"
                      onClick={e => e.stopPropagation()}
                    >
                      <p className="text-sm font-medium text-foreground text-center">Delete &ldquo;{tpl.name}&rdquo;?</p>
                      <p className="text-xs text-muted-foreground text-center">This cannot be undone.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-3 py-2 text-xs border border-border rounded-lg hover:bg-muted transition-colors min-h-[40px]"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => { onDelete(tpl.id); setDeleteConfirm(null); }}
                          className="px-3 py-2 text-xs bg-danger text-white rounded-lg hover:bg-danger/90 transition-colors min-h-[40px]"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
