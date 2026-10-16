'use client';

import Link from 'next/link';
import { ArrowRight, FileText, Sparkles } from 'lucide-react';
import { Panel, StatusPill, buttonSecondary } from '@/components/ops';
import { StageSelect } from './StageSelect';
import type { PipelineCandidate, PipelineStatus } from '../types';

function humanize(value?: string | null) {
  return value ? value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : '—';
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

function toneForStatus(status: string | null | undefined) {
  switch (status) {
    case 'MOVE_FORWARD':
    case 'HIRED':
    case 'COMPLETED':
      return 'success' as const;
    case 'FOLLOW_UP':
    case 'PENDING':
      return 'warning' as const;
    case 'NOT_MOVING_FORWARD':
    case 'FAILED':
      return 'danger' as const;
    default:
      return 'default' as const;
  }
}

export function TrackerTable({
  candidates,
  savingId,
  onStatusChange,
}: {
  candidates: PipelineCandidate[];
  savingId: string | null;
  onStatusChange: (candidateId: string, status: PipelineStatus) => void;
}) {
  return (
    <Panel title="Pipeline candidates">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-3 font-medium">Candidate</th>
              <th className="px-2 py-3 font-medium">Stage</th>
              <th className="px-2 py-3 font-medium">Interview health</th>
              <th className="px-2 py-3 font-medium">Focus</th>
              <th className="px-2 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => (
              <tr key={candidate.id} className="border-b border-border/70 align-top last:border-b-0">
                <td className="px-2 py-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {candidate.candidate_rank ? <StatusPill tone="primary">#{candidate.candidate_rank}</StatusPill> : null}
                      <p className="text-sm font-semibold text-foreground">{candidate.full_name}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">{candidate.current_title || candidate.current_company || humanize(candidate.interview_priority)}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <StatusPill tone={toneForStatus(candidate.pipeline_status)}>{humanize(candidate.pipeline_status)}</StatusPill>
                      {candidate.interview_priority ? <StatusPill tone="default">{humanize(candidate.interview_priority)}</StatusPill> : null}
                      {typeof candidate.latest_scorecard_average === 'number' ? <StatusPill tone="success">Score {candidate.latest_scorecard_average.toFixed(1)}</StatusPill> : null}
                    </div>
                  </div>
                </td>
                <td className="px-2 py-4">
                  <StageSelect
                    value={candidate.pipeline_status}
                    saving={savingId === candidate.id}
                    onChange={(value) => onStatusChange(candidate.id, value)}
                  />
                  <p className="mt-2 text-xs text-muted-foreground">Next action: {candidate.next_action || 'None saved'}</p>
                </td>
                <td className="px-2 py-4">
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>Interviews: <span className="font-medium text-foreground">{candidate.interview_count || 0}</span></p>
                    <p>Latest interview: <span className="font-medium text-foreground">{formatDate(candidate.latest_interview_at)}</span></p>
                    <p>Next interview: <span className="font-medium text-foreground">{formatDate(candidate.next_interview_at)}</span></p>
                    <StatusPill tone={toneForStatus(candidate.consistency_report_status)}>
                      Report {humanize(candidate.consistency_report_status || 'pending')}
                    </StatusPill>
                  </div>
                </td>
                <td className="px-2 py-4">
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p><span className="font-medium text-foreground">Top strength:</span> {humanize(candidate.top_strength)}</p>
                    <p><span className="font-medium text-foreground">Validate:</span> {candidate.main_area_to_validate || candidate.seed_concerns || 'No follow-up note saved'}</p>
                    {candidate.seed_fit_notes ? <p className="text-xs">{candidate.seed_fit_notes}</p> : null}
                  </div>
                </td>
                <td className="px-2 py-4">
                  <div className="flex flex-col gap-2">
                    <Link href={`/consistency-report?candidateId=${encodeURIComponent(candidate.id)}`} className={buttonSecondary}>
                      <FileText size={14} />Consistency report
                    </Link>
                    <Link href="/interview-mode-qa" className={buttonSecondary}>
                      <Sparkles size={14} />Interview QA
                    </Link>
                    {candidate.next_interview_at ? (
                      <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <ArrowRight size={12} />{humanize(candidate.next_interview_type)}
                      </div>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
