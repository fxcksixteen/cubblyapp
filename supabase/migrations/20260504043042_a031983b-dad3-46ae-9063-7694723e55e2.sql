
-- 1. conversation_participants self-join lockdown
DROP POLICY IF EXISTS "Users can add themselves to conversations" ON public.conversation_participants;

-- 2. Remove duplicate permissive INSERT policy on chat-attachments
DROP POLICY IF EXISTS "Users can upload chat attachments" ON storage.objects;

-- 3. Restrict group-pictures uploads to the owner of that conversation
DROP POLICY IF EXISTS "Authenticated users can upload group pictures" ON storage.objects;
CREATE POLICY "Group owners can upload group pictures"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'group-pictures'
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id::text = (storage.foldername(name))[1]
      AND c.is_group = true
      AND c.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update group pictures they uploaded" ON storage.objects;
CREATE POLICY "Group owners can update group pictures"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'group-pictures'
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id::text = (storage.foldername(name))[1]
      AND c.is_group = true
      AND c.owner_id = auth.uid()
  )
);

-- 4. Revoke direct EXECUTE on internal SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_message(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_conversation_on_message() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_push_on_message() FROM anon, authenticated;
