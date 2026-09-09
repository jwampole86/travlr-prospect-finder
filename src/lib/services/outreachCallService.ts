/**
 * Outreach Call Service
 * Captures call duration, outcome (connected/voicemail/no-answer),
 * recording URL, and timestamp per lead contact.
 * Writes to outreach_call_log and updates call_sessions.
 */

import { createClient } from '@/lib/supabase/client';

export type CallOutcomeType =
  | 'connected' |'voicemail' |'no_answer' |'busy' |'failed' |'interested' |'not_interested' |'callback' |'questionnaire_sent' |'follow_up_scheduled' |'proposal_conversation' |'other';

export interface OutreachCallRecord {
  id: string;
  lead_id: string | null;
  session_id: string | null;
  agent_id: string | null;
  agent_name: string | null;
  contact_name: string | null;
  phone_number: string | null;
  call_sid: string | null;
  outcome: CallOutcomeType;
  duration_seconds: number;
  recording_url: string | null;
  recording_sid: string | null;
  called_at: string;
  script_variant: string | null;
  portfolio_state: string | null;
  disposition_notes: string | null;
  transcript_length: number;
  suggestions_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface LogCallParams {
  leadId?: string;
  sessionId?: string;
  agentName?: string;
  contactName?: string;
  phoneNumber?: string;
  callSid?: string;
  outcome: CallOutcomeType;
  durationSeconds: number;
  recordingUrl?: string;
  recordingSid?: string;
  calledAt?: string;
  scriptVariant?: string;
  portfolioState?: string;
  dispositionNotes?: string;
  transcriptLength?: number;
  suggestionsCount?: number;
  metadata?: Record<string, unknown>;
}

export interface CallLogFilters {
  leadId?: string;
  outcome?: CallOutcomeType;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

// ─── Outcome display helpers ──────────────────────────────────────────────────

export const OUTCOME_LABELS: Record<CallOutcomeType, string> = {
  connected: 'Connected',
  voicemail: 'Voicemail',
  no_answer: 'No Answer',
  busy: 'Busy',
  failed: 'Failed',
  interested: 'Interested',
  not_interested: 'Not Interested',
  callback: 'Callback Scheduled',
  questionnaire_sent: 'Questionnaire Sent',
  follow_up_scheduled: 'Follow-Up Scheduled',
  proposal_conversation: 'Proposal Conversation',
  other: 'Other',
};

export const OUTCOME_COLORS: Record<CallOutcomeType, string> = {
  connected: 'text-green-700 bg-green-50 border-green-200',
  voicemail: 'text-amber-700 bg-amber-50 border-amber-200',
  no_answer: 'text-gray-600 bg-gray-50 border-gray-200',
  busy: 'text-orange-700 bg-orange-50 border-orange-200',
  failed: 'text-red-700 bg-red-50 border-red-200',
  interested: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  not_interested: 'text-red-700 bg-red-50 border-red-200',
  callback: 'text-blue-700 bg-blue-50 border-blue-200',
  questionnaire_sent: 'text-purple-700 bg-purple-50 border-purple-200',
  follow_up_scheduled: 'text-blue-700 bg-blue-50 border-blue-200',
  proposal_conversation: 'text-indigo-700 bg-indigo-50 border-indigo-200',
  other: 'text-gray-600 bg-gray-50 border-gray-200',
};

// ─── Service ──────────────────────────────────────────────────────────────────

export const outreachCallService = {
  /**
   * Log a completed call to outreach_call_log.
   * Called after every call ends (regardless of outcome).
   */
  async logCall(params: LogCallParams): Promise<OutreachCallRecord | null> {
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('outreach_call_log')
        .insert({
          lead_id: params.leadId ?? null,
          session_id: params.sessionId ?? null,
          agent_id: user?.id ?? null,
          agent_name: params.agentName ?? null,
          contact_name: params.contactName ?? null,
          phone_number: params.phoneNumber ?? null,
          call_sid: params.callSid ?? null,
          outcome: params.outcome,
          duration_seconds: params.durationSeconds,
          recording_url: params.recordingUrl ?? null,
          recording_sid: params.recordingSid ?? null,
          called_at: params.calledAt ?? new Date().toISOString(),
          script_variant: params.scriptVariant ?? null,
          portfolio_state: params.portfolioState ?? null,
          disposition_notes: params.dispositionNotes ?? null,
          transcript_length: params.transcriptLength ?? 0,
          suggestions_count: params.suggestionsCount ?? 0,
          metadata: params.metadata ?? {},
        })
        .select()
        .single();

      if (error) {
        console.warn('[outreachCallService] logCall error:', error.message);
        return null;
      }
      return data as OutreachCallRecord;
    } catch (err) {
      console.warn('[outreachCallService] logCall exception:', err);
      return null;
    }
  },

