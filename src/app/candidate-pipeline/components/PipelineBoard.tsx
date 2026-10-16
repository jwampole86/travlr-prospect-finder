'use client';

import React from 'react';
import { ArrowRight, CalendarDays, GripVertical, Loader2, Users } from 'lucide-react';
import { EmptyState, Panel, StatusPill } from '@/components/ops';
import type { PipelineCandidate, PipelineStatus } from '@/app/candidate-tracker/types';
import { PIPELINE_STAGES } from '../config';
import { candidateHeadline, formatRelativeTime, formatShortDate, humanizePriority, stageMeta, toneClasses } from '../helpers';

function CandidateCard({
  candidate,
  saving,
  onStatusChange,
  onDragStart,
}: {
  candidate: PipelineCandidate;
  saving: boolean;
  onStatusChange: (candidateId: string, status: PipelineStatus) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, candidateId: string) => void;
}) {
  const stage = stageMeta(candidate.pipeline_status);
  const nextStage = PIPELINE_STAGES[Math.min(PIPELINE_STAGES.length - 1, PIPELINE_STAGES.findIndex((item) => item.id === stage.id) + 1)];
  const priority = humanizePriority(candidate.interview_priority);

  return (
    <div
      draggable={!saving}
      onDragStart={(event) => onDragStart(event, candidate.id)}
      className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {candidate.candidate_rank ? <StatusPill tone="primary">#{candidate.candidate_rank}</StatusPill> : null}
            <p className="text-sm font-semibold text-foreground truncate">{candidate.full_name}</p>
          </div>
          <p className="text-sm text-muted-foreground">{candidateHeadline(candidate)}</p>
        </div>
        <GripVertical size={15} className="mt-1 shrink-0 text-muted-foreground" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <StatusPill tone={stage.tone}>{stage.label}</StatusPill>
        {priority ? <StatusPill>{priority}</StatusPill> : null}
        {typeof candidate.latest_scorecard_average === 'number' ? <StatusPill tone="success">Score {candidate.latest_scorecard_average.toFixed(1)}</StatusPill> : null}
      </div>

      <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <CalendarDays size={12} />
          <span>Latest interview: <span className="text-foreground">{formatShortDate(candidate.latest_interview_at)}</span></span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays size={12} />
          <span>Next step: <span className="text-foreground">{candidate.next_action || formatRelativeTime(candidate.next_interview_at)}</span></span>
        </div>
        <div className="flex items-center gap-2">
          <Users size={12} />
          <span>{candidate.interview_count || 0} interview{candidate.interview_count === 1 ? '' : 's'}</span>
        </div>
      </div>

      {(candidate.top_strength || candidate.main_area_to_validate) ? (
        <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3 text-xs">
          {candidate.top_strength ? <p className="text-foreground"><span className="font-medium">Strength:</span> {candidate.top_strength}</p> : null}
          {candidate.main_area_to_validate ? <p className="mt-1 text-muted-foreground"><span className="font-medium text-foreground">Validate:</span> {candidate.main_area_to_validate}</p> : null}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">Updated {formatRelativeTime(candidate.updated_at)}</span>
        {saving ? (
          <span className="inline-flex items-center gap-1 text-xs text-primary"><Loader2 size={12} className="animate-spin" />Saving</span>
        ) : nextStage && nextStage.id !== candidate.pipeline_status ? (
          <button
            type="button"
            onClick={() => onStatusChange(candidate.id, nextStage.id)}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
          >
            Move to {nextStage.label}
            <ArrowRight size={12} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function PipelineBoard({
  candidates,
  savingId,
  onStatusChange,
}: {
  candidates: PipelineCandidate[];
  savingId: string | null;
  onStatusChange: (candidateId: string, status: PipelineStatus) => void;
}) {
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dragTarget, setDragTarget] = React.useState<PipelineStatus | null>(null);

  const grouped = React.useMemo(() => {
    return PIPELINE_STAGES.reduce<Record<PipelineStatus, PipelineCandidate[]>>((acc, stage) => {
      acc[stage.id] = candidates.filter((candidate) => candidate.pipeline_status === stage.id);
      return acc;
    }, {
      READY_TO_INTERVIEW: [],
      INTERVIEWED: [],
      FOLLOW_UP: [],
      HOLD: [],
      MOVE_FORWARD: [],
      HIRED: [],
      NOT_MOVING_FORWARD: [],
    });
  }, [candidates]);

  if (candidates.length === 0) {
    return <EmptyState icon={Users} title="No candidates match this stage" hint="Try a different search or pipeline stage filter." />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
      {PIPELINE_STAGES.map((stage) => {
        const stageCandidates = grouped[stage.id];
        return (
          <Panel
            key={stage.id}
            title={stage.label}
            className={`border ${toneClasses(stage.tone)} bg-card`}
            actions={<StatusPill tone={stage.tone}>{stageCandidates.length}</StatusPill>}
          >
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragTarget(stage.id);
              }}
              onDragLeave={() => setDragTarget((current) => (current === stage.id ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                if (draggingId) onStatusChange(draggingId, stage.id);
                setDraggingId(null);
                setDragTarget(null);
              }}
              className={`space-y-3 rounded-2xl ${dragTarget === stage.id ? 'bg-muted/60 p-2' : ''}`}
            >
              {stageCandidates.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-xs text-muted-foreground">
                  Drop a candidate here
                </div>
              ) : stageCandidates.map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  saving={savingId === candidate.id}
                  onStatusChange={onStatusChange}
                  onDragStart={(event, candidateId) => {
                    setDraggingId(candidateId);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                />
              ))}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
