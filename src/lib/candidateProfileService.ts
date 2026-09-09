import { createClient } from '@/lib/supabase/client';

export interface SaveCandidateProfileInput {
  candidateName: string;
  roleId: string;
  roleTitle: string;
  interviewDate?: string;
  durationSeconds: number;
  overallScore?: 'strong_yes' | 'yes' | 'maybe' | 'no' | null;
  notes?: string;
  followUpStatus?: 'pending' | 'scheduled' | 'completed' | 'rejected' | 'hired';
  questionsCovered: number;
  questionsTotal: number;
  transcript: Array<{ speaker: string; text: string; timestamp: string }>;
  aiSuggestions: Array<{ text: string; timestamp: string }>;
  questionChecklist: Array<{ id: string; question: string; completed: boolean }>;
  tags?: string[];
  createdBy?: string;
  callbackDate?: string | null;
  callbackNotes?: string | null;
  recordingConsentConfirmed?: boolean;
  recordingConsentTimestamp?: string | null;
}

export async function saveCandidateProfile(input: SaveCandidateProfileInput): Promise<{ id: string } | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('candidate_profiles')
    .insert({
      candidate_name: input.candidateName,
      role_id: input.roleId,
      role_title: input.roleTitle,
      interview_date: input.interviewDate || new Date().toISOString(),
      duration_seconds: input.durationSeconds,
      overall_score: input.overallScore || null,
      notes: input.notes || '',
      follow_up_status: input.followUpStatus || 'pending',
      questions_covered: input.questionsCovered,
      questions_total: input.questionsTotal,
      transcript: input.transcript,
      ai_suggestions: input.aiSuggestions,
      question_checklist: input.questionChecklist,
      tags: input.tags || [],
      created_by: input.createdBy || null,
      callback_date: input.callbackDate || null,
      callback_notes: input.callbackNotes || null,
      recording_consent_confirmed: input.recordingConsentConfirmed ?? false,
      recording_consent_timestamp: input.recordingConsentTimestamp || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[candidateProfileService] save error:', error);
    return null;
  }

  return data;
}
