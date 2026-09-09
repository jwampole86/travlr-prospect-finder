-- Storage bucket for homeowner document uploads
-- This creates the bucket and sets up public access policies

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'homeowner-documents',
  'homeowner-documents',
  true,
  52428800, -- 50MB limit
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated homeowners to upload their own documents
DROP POLICY IF EXISTS "homeowners_upload_documents" ON storage.objects;
CREATE POLICY "homeowners_upload_documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'homeowner-documents'
  AND auth.uid() IS NOT NULL
);

-- Allow authenticated users to read documents
DROP POLICY IF EXISTS "homeowners_read_documents" ON storage.objects;
CREATE POLICY "homeowners_read_documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'homeowner-documents');

-- Allow homeowners to delete their own documents (path starts with their lead folder)
DROP POLICY IF EXISTS "homeowners_delete_documents" ON storage.objects;
CREATE POLICY "homeowners_delete_documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'homeowner-documents'
  AND auth.uid() IS NOT NULL
);
