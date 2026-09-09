/**
 * Call Session Service — Supabase-persisted call sessions
 * Replaces localStorage-only recent calls with full Supabase persistence.
 * Supports search, lead filtering, and click-to-resume for in-progress calls.
 */

import { createClient } from '@/lib/supabase/client';

export interface CallSession {
  id: string;
  user_id: string;
  lead_id: string | null;
  lead_address: string | null;
  lead_state: string | null;
  agent_name: string | null;
  contact_name: string | null;
  phone_number: string | null;
  call_sid: string | null;
  portfolio_state: string | null;
  base_script_variant: string;
  consent_acknowledged: boolean;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  transcript: TranscriptEntry[];
  suggestions_count: number;
  outcome: string | null;
  call_outcome: CallOutcome | null;
  disposition_notes: string | null;
  notes: string | null;
  call_summary: CallSummary | null;
  summary_generated_at: string | null;
  is_in_progress: boolean;
  created_at: string;
  updated_at: string;
}

export interface TranscriptEntry {
  id: string;
  speaker: 'Agent' | 'Homeowner';
  text: string;
  timestamp: string;
}

export type CallOutcome = 'interested' | 'not_interested' | 'callback' | 'voicemail' | 'no_answer' | 'other';

export interface CallSummary {
  key_points: string[];
  objections: string[];
  next_steps: string[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  sentiment_explanation: string;
  homeowner_interest_level: 'high' | 'medium' | 'low' | 'unknown';
  summary_text: string;
}

export interface CreateCallSessionParams {
  leadId?: string;
  leadAddress?: string;
  leadState?: string;
  agentName?: string;
  contactName?: string;
  phoneNumber?: string;
  callSid?: string;
  portfolioState?: string;
  baseScriptVariant?: string;
}

export interface UpdateCallSessionParams {
  endedAt?: string;
  durationSeconds?: number;
  transcript?: TranscriptEntry[];
  suggestionsCount?: number;
  outcome?: string;
  callOutcome?: CallOutcome;
  dispositionNotes?: string;
  notes?: string;
  isInProgress?: boolean;
  callSid?: string;
}

export interface CallSessionFilters {
  leadId?: string;
  search?: string;
  outcome?: CallOutcome | null;
  dateFrom?: string;
  dateTo?: string;
  isInProgress?: boolean;
  limit?: number;
  offset?: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const callSessionService = {
  /**
   * Create a new call session when a call starts.
   */
  async create(params: CreateCallSessionParams): Promise<CallSession | null> {
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('call_sessions')
        .insert({
          user_id: user.id,
          lead_id: params.leadId ?? null,
          lead_address: params.leadAddress ?? null,
          lead_state: params.leadState ?? null,
          agent_name: params.agentName ?? null,
          contact_name: params.contactName ?? null,
          phone_number: params.phoneNumber ?? null,
          call_sid: params.callSid ?? null,
          portfolio_state: params.portfolioState ?? null,
          base_script_variant: params.baseScriptVariant ?? 'initial_outreach',
          consent_acknowledged: false,
          is_in_progress: true,
          started_at: new Date().toISOString(),
          transcript: [],
          suggestions_count: 0,
        })
        .select()
        .single();

      if (error) {
        console.warn('[callSessionService] create error:', error.message);
        return null;
      }
      return data as CallSession;
    } catch (err) {
      console.warn('[callSessionService] create exception:', err);
      return null;
    }
  },

  /**
   * Update a call session (e.g., on end, transcript update, outcome).
   */
  async update(sessionId: string, params: UpdateCallSessionParams): Promise<boolean> {
    const supabase = createClient();
    try {
      const updateData: Record<string, unknown> = {};
      if (params.endedAt !== undefined) updateData.ended_at = params.endedAt;
      if (params.durationSeconds !== undefined) updateData.duration_seconds = params.durationSeconds;
      if (params.transcript !== undefined) updateData.transcript = params.transcript;
      if (params.suggestionsCount !== undefined) updateData.suggestions_count = params.suggestionsCount;
      if (params.outcome !== undefined) updateData.outcome = params.outcome;
      if (params.callOutcome !== undefined) updateData.call_outcome = params.callOutcome;
      if (params.dispositionNotes !== undefined) updateData.disposition_notes = params.dispositionNotes;
      if (params.notes !== undefined) updateData.notes = params.notes;
      if (params.isInProgress !== undefined) updateData.is_in_progress = params.isInProgress;
      if (params.callSid !== undefined) updateData.call_sid = params.callSid;

      const { error } = await supabase
        .from('call_sessions')
        .update(updateData)
        .eq('id', sessionId);

      if (error) {
        console.warn('[callSessionService] update error:', error.message);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Fetch recent call sessions with optional search/filter.
   */
  async getRecent(filters: CallSessionFilters = {}): Promise<CallSession[]> {
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      let query = supabase
        .from('call_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('started_at', { ascending: false })
        .limit(filters.limit ?? 50);

      if (filters.leadId) {
        query = query.eq('lead_id', filters.leadId);
      }
      if (filters.outcome) {
        query = query.eq('call_outcome', filters.outcome);
      }
      if (filters.isInProgress !== undefined) {
        query = query.eq('is_in_progress', filters.isInProgress);
      }
      if (filters.dateFrom) {
        query = query.gte('started_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('started_at', filters.dateTo);
      }
      if (filters.search) {
        query = query.or(
          `contact_name.ilike.%${filters.search}%,lead_address.ilike.%${filters.search}%,phone_number.ilike.%${filters.search}%`
        );
      }
      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit ?? 50) - 1);
      }

      const { data, error } = await query;
      if (error) {
        console.warn('[callSessionService] getRecent error:', error.message);
        return [];
      }
      return (data ?? []) as CallSession[];
    } catch {
      return [];
    }
  },

  /**
   * Get a single call session by ID.
   */
  async getById(sessionId: string): Promise<CallSession | null> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('call_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error) return null;
      return data as CallSession;
    } catch {
      return null;
    }
  },

  /**
   * Get all in-progress sessions for the current user (for resume prompts).
   */
  async getInProgress(): Promise<CallSession[]> {
    return this.getRecent({ isInProgress: true, limit: 5 });
  },

  /**
   * Get sessions for a specific lead.
   */
  async getForLead(leadId: string): Promise<CallSession[]> {
    return this.getRecent({ leadId, limit: 20 });
  },

  /**
   * Mark a session as ended and set final fields.
   */
  async endSession(
    sessionId: string,
    durationSeconds: number,
    transcript: TranscriptEntry[],
    callOutcome?: CallOutcome,
    dispositionNotes?: string
  ): Promise<boolean> {
    return this.update(sessionId, {
      endedAt: new Date().toISOString(),
      durationSeconds,
      transcript,
      isInProgress: false,
      callOutcome,
      dispositionNotes,
    });
  },

  /**
   * Trigger Claude summarization for a completed session.
   */
  async generateSummary(sessionId: string, transcript: TranscriptEntry[]): Promise<CallSummary | null> {
    try {
      const res = await fetch('/api/twilio/voice/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, transcript }),
      });
      if (!res.ok) return null;
      const { summary } = await res.json();
      return summary as CallSummary;
    } catch {
      return null;
    }
  },
};
