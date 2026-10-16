import { normalizeLeadStage } from '@/lib/leadStage';

export type CommType = 'call' | 'text' | 'email' | 'other';
export type ResponseStatus =
  | 'No Answer'
  | 'Interested'
  | 'Not Interested'
  | 'Follow-up Needed'
  | 'Voicemail'
  | 'Callback Requested'
  | 'Wrong Number'
  | 'Do Not Contact';

export interface OutreachLog {
  id: string;
  lead_id: string;
  agent_id: string | null;
  agent_name: string | null;
  comm_type: CommType;
  notes: string | null;
  response_status: ResponseStatus;
  logged_at: string;
  created_at: string;
  due_date: string | null;
  snooze_until: string | null;
  is_completed: boolean;
  priority: string | null;
  lead_address: string;
  lead_city: string;
  lead_state: string;
}

export interface LeadOption {
  id: string;
  address: string;
  city: string;
  state: string;
}

export interface OutreachLead {
  id: string;
  address: string;
  city: string;
  state: string;
  contact_name: string;
  owner_name: string;
  stage: string;
  outreach_status: string;
  prospect_score: number | null;
  last_contacted_at: string | null;
  outreach_responded_at: string | null;
  next_followup_due: string | null;
  contact_phone: string | null;
  created_at: string | null;
}

export interface OutreachDashboardStats {
  totalLeads: number;
  newLeadStage: number;
  notContacted: number;
  touched: number;
  responded: number;
  withPhone: number;
  logsTotal: number;
  logsCompleted: number;
  logsOverdue: number;
  logsDueSoon: number;
  logsSnoozed: number;
}

export const RESPONSE_STATUSES: ResponseStatus[] = [
  'No Answer',
  'Interested',
  'Not Interested',
  'Follow-up Needed',
  'Voicemail',
  'Callback Requested',
  'Wrong Number',
  'Do Not Contact',
];

export const OUTREACH_STATUS_OPTIONS = [
  'NOT_CONTACTED',
  'ATTEMPTED',
  'CONTACTED',
  'RESPONDED',
  'FOLLOW_UP',
  'APPOINTMENT_SCHEDULED',
  'QUALIFIED',
  'CONVERTED',
  'NOT_INTERESTED',
  'DO_NOT_CONTACT',
] as const;

export const STAGE_OPTIONS = ['New Lead', 'Contacted', 'Interested', 'Proposal Sent', 'Under Contract', 'Live', 'Not a Fit'] as const;

export const COMM_TYPE_OPTIONS: CommType[] = ['call', 'text', 'email', 'other'];

const COMM_TYPE_LABELS: Record<CommType, string> = {
  call: 'Phone call',
  text: 'Text / SMS',
  email: 'Email',
  other: 'Other',
};

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function getCommTypeLabel(type: CommType) {
  return COMM_TYPE_LABELS[type] ?? type;
}

export function formatDateTime(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatRelativeTime(value: string | null) {
  if (!value) return 'Never';
  const ms = new Date(value).getTime() - Date.now();
  const minutes = Math.round(ms / 60000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  const days = Math.round(hours / 24);
  return rtf.format(days, 'day');
}

export function formatLeadLocation(lead: Pick<OutreachLead, 'address' | 'city' | 'state'> | Pick<OutreachLog, 'lead_address' | 'lead_city' | 'lead_state'>) {
  const address = 'address' in lead ? lead.address : lead.lead_address;
  const city = 'city' in lead ? lead.city : lead.lead_city;
  const state = 'state' in lead ? lead.state : lead.lead_state;
  return [address, city, state].filter(Boolean).join(', ');
}

export function isDueOverdue(dueDate: string | null) {
  return Boolean(dueDate && new Date(dueDate) < new Date());
}

export function isDueSoon(dueDate: string | null) {
  if (!dueDate) return false;
  const diff = new Date(dueDate).getTime() - Date.now();
  return diff >= 0 && diff <= 24 * 60 * 60 * 1000;
}

export function isSnoozed(snoozeUntil: string | null) {
  return Boolean(snoozeUntil && new Date(snoozeUntil) > new Date());
}

export function exportOutreachCsv(logs: OutreachLog[]) {
  const headers = ['Logged', 'Lead', 'Type', 'Response', 'Agent', 'Due date', 'Snooze until', 'Completed', 'Priority', 'Notes'];
  const rows = logs.map((log) => [
    formatDateTime(log.logged_at),
    formatLeadLocation(log),
    getCommTypeLabel(log.comm_type),
    log.response_status,
    log.agent_name || '',
    formatDateTime(log.due_date),
    formatDateTime(log.snooze_until),
    log.is_completed ? 'Yes' : 'No',
    log.priority || 'normal',
    log.notes || '',
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `outreach-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function getLeadStageLabel(stage: string | null | undefined) {
  return normalizeLeadStage(stage);
}

export function getLeadDisplayName(lead: Pick<OutreachLead, 'contact_name' | 'owner_name'>) {
  return lead.contact_name || lead.owner_name || 'Owner unknown';
}
