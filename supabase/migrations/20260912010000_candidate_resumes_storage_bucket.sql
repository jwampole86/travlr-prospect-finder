-- ─── Candidate Resume Storage Bucket ──────────────────────────────────────────
-- The upload-resume API route was previously writing PDF/DOCX files into the
-- 'interview-recordings' bucket, whose allowed_mime_types only permits audio
-- formats — every resume upload was silently rejected at the storage layer.
-- This adds a dedicated bucket for resume documents.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'candidate-resumes',
  'candidate-resumes',
  false,
  20971520, -- 20MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "authenticated_upload_candidate_resumes" ON storage.objects;
CREATE POLICY "authenticated_upload_candidate_resumes"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'candidate-resumes');

DROP POLICY IF EXISTS "authenticated_read_candidate_resumes" ON storage.objects;
CREATE POLICY "authenticated_read_candidate_resumes"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'candidate-resumes');

DROP POLICY IF EXISTS "authenticated_delete_candidate_resumes" ON storage.objects;
CREATE POLICY "authenticated_delete_candidate_resumes"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'candidate-resumes');
