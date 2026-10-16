'use client';

import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, CopyCheck, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Panel, StatusPill } from '@/components/ops';
import type { QAResult } from '../types';

const toneByStatus: Record<QAResult['qaStatus'], 'success' | 'warning' | 'danger'> = {
  PASS: 'success',
  WARN: 'warning',
  FAIL: 'danger',
};

export function QaResultPanel({ result }: { result: QAResult }) {
  const [open, setOpen] = useState(false);

  return (
    <Panel className={result.qaStatus === 'FAIL' ? 'border-danger/30' : result.qaStatus === 'WARN' ? 'border-warning/30' : ''}>
      <button onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-4 text-left">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{result.candidateName}</h3>
            <StatusPill tone={toneByStatus[result.qaStatus]}>{result.qaStatus}</StatusPill>
            {result.crossCandidateLeakage ? <StatusPill tone="danger" icon={ShieldAlert}>Leakage detected</StatusPill> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{result.specificQuestionsCount} candidate-specific questions</span>
            <span>• {result.evidenceBackedCount} evidence-backed</span>
            <span>• {result.personalizationPct}% personalization</span>
            <span>• {result.nearDuplicateCount} near-duplicates</span>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>

      {open ? (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          {result.failReasons.length > 0 ? (
            <div className="rounded-2xl border border-danger/20 bg-danger/10 p-4">
              <p className="text-sm font-semibold text-danger">Fail reasons</p>
              <ul className="mt-2 space-y-1 text-sm text-danger">{result.failReasons.map((item) => <li key={item}>• {item}</li>)}</ul>
            </div>
          ) : null}

          {result.warnReasons.length > 0 ? (
            <div className="rounded-2xl border border-warning/20 bg-warning/10 p-4">
              <p className="text-sm font-semibold text-warning">Warnings</p>
              <ul className="mt-2 space-y-1 text-sm text-warning">{result.warnReasons.map((item) => <li key={item}>• {item}</li>)}</ul>
            </div>
          ) : null}

          {result.leakageDetails.length > 0 ? (
            <div className="rounded-2xl border border-danger/20 bg-danger/10 p-4">
              <p className="text-sm font-semibold text-danger">Cross-candidate leakage details</p>
              <ul className="mt-2 space-y-1 text-sm text-danger">{result.leakageDetails.map((item) => <li key={item}>• {item}</li>)}</ul>
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Candidate-specific questions</p>
              {(result.candidateSpecificQuestions || []).map((item, index) => (
                <div key={`${item.question}-${index}`} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={item.hasEvidence ? 'success' : 'danger'}>{item.evidenceStrength}</StatusPill>
                    {!item.hasEvidence ? <StatusPill tone="danger" icon={AlertTriangle}>No evidence</StatusPill> : null}
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">{item.question}</p>
                  {item.resumeBasis ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.resumeBasis}</p> : null}
                </div>
              ))}
              {(result.candidateSpecificQuestions || []).length === 0 ? <p className="text-sm text-muted-foreground">No candidate-specific questions were saved.</p> : null}
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Duplicate matches</p>
                <div className="mt-3 space-y-3">
                  {(result.duplicateMatches || []).map((match, index) => (
                    <div key={`${match.question}-${index}`} className="rounded-2xl border border-border bg-card p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone="warning" icon={CopyCheck}>{match.similarity}% similar</StatusPill>
                      </div>
                      <p className="mt-3 text-sm font-medium text-foreground">{match.question}</p>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{match.matchedWith}</p>
                    </div>
                  ))}
                  {(result.duplicateMatches || []).length === 0 ? <p className="text-sm text-muted-foreground">No near-duplicate question pairs were saved.</p> : null}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-sm font-semibold text-foreground">Coverage snapshot</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Core questions</p>
                    <p className="text-xl font-semibold text-foreground">{result.coreQuestionsCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Missing evidence</p>
                    <p className="text-xl font-semibold text-foreground">{result.missingEvidenceCount}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
