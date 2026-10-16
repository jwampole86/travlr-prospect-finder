import Link from 'next/link';
import { ArrowUpRight, Clock3, MessageSquarePlus, Phone, Reply, Signal, User } from 'lucide-react';
import { EmptyState, Panel, StatusPill, buttonSecondary } from '@/components/ops';
import {
  formatDateTime,
  formatLeadLocation,
  formatRelativeTime,
  getLeadDisplayName,
  getLeadStageLabel,
  type LeadOption,
  type OutreachLead,
} from '../lib';

interface LeadQueueTableProps {
  leads: OutreachLead[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  onLogLead: (lead: LeadOption) => void;
}

export default function LeadQueueTable({ leads, total, page, pageSize, loading, onPageChange, onLogLead }: LeadQueueTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Panel title="Lead outreach queue" icon={Signal} padded={false}>
      {loading ? (
        <div className="px-4 py-16 text-center text-sm text-muted-foreground">Loading live leads…</div>
      ) : leads.length === 0 ? (
        <div className="p-4">
          <EmptyState icon={Signal} title="No leads matched these filters" hint="Try another outreach status, stage, or search term." />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/20 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Lead</th>
                  <th className="px-4 py-3 font-medium">Stage</th>
                  <th className="px-4 py-3 font-medium">Outreach</th>
                  <th className="px-4 py-3 font-medium">Last contact</th>
                  <th className="px-4 py-3 font-medium">Response</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const stage = getLeadStageLabel(lead.stage);
                  const leadOption: LeadOption = { id: lead.id, address: lead.address, city: lead.city, state: lead.state };
                  return (
                    <tr key={lead.id} className="border-t border-border align-top">
                      <td className="px-4 py-4">
                        <div className="flex items-start gap-3">
                          <span className="rounded-xl bg-primary/10 p-2 text-primary"><User size={14} /></span>
                          <div className="space-y-1">
                            <div className="font-semibold text-foreground">{getLeadDisplayName(lead)}</div>
                            <div className="text-xs text-muted-foreground">{formatLeadLocation(lead)}</div>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1"><Phone size={12} />{lead.contact_phone ? 'Phone on file' : 'No phone'}</span>
                              <span>Score {lead.prospect_score ?? '—'}</span>
                              <span>Added {formatRelativeTime(lead.created_at)}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <StatusPill tone={stage === 'New Lead' ? 'default' : 'primary'}>{stage}</StatusPill>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <StatusPill tone={lead.outreach_status === 'NOT_CONTACTED' ? 'warning' : lead.outreach_status === 'RESPONDED' ? 'success' : 'default'}>
                            {lead.outreach_status || 'NOT_CONTACTED'}
                          </StatusPill>
                          <div className="text-xs text-muted-foreground">Next follow-up: {formatDateTime(lead.next_followup_due)}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-foreground">
                        <div className="inline-flex items-center gap-1.5"><Clock3 size={13} className="text-muted-foreground" />{formatRelativeTime(lead.last_contacted_at)}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="inline-flex items-center gap-1.5 text-sm text-foreground">
                          <Reply size={13} className="text-muted-foreground" />
                          {lead.outreach_responded_at ? formatRelativeTime(lead.outreach_responded_at) : 'No response'}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button type="button" onClick={() => onLogLead(leadOption)} className={buttonSecondary}>
                            <MessageSquarePlus size={14} /> Log
                          </button>
                          <Link href={`/lead-profile?id=${lead.id}`} className={buttonSecondary}>
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
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()} leads
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
