import React from 'react';
import { CalendarClock, Copy, Mail, UserRound } from 'lucide-react';
import { EmptyState, StatusPill, buttonSecondary } from '@/components/ops';

export interface CandidateSequenceRow {
  id: string;
  full_name: string;
  email: string | null;
  stage: string;
  roleTitle: string | null;
  sessionAt: string | null;
}

function formatDate(value: string | null) {
  if (!value) return 'No interview recorded';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function toneForStage(stage: string) {
  if (stage === 'HIRED') return 'success' as const;
  if (stage === 'NOT_MOVING_FORWARD') return 'danger' as const;
  if (stage === 'SECOND_INTERVIEW' || stage === 'MOVE_FORWARD') return 'primary' as const;
  if (stage === 'FOLLOW_UP' || stage === 'INTERVIEWED') return 'warning' as const;
  return 'default' as const;
}

export default function CandidateCohortTable({
  rows,
  selectedId,
  onSelect,
  onCopy,
}: {
  rows: CandidateSequenceRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCopy: (row: CandidateSequenceRow) => void;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={UserRound}
        title="No candidates in this cohort"
        hint="The selected pipeline stage does not have any candidates yet for the current filters."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-semibold">Candidate</th>
            <th className="px-4 py-3 font-semibold">Stage</th>
            <th className="px-4 py-3 font-semibold">Role / interview</th>
            <th className="px-4 py-3 font-semibold">Contact</th>
            <th className="px-4 py-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isSelected = selectedId === row.id;
            return (
              <tr
                key={row.id}
                className={`border-t border-border transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/30'}`}
              >
                <td className="px-4 py-3">
                  <button className="text-left" onClick={() => onSelect(row.id)}>
                    <div className="font-semibold text-foreground">{row.full_name}</div>
                    <div className="text-xs text-muted-foreground">Candidate record</div>
                  </button>
                </td>
                <td className="px-4 py-3">
                  <StatusPill tone={toneForStage(row.stage)}>{row.stage.replaceAll('_', ' ')}</StatusPill>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{row.roleTitle ?? 'Role not captured yet'}</div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarClock size={12} /> {formatDate(row.sessionAt)}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {row.email ? (
                    <div className="inline-flex items-center gap-1 text-xs text-foreground">
                      <Mail size={12} className="text-muted-foreground" /> {row.email}
                    </div>
                  ) : (
                    <span className="text-xs text-warning">Missing email</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button className={buttonSecondary} onClick={() => onCopy(row)}>
                    <Copy size={14} /> Copy draft
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
