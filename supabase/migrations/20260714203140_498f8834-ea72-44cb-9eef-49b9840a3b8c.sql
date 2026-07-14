DROP POLICY IF EXISTS "Authenticated users can upload group pictures" ON storage.objects;
DROP POLICY IF EXISTS "Users can update group pictures they uploaded" ON storage.objects;
DROP POLICY IF EXISTS "Group owners can upload group pictures" ON storage.objects;
DROP POLICY IF EXISTS "Group owners can update group pictures" ON storage.objects;
DROP POLICY IF EXISTS "Group owners can delete group pictures" ON storage.objects;

CREATE POLICY "Group owners can upload group pictures"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'group-pictures'
  AND (storage.foldername(storage.objects.name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = ((storage.foldername(storage.objects.name))[1])::uuid
      AND c.is_group = true
      AND c.owner_id = auth.uid()
  )
);

CREATE POLICY "Group owners can update group pictures"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'group-pictures'
  AND (storage.foldername(storage.objects.name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = ((storage.foldername(storage.objects.name))[1])::uuid
      AND c.is_group = true
      AND c.owner_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'group-pictures'
  AND (storage.foldername(storage.objects.name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = ((storage.foldername(storage.objects.name))[1])::uuid
      AND c.is_group = true
      AND c.owner_id = auth.uid()
  )
);

CREATE POLICY "Group owners can delete group pictures"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'group-pictures'
  AND (storage.foldername(storage.objects.name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = ((storage.foldername(storage.objects.name))[1])::uuid
      AND c.is_group = true
      AND c.owner_id = auth.uid()
  )
);