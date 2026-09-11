-- Interview Calendar & Audio Recording Migration
-- Creates: interview_sessions, interview_audio_recordings tables + storage bucket

-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.interview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_name TEXT NOT NULL,
  role_id TEXT NOT NULL,
  role_title TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 25,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  zoom_link TEXT,
  notes TEXT DEFAULT '',
  calendar_invite_sent BOOLEAN DEFAULT false,
  reminder_sent BOOLEAN DEFAULT false,
  candidate_email TEXT,
  candidate_profile_id UUID REFERENCES public.candidate_profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.interview_audio_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  candidate_profile_id UUID REFERENCES public.candidate_profiles(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT DEFAULT 0,
  duration_seconds INTEGER DEFAULT 0,
  mime_type TEXT DEFAULT 'audio/webm',
  transcript JSONB DEFAULT '[]'::jsonb,
  transcript_text TEXT DEFAULT '',
  transcript_status TEXT DEFAULT 'pending' CHECK (transcript_status IN ('pending', 'processing', 'completed', 'failed')),
  timestamp_markers JSONB DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_interview_sessions_scheduled_at ON public.interview_sessions(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_status ON public.interview_sessions(status);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_created_by ON public.interview_sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_interview_audio_session_id ON public.interview_audio_recordings(session_id);
CREATE INDEX IF NOT EXISTS idx_interview_audio_created_by ON public.interview_audio_recordings(created_by);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_audio_recordings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_interview_sessions" ON public.interview_sessions;
CREATE POLICY "users_manage_interview_sessions"
ON public.interview_sessions FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "users_manage_interview_audio" ON public.interview_audio_recordings;
CREATE POLICY "users_manage_interview_audio"
ON public.interview_audio_recordings FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- ─── Storage Bucket ───────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'interview-recordings',
  'interview-recordings',
  false,
  104857600,
  ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "authenticated_upload_interview_recordings" ON storage.objects;
CREATE POLICY "authenticated_upload_interview_recordings"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'interview-recordings');

DROP POLICY IF EXISTS "authenticated_read_interview_recordings" ON storage.objects;
CREATE POLICY "authenticated_read_interview_recordings"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'interview-recordings');

DROP POLICY IF EXISTS "authenticated_delete_interview_recordings" ON storage.objects;
CREATE POLICY "authenticated_delete_interview_recordings"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'interview-recordings');
