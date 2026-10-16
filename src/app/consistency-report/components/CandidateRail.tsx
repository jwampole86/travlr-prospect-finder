'use client';

import { FileText, Search } from 'lucide-react';
import { EmptyState, StatusPill, inputClass } from '@/components/ops';
import type { CandidateListItem } from '../types';

function humanize(value?: string | null) {
  return value ? value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : 'Unknown';
}

function relativeDate(value?: string | null) {
  if (!value) return 'No interview yet';
  const date = new Date(value);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const day = 86_400_000;
  if (abs < day) return 'Today';
  const days = Math.round(abs / day);
  return diff < 0 ? `${days}d ago` : `In ${days}d`;
}

export function CandidateRail({
  candidates,
  loading,
  selectedId,
  search,
  onSearch,
  onSelect,
}: {
  candidates: CandidateListItem[];
  loading: boolean;
  selectedId: string;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (value: string) => void;
}) {
  const filtered = candidates.filter((candidate) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [candidate.full_name, candidate.current_title, candidate.current_company, candidate.interview_priority]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          className={`${inputClass} pl-9`}
          placeholder="Search candidates"
          aria-label="Search candidates"
        />
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-2xl border border-border bg-muted/40" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={FileText} title="No candidates match" hint="Try a different name, role, or priority filter." />
        ) : (
          filtered.map((candidate) => {
            const isSelected = candidate.id === selectedId;
            return (
              <button
                key={candidate.id}
                onClick={() => onSelect(candidate.id)}
                className={`w-full rounded-2xl border p-4 text-left transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/40'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {candidate.candidate_rank ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">#{candidate.candidate_rank}</span>
                      ) : null}
                      <h3 className="text-sm font-semibold text-foreground">{candidate.full_name}</h3>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {candidate.current_title || candidate.current_company || humanize(candidate.interview_priority)}
                    </p>
                  </div>
                  <StatusPill tone={candidate.consistency_report_status === 'COMPLETED' ? 'success' : candidate.consistency_report_status === 'FAILED' ? 'danger' : 'warning'}>
                    {humanize(candidate.consistency_report_status || 'pending')}
                  </StatusPill>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <StatusPill tone="default">{humanize(candidate.pipeline_status || candidate.candidate_status)}</StatusPill>
                  <span>{relativeDate(candidate.latest_interview_at)}</span>
                  {typeof candidate.latest_scorecard_average === 'number' ? (
                    <span className="font-medium text-foreground">Score {candidate.latest_scorecard_average.toFixed(1)}</span>
                  ) : null}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