  /**
   * Get call history for a specific lead.
   */
  async getCallsForLead(leadId: string, limit = 20): Promise<OutreachCallRecord[]> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('outreach_call_log')
        .select('*')
        .eq('lead_id', leadId)
        .order('called_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('[outreachCallService] getCallsForLead error:', error.message);
        return [];
      }
      return (data ?? []) as OutreachCallRecord[];
    } catch {
      return [];
    }
  },

  /**
   * Get recent calls with optional filters.
   */
  async getRecentCalls(filters: CallLogFilters = {}): Promise<OutreachCallRecord[]> {
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      let query = supabase
        .from('outreach_call_log')
        .select('*')
        .eq('agent_id', user.id)
        .order('called_at', { ascending: false })
        .limit(filters.limit ?? 50);

      if (filters.leadId) query = query.eq('lead_id', filters.leadId);
      if (filters.outcome) query = query.eq('outcome', filters.outcome);
      if (filters.dateFrom) query = query.gte('called_at', filters.dateFrom);
      if (filters.dateTo) query = query.lte('called_at', filters.dateTo);
      if (filters.offset) query = query.range(filters.offset, filters.offset + (filters.limit ?? 50) - 1);

      const { data, error } = await query;
      if (error) {
        console.warn('[outreachCallService] getRecentCalls error:', error.message);
        return [];
      }
      return (data ?? []) as OutreachCallRecord[];
    } catch {
      return [];
    }
  },

  /**
   * Get call outcome summary for a lead (counts by outcome type).
   */
  async getLeadCallSummary(leadId: string): Promise<{
    totalCalls: number;
    totalDurationSeconds: number;
    lastCalledAt: string | null;
    outcomes: Partial<Record<CallOutcomeType, number>>;
    hasRecording: boolean;
  }> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('outreach_call_log')
        .select('outcome, duration_seconds, called_at, recording_url')
        .eq('lead_id', leadId)
        .order('called_at', { ascending: false });

      if (error || !data) return { totalCalls: 0, totalDurationSeconds: 0, lastCalledAt: null, outcomes: {}, hasRecording: false };

      const outcomes: Partial<Record<CallOutcomeType, number>> = {};
      let totalDuration = 0;
      let hasRecording = false;

      for (const row of data) {
        const o = row.outcome as CallOutcomeType;
        outcomes[o] = (outcomes[o] ?? 0) + 1;
        totalDuration += row.duration_seconds ?? 0;
        if (row.recording_url) hasRecording = true;
      }

      return {
        totalCalls: data.length,
        totalDurationSeconds: totalDuration,
        lastCalledAt: data[0]?.called_at ?? null,
        outcomes,
        hasRecording,
      };
    } catch {
      return { totalCalls: 0, totalDurationSeconds: 0, lastCalledAt: null, outcomes: {}, hasRecording: false };
    }
  },

  /**
   * Update recording URL on an existing call log entry (called from Twilio webhook).
   */
  async updateRecordingUrl(callSid: string, recordingUrl: string, recordingSid?: string): Promise<boolean> {
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('outreach_call_log')
        .update({ recording_url: recordingUrl, recording_sid: recordingSid ?? null })
        .eq('call_sid', callSid);

      if (error) {
        console.warn('[outreachCallService] updateRecordingUrl error:', error.message);
        return false;
      }

      // Also update call_sessions
      await supabase
        .from('call_sessions')
        .update({ recording_url: recordingUrl, recording_sid: recordingSid ?? null })
        .eq('call_sid', callSid);

      return true;
    } catch {
      return false;
    }
  },

  /**
   * Format duration as mm:ss string.
   */
  formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  },
};

function CallOutcome(...args: any[]): any {
  // eslint-disable-next-line no-console
  console.warn('Placeholder: CallOutcome is not implemented yet.', args);
  return null;
}

export { CallOutcome };