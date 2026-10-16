export type RetrySourceTab = 'sync' | 'messaging' | 'enrichment';

export interface RetrySummary {
  syncFailures: number;
  smsFailures: number;
  emailFailures: number;
  enrichmentFailures: number;
  legacyQueueRows: number;
}

export interface SyncFailureItem {
  id: string;
  operationType: string;
  operationId: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  lastError: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  portfolio: string | null;
  stateCode: string | null;
  sourceName: string | null;
  retryAction:
    | { type: 'sync_execute'; label: string; payload: { portfolio: string } }
    | { type: 'trulia_ingest'; label: string; payload: { stateCode: string } }
    | { type: 'lead_enrichment'; label: string; payload: { leadId: string } }
    | null;
}

export interface MessagingFailureItem {
  id: string;
  leadId: string | null;
  leadLabel: string;
  propertyLabel: string;
  channel: 'sms' | 'email';
  status: string;
  sentAt: string | null;
  updatedAt: string | null;
  preview: string;
  subject: string | null;
  recipient: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  sequenceName: string | null;
  retryable: boolean;
  retryDisabledReason: string | null;
  retryPayload:
    | { kind: 'sms'; leadId: string; to: string; message: string; sequenceName?: string | null; agentId?: string | null; portfolio?: string | null; bulkBatch?: boolean }
    | { kind: 'email'; leadId: string; to: string; subject: string; message: string; agentId?: string | null; propertyAddress?: string | null }
    | null;
}

export interface EnrichmentFailureItem {
  id: string;
  leadId: string;
  leadLabel: string;
  propertyLabel: string;
  stage: string;
  errorCode: string;
  errorMessage: string;
  apiProvider: string | null;
  apiHttpStatus: number | null;
  retryCount: number;
  lastRetryAt: string | null;
  isTransient: boolean;
  createdAt: string;
  enrichmentStatus: string | null;
  retryable: boolean;
  retryDisabledReason: string | null;
}
