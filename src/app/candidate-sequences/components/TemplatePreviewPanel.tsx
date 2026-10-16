import React from 'react';
import { Copy, FileText, Mail } from 'lucide-react';
import { EmptyState, Panel, StatusPill, buttonPrimary, buttonSecondary } from '@/components/ops';
import type { CandidateSequenceRow } from './CandidateCohortTable';

export interface SequencePreview {
  label: string;
  description: string;
  note: string;
  subject: string;
  body: string;
}

export default function TemplatePreviewPanel({
  candidate,
  preview,
  automationReady,
  workflowCount,
  onCopy,
}: {
  candidate: CandidateSequenceRow | null;
  preview: SequencePreview;
  automationReady: boolean;
  workflowCount: number;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-4">
      <Panel
        title="Template preview"
        icon={Mail}
        actions={<button className={buttonSecondary} onClick={onCopy}><Copy size={14} /> Copy</button>}
      >
        {candidate ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={automationReady ? 'success' : 'warning'}>
                {automationReady ? 'Automation storage ready' : 'Preview only'}
              </StatusPill>
              <StatusPill tone={workflowCount > 0 ? 'primary' : 'default'}>
                {workflowCount} live workflow{workflowCount === 1 ? '' : 's'}
              </StatusPill>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subject</div>
              <div className="mt-1 rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm font-semibold text-foreground">
                {preview.subject}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Body</div>
              <pre className="mt-1 whitespace-pre-wrap rounded-2xl border border-border bg-muted/30 px-4 py-3 text-xs leading-6 text-foreground">
                {preview.body}
              </pre>
            </div>
            <div className="rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
              {preview.note}
            </div>
          </div>
        ) : (
          <EmptyState icon={FileText} title="Select a candidate" hint="Choose a row to preview a personalized message draft." />
        )}
      </Panel>

      <Panel title="Automation readiness" icon={FileText}>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>{preview.description}</p>
          <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3">
            {automationReady
              ? 'Candidate enrollment persistence is provisioned, so enroll and pause controls can rely on stored state.'
              : 'Candidate enrollment persistence is not provisioned in the live database yet, so this page stays in preview mode and never attempts a send.'}
          </div>
          <button className={buttonPrimary} disabled>
            {automationReady ? 'Enroll candidate' : 'Enroll disabled until setup is completed'}
          </button>
        </div>
      </Panel>
    </div>
  );
}
