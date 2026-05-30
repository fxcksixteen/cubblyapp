DROP POLICY IF EXISTS "Notes attachments — users read own" ON storage.objects;
DROP POLICY IF EXISTS "Notes attachments — users upload own" ON storage.objects;
DROP POLICY IF EXISTS "Notes attachments — users update own" ON storage.objects;
DROP POLICY IF EXISTS "Notes attachments — users delete own" ON storage.objects;

CREATE POLICY "Notes attachments — users read own"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'notes-attachments'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND ((storage.foldername(name))[1])::uuid = auth.uid()
);

CREATE POLICY "Notes attachments — users upload own"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'notes-attachments'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND ((storage.foldername(name))[1])::uuid = auth.uid()
);

CREATE POLICY "Notes attachments — users update own"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'notes-attachments'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND ((storage.foldername(name))[1])::uuid = auth.uid()
)
WITH CHECK (
  bucket_id = 'notes-attachments'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND ((storage.foldername(name))[1])::uuid = auth.uid()
);

CREATE POLICY "Notes attachments — users delete own"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'notes-attachments'
  AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND ((storage.foldername(name))[1])::uuid = auth.uid()
);