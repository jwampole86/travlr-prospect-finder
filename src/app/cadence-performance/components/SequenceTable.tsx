import { CheckCircle2, Layers3, Mail, MessageSquare, Send } from 'lucide-react';
import { EmptyState, StatusPill } from '@/components/ops';
import type { SequencePerformanceRow } from '../lib';

export default function SequenceTable({ rows }: { rows: SequencePerformanceRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Layers3}
        title="No cadence sequences found"
        hint="This workspace does not currently expose any cadence_sequences rows to the authenticated client."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-left font-semibold">Sequence</th>
            <th className="px-4 py-3 text-left font-semibold">Blueprint</th>
            <th className="px-4 py-3 text-right font-semibold">Enrollments</th>
            <th className="px-4 py-3 text-right font-semibold">Sends</th>
            <th className="px-4 py-3 text-right font-semibold">Engagement</th>
            <th className="px-4 py-3 text-left font-semibold">Latest activity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id} className="align-top hover:bg-muted/20">
              <td className="px-4 py-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{row.name}</span>
                    {row.isDefault && <StatusPill tone="primary">Default</StatusPill>}
                    <StatusPill tone={row.isActive ? 'success' : 'danger'}>{row.isActive ? 'Active' : 'Inactive'}</StatusPill>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Mail size={12} /> {row.steps.filter((step) => step.channel === 'email').length} email steps</span>
                    <span className="inline-flex items-center gap-1"><MessageSquare size={12} /> {row.steps.filter((step) => step.channel === 'sms').length} SMS steps</span>
                  </div>
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="space-y-2">
                  {row.steps.map((step) => (
                    <div key={`${row.id}-${step.step}`} className="rounded-2xl border border-border bg-muted/20 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">Step {step.step + 1}</span>
                        <StatusPill tone={step.channel === 'sms' ? 'success' : 'primary'} icon={step.channel === 'sms' ? MessageSquare : Mail}>
                          {step.channel.toUpperCase()}
                        </StatusPill>
                        <StatusPill tone={step.templateReady ? 'success' : 'warning'} icon={step.templateReady ? CheckCircle2 : Send}>
                          {step.templateReady ? 'Template key found' : 'Template key missing'}
                        </StatusPill>
                      </div>
                      <div className="mt-2 text-xs text-foreground">{step.label}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {step.delayDays}d {step.delayHours}h delay · {step.templateKey || 'No template key'}
                      </div>
                    </div>
                  ))}
                </div>
              </td>
              <td className="px-4 py-4 text-right">
                <div className="space-y-1 tabular-nums">
                  <div className="text-lg font-semibold text-foreground">{row.totalEnrollments}</div>
                  <div className="text-xs text-muted-foreground">{row.activeEnrollments} active · {row.completedEnrollments} completed</div>
                  <div className="text-xs text-muted-foreground">{row.escalatedEnrollments} escalated · {row.pausedEnrollments + row.unsubscribedEnrollments} non-active</div>
                </div>
              </td>
              <td className="px-4 py-4 text-right">
                <div className="space-y-1 tabular-nums">
                  <div className="text-lg font-semibold text-foreground">{row.totalSends}</div>
                  <div className="text-xs text-muted-foreground">{row.deliveredSends} delivered · {row.failedSends} failed</div>
                  <div className="text-xs text-muted-foreground">{row.skippedSends} skipped</div>
                </div>
              </td>
              <td className="px-4 py-4 text-right">
                <div className="space-y-1 tabular-nums">
                  <div className="text-lg font-semibold text-foreground">{row.engagementRate}%</div>
                  <div className="text-xs text-muted-foreground">{row.engagedSends} engaged sends</div>
                  <div className="text-xs text-muted-foreground">{row.openedSends} opens · {row.clickedSends} clicks</div>
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>Last enrollment: <span className="text-foreground">{formatDate(row.lastEnrollmentAt)}</span></div>
                  <div>Last send: <span className="text-foreground">{formatDate(row.lastSendAt)}</span></div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
