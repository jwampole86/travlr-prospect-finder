'use client';

import { Loader2 } from 'lucide-react';
import { EmptyState, Panel, StatusPill } from '@/components/ops';
import type { PipelineCandidate, PipelineStatus } from '@/app/candidate-tracker/types';
import { PIPELINE_STAGE_OPTIONS } from '../config';
import { candidateHeadline, formatRelativeTime, formatShortDate, humanizePriority, stageMeta } from '../helpers';

export function PipelineTable({
  candidates,
  savingId,
  onStatusChange,
}: {
  candidates: PipelineCandidate[];
  savingId: string | null;
  onStatusChange: (candidateId: string, status: PipelineStatus) => void;
}) {
  if (candidates.length === 0) {
    return <EmptyState icon={Loader2} title="No candidates to show" hint="Adjust the current filters to see pipeline rows." />;
  }

  return (
    <Panel title="Live pipeline table" padded={false}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Candidate</th>
              <th className="px-4 py-3 font-medium">Stage</th>
              <th className="px-4 py-3 font-medium">Interview health</th>
              <th className="px-4 py-3 font-medium">Focus</th>
              <th className="px-4 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => {
              const stage = stageMeta(candidate.pipeline_status);
              const priority = humanizePriority(candidate.interview_priority);
              return (
                <tr key={candidate.id} className="border-t border-border align-top text-sm">
                  <td className="px-4 py-4">
                    <div className="space-y-2 min-w-[220px]">
                      <div className="flex flex-wrap items-center gap-2">
                        {candidate.candidate_rank ? <StatusPill tone="primary">#{candidate.candidate_rank}</StatusPill> : null}
                        <p className="font-semibold text-foreground">{candidate.full_name}</p>
                      </div>
                      <p className="text-muted-foreground">{candidateHeadline(candidate)}</p>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <StatusPill tone={stage.tone}>{stage.label}</StatusPill>
                        {priority ? <StatusPill>{priority}</StatusPill> : null}
                        {typeof candidate.latest_scorecard_average === 'number' ? <StatusPill tone="success">Score {candidate.latest_scorecard_average.toFixed(1)}</StatusPill> : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-2 min-w-[210px]">
                      <select
                        value={candidate.pipeline_status}
                        onChange={(event) => onStatusChange(candidate.id, event.target.value as PipelineStatus)}
                        disabled={savingId === candidate.id}
                        className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                      >
                        {PIPELINE_STAGE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      {savingId === candidate.id ? <p className="inline-flex items-center gap-1 text-xs text-primary"><Loader2 size={12} className="animate-spin" />Saving stage change</p> : null}
                      <p className="text-xs text-muted-foreground">Next action: {candidate.next_action || 'Not saved yet'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-2 text-sm text-muted-foreground min-w-[180px]">
                      <p>Interviews: <span className="text-foreground">{candidate.interview_count || 0}</span></p>
                      <p>Latest interview: <span className="text-foreground">{formatShortDate(candidate.latest_interview_at)}</span></p>
                      <p>Next interview: <span className="text-foreground">{formatShortDate(candidate.next_interview_at)}</span></p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-2 text-sm text-muted-foreground min-w-[240px]">
                      <p><span className="font-medium text-foreground">Strength:</span> {candidate.top_strength || 'No summary yet'}</p>
                      <p><span className="font-medium text-foreground">Validate:</span> {candidate.main_area_to_validate || candidate.seed_concerns || 'No follow-up note saved'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(candidate.updated_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
