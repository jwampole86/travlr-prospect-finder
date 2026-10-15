export type TimelineKind = 'call' | 'sms' | 'email' | 'note' | 'stage' | 'engagement' | 'system';

export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  at: string;
  title: string;
  body?: string | null;
  status?: string | null;
  by?: string | null;
  meta?: Record<string, string | number | boolean | null>;
}

export interface RecordLead {
  id: string; address: string; city: string | null; state: string | null; zip: string | null;
  stage: string | null; pipelineStatus: string | null; score: number | null; regulation: string | null; program: string | null;
  luxury: boolean; contactName: string | null; ownerName: string | null; phone: string | null; phoneVerified: boolean; ownerVerified: boolean;
  beds: number | null; baths: number | null; price: number | null; priceType: string | null; listingUrl: string | null;
  notes: string | null; tags: string[]; lastContactedAt: string | null; nextFollowupDue: string | null; agentName: string | null; createdAt: string | null; smsOptedOut: boolean;
}

export interface RecordEngagement {
  rangeText: string | null; delivered: boolean; clicked: boolean; viewed: boolean; timeOnPage: number | null; downloaded: boolean; chatQuestions: number;
  replyText: string | null; replyIntent: string | null; temperature: string | null; contactRequested: boolean;
}

export interface RecordCall {
  id: string; startedAt: string; durationSeconds: number | null; outcome: string | null; summary: string | null; agent: string | null;
  recordingUrl: string | null; transcript: Array<{ speaker: string; text: string }>;
}

export interface LeadRecordData {
  lead: RecordLead;
  engagement: RecordEngagement | null;
  timeline: TimelineEvent[];
  calls: RecordCall[];
  counts: { texts: number; emails: number; calls: number; notes: number; replies: number };
}
