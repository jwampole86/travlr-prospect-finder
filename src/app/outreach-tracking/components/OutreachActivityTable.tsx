import Link from 'next/link';
import { ArrowUpRight, CheckCircle2, Clock3, PauseCircle } from 'lucide-react';
import { EmptyState, Panel, StatusPill, buttonSecondary } from '@/components/ops';
import {
  formatDateTime,
  formatLeadLocation,
  getCommTypeLabel,
  isDueOverdue,
  isSnoozed,
  type OutreachLog,
} from '../lib';

interface OutreachActivityTableProps {
  logs: OutreachLog[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  updatingId: string | null;
  onPageChange: (page: number) => void;
  onToggleComplete: (log: OutreachLog) => void;
  onSnooze: (log: OutreachLog, hours: number) => void;
}

export default function OutreachActivityTable({
  logs,
  total,
  page,
  pageSize,
  loading,
  updatingId,
  onPageChange,
  onToggleComplete,
  onSnooze,
}: OutreachActivityTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Panel title="Logged outreach activity" icon={Clock3} padded={false}>
      {loading ? (
        <div className="px-4 py-16 text-center text-sm text-muted-foreground">Loading outreach_logs…</div>
      ) : logs.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={Clock3}
            title="No outreach logs matched these filters"
            hint="The live outreach_logs table is currently empty for this filter set, so this screen now shows an honest empty state instead of fabricated activity."
          />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/20 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Logged</th>
                  <th className="px-4 py-3 font-medium">Lead</th>
                  <th className="px-4 py-3 font-medium">Channel</th>
                  <th className="px-4 py-3 font-medium">Outcome</th>
                  <th className="px-4 py-3 font-medium">Schedule</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const busy = updatingId === log.id;
                  return (
                    <tr key={log.id} className="border-t border-border align-top">
                      <td className="px-4 py-4 text-sm text-foreground">{formatDateTime(log.logged_at)}</td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <div className="font-semibold text-foreground">{formatLeadLocation(log)}</div>
                          <div className="text-xs text-muted-foreground">{log.agent_name || 'Unassigned agent'}</div>
                          {log.notes && <div className="max-w-md text-xs leading-5 text-muted-foreground">{log.notes}</div>}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <StatusPill tone={log.comm_type === 'email' ? 'primary' : log.comm_type === 'text' ? 'success' : 'default'}>{getCommTypeLabel(log.comm_type)}</StatusPill>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <StatusPill tone={log.response_status === 'Interested' ? 'success' : log.response_status === 'Do Not Contact' ? 'danger' : 'default'}>
                            {log.response_status}
                          </StatusPill>
                          <div className="text-xs text-muted-foreground">Priority: {log.priority || 'normal'}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <div>Due: {formatDateTime(log.due_date)}</div>
                          <div>Snooze: {formatDateTime(log.snooze_until)}</div>
                          <div className={isDueOverdue(log.due_date) && !log.is_completed ? 'text-warning' : ''}>
                            {log.is_completed ? 'Completed' : isSnoozed(log.snooze_until) ? 'Snoozed' : isDueOverdue(log.due_date) ? 'Overdue' : 'Open'}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button type="button" disabled={busy} onClick={() => onToggleComplete(log)} className={buttonSecondary}>
                            <CheckCircle2 size={14} /> {log.is_completed ? 'Reopen' : 'Complete'}
                          </button>
                          <button type="button" disabled={busy} onClick={() => onSnooze(log, 24)} className={buttonSecondary}>
                            <PauseCircle size={14} /> Snooze 1d
                          </button>
                          <Link href={`/lead-profile?id=${log.lead_id}`} className={buttonSecondary}>
                            <ArrowUpRight size={14} /> Lead
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <span>
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()} outreach logs
            </span>
            <div className="flex items-center gap-2">
              <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className={buttonSecondary}>Previous</button>
              <span>Page {page} of {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className={buttonSecondary}>Next</button>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}
