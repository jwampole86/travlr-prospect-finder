export interface EscalatedTouchpoint {
  id: string;
  channel: 'sms' | 'email' | 'call';
  status: string;
  sentAt: string;
  direction: 'inbound' | 'outbound' | 'unknown';
  body: string | null;
  kind: string | null;
  twilioStatus: string | null;
  recipient: string | null;
  failureReason: string | null;
}

export interface EscalatedCall {
  id: string;
  startedAt: string;
  durationSeconds: number | null;
  recordingUrl: string | null;
  transcript: string | null;
  outcome: string | null;
}

export interface EscalatedLead {
  id: string;
  displayName: string;
  ownerName: string | null;
  contactName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  contactPhone: string | null;
  stage: string;
  pipelineStatus: string | null;
  cadenceStep: number;
  lastContactedAt: string | null;
  escalatedAt: string | null;
  escalationReason: string | null;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  nextScheduledTouchAt: string | null;
  touches: EscalatedTouchpoint[];
  calls: EscalatedCall[];
  latestActivityNote: string | null;
}

export interface EscalatedSummary {
  total: number;
  assigned: number;
  unassigned: number;
  callbackScheduled: number;
  escalatedLast24h: number;
}

export interface EscalatedLeadsPageData {
  summary: EscalatedSummary;
  leads: EscalatedLead[];
}
