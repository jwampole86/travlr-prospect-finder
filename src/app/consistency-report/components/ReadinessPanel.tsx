'use client';

import { CheckCircle2, FileText, MessageSquareText, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Panel, StatusPill } from '@/components/ops';
import type { CandidateDetail, ReadinessState } from '../types';

function humanize(value?: string | null) {
  return value ? value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()) : '—';
}

export function ReadinessPanel({
  candidate,
  readiness,
  meta,
}: {
  candidate: CandidateDetail;
  readiness: ReadinessState;
  meta: { model: string; promptVersion: string; apiKeyConfigured: boolean; browserKeyExposed: boolean };
}) {
  const sources = [
    { label: 'Resume evidence', value: readiness.resumeReady ? 'Ready' : 'Missing', tone: readiness.resumeReady ? 'success' : 'danger', hint: `${readiness.reportCount} report${readiness.reportCount === 1 ? '' : 's'} on file` },
    { label: 'Interview notes', value: `${readiness.notesCount}`, tone: readiness.notesCount > 0 ? 'success' : 'warning', hint: 'Saved note entries' },
    { label: 'Interviewer summary', value: readiness.hasInterviewerNotes ? 'Present' : 'Missing', tone: readiness.hasInterviewerNotes ? 'success' : 'warning', hint: readiness.hasScorecard ? 'Latest scorecard summary' : 'No scorecard yet' },
    { label: 'AI route', value: meta.apiKeyConfigured ? meta.model : 'Unavailable', tone: meta.apiKeyConfigured ? 'primary' : 'danger', hint: meta.browserKeyExposed ? 'Public key exposed — fix env' : 'Server-only key' },
  ] as const;

  return (
    <Panel title="Readiness & data sources" icon={FileText}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {sources.map((source) => (
          <div key={source.label} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">{source.label}</p>
            <div className="mt-2 flex items-center gap-2">
              <StatusPill tone={source.tone}>{source.value}</StatusPill>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{source.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusPill tone={readiness.readyForAnalysis ? 'success' : 'warning'} icon={readiness.readyForAnalysis ? CheckCircle2 : ShieldAlert}>
          {readiness.readyForAnalysis ? 'Ready to generate' : 'Needs more evidence'}
        </StatusPill>
        <StatusPill tone="default" icon={MessageSquareText}>Interview count {readiness.interviewCount}</StatusPill>
        <StatusPill tone="default">Pipeline {humanize(candidate.pipeline_status)}</StatusPill>
        <StatusPill tone={meta.browserKeyExposed ? 'danger' : 'success'} icon={meta.browserKeyExposed ? ShieldAlert : ShieldCheck}>
          {meta.browserKeyExposed ? 'Browser key exposed' : 'Browser key safe'}
        </StatusPill>
      </div>

      {readiness.blockers.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-danger/20 bg-danger/10 p-4">
          <p className="text-sm font-semibold text-danger">Blocking issues</p>
          <ul className="mt-2 space-y-1 text-sm text-danger">
            {readiness.blockers.map((item) => <li key={item}>• {item}</li>)}
          </ul>
        </div>
      ) : null}

      {readiness.warnings.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-warning/20 bg-warning/10 p-4">
          <p className="text-sm font-semibold text-warning">Notes</p>
          <ul className="mt-2 space-y-1 text-sm text-warning">
            {readiness.warnings.map((item) => <li key={item}>• {item}</li>)}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}
