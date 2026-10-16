'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, MessageSquare, Save, Waves } from 'lucide-react';
import { Panel, StatusPill, buttonPrimary, buttonSecondary } from '@/components/ops';
import { formatDuration, formatOutcomeLabel, formatRelativeTime, type QaFlag, type ReviewSession } from '../data';

function flagTone(flag: QaFlag): 'default' | 'success' | 'warning' | 'danger' {
  if (flag === 'excellently_handled') return 'success';
  if (flag === 'needs_coaching') return 'warning';
  if (flag === 'escalate_for_review') return 'danger';
  return 'default';
}

function scoreTone(score: number | null): 'default' | 'success' | 'warning' | 'danger' {
  if (score === null) return 'default';
  if (score >= 80) return 'success';
  if (score >= 70) return 'warning';
  return 'danger';
}

export default function ReviewQueueCard({
  session,
  onSave,
}: {
  session: ReviewSession;
  onSave: (session: ReviewSession, values: { qaFlag: QaFlag; coachingNotes: string }) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [qaFlag, setQaFlag] = useState<QaFlag>(session.qaFlag);
  const [coachingNotes, setCoachingNotes] = useState(session.coachingNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setQaFlag(session.qaFlag);
    setCoachingNotes(session.coachingNotes ?? '');
    setMessage(null);
  }, [session.coachingNotes, session.qaFlag, session.sessionId]);

  const isDirty = useMemo(() => qaFlag !== session.qaFlag || coachingNotes !== (session.coachingNotes ?? ''), [coachingNotes, qaFlag, session.coachingNotes, session.qaFlag]);

  return (
    <Panel padded={false}>
      <div className="border-b border-border px-4 py-4">
        <button type="button" className="flex w-full items-start justify-between gap-4 text-left" onClick={() => setExpanded((value) => !value)}>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-foreground">{session.agentName}</h3>
              <StatusPill tone="primary">{formatOutcomeLabel(session.outcome)}</StatusPill>
              <StatusPill tone={flagTone(session.qaFlag)}>{session.qaFlag ? session.qaFlag.replace(/_/g, ' ') : 'Unreviewed'}</StatusPill>
              <StatusPill tone={scoreTone(session.overallScore)}>{session.overallScore !== null ? `${session.overallScore} score` : 'No score row'}</StatusPill>
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(session.startedAt).toLocaleString()} · {formatRelativeTime(session.startedAt)} · {formatDuration(session.durationSeconds)}
            </p>
            <div className="flex flex-wrap gap-2">
              {session.recordingUrl && <StatusPill tone="primary" icon={Waves}>Recording</StatusPill>}
              {session.hasTranscript && <StatusPill tone="success" icon={MessageSquare}>Transcript</StatusPill>}
              {session.reviewedAt && <StatusPill tone="success" icon={CheckCircle2}>Reviewed {formatRelativeTime(session.reviewedAt)}</StatusPill>}
            </div>
          </div>
          {expanded ? <ChevronUp size={16} className="mt-1 text-muted-foreground" /> : <ChevronDown size={16} className="mt-1 text-muted-foreground" />}
        </button>
      </div>

      {expanded && (
        <div className="space-y-4 p-4">
          <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
            <div className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transcript preview</p>
                {session.transcriptPreview.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">No transcript text saved for this session.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {session.transcriptPreview.map((line, index) => (
                      <p key={`${session.sessionId}-${index}`} className="text-sm text-foreground">{line}</p>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Summary and notes</p>
                <div className="mt-2 space-y-2 text-sm text-foreground">
                  {session.summaryText && <p>{session.summaryText}</p>}
                  {session.dispositionNotes && <p>Disposition: {session.dispositionNotes}</p>}
                  {session.notes && <p>Session note: {session.notes}</p>}
                  {!session.summaryText && !session.dispositionNotes && !session.notes && (
                    <p className="text-muted-foreground">No summary or notes were saved for this call.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Review status</p>
                <select
                  value={qaFlag ?? ''}
                  onChange={(event) => setQaFlag((event.target.value || null) as QaFlag)}
                  className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">No QA flag</option>
                  <option value="excellently_handled">Excellently handled</option>
                  <option value="needs_coaching">Needs coaching</option>
                  <option value="escalate_for_review">Escalate for review</option>
                </select>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Coaching note</p>
                <textarea
                  rows={6}
                  value={coachingNotes}
                  onChange={(event) => setCoachingNotes(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Save concrete coaching feedback to call_sessions.coaching_notes"
                />
              </div>
              {session.overallScore !== null && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { label: 'Pace', value: session.paceScore },
                    { label: 'Objections', value: session.objectionScore },
                    { label: 'Close triggers', value: session.closeTriggerScore },
                    { label: 'Rapport', value: session.rapportScore },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-border bg-muted/20 p-3">
                      <div className="text-[11px] text-muted-foreground">{item.label}</div>
                      <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{item.value ?? '—'}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonSecondary} disabled={!isDirty || saving} onClick={() => {
                  setQaFlag(session.qaFlag);
                  setCoachingNotes(session.coachingNotes ?? '');
                  setMessage(null);
                }}>
                  Reset
                </button>
                <button
                  type="button"
                  className={buttonPrimary}
                  disabled={!isDirty || saving}
                  onClick={async () => {
                    setSaving(true);
                    setMessage(null);
                    try {
                      await onSave(session, { qaFlag, coachingNotes });
                      setMessage('Review saved.');
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : 'Save failed');
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save review
                </button>
              </div>
              {message && <p className="text-xs text-muted-foreground">{message}</p>}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
