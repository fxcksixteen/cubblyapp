
-- 1. Tighten call_participants INSERT: must be a conversation participant
DROP POLICY IF EXISTS "Users can insert their own call participation" ON public.call_participants;
CREATE POLICY "Users can insert their own call participation"
ON public.call_participants
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.call_events ce
    WHERE ce.id = call_participants.call_event_id
      AND public.is_conversation_participant(ce.conversation_id, auth.uid())
  )
);

-- 2. Add UPDATE policy for messages so editing is possible (sender + still a participant)
DROP POLICY IF EXISTS "Users can edit their own messages" ON public.messages;
CREATE POLICY "Users can edit their own messages"
ON public.messages
FOR UPDATE
TO authenticated
USING (
  auth.uid() = sender_id
  AND public.is_conversation_participant(conversation_id, auth.uid())
)
WITH CHECK (
  auth.uid() = sender_id
  AND public.is_conversation_participant(conversation_id, auth.uid())
);

-- 3. Fix broken group-pictures storage policies (was matching against c.name not the storage object name)
DROP POLICY IF EXISTS "Group owners can upload group pictures" ON storage.objects;
CREATE POLICY "Group owners can upload group pictures"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'group-pictures'
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE (c.id)::text = (storage.foldername(name))[1]
      AND c.is_group = true
      AND c.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Group owners can update group pictures" ON storage.objects;
CREATE POLICY "Group owners can update group pictures"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'group-pictures'
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE (c.id)::text = (storage.foldername(name))[1]
      AND c.is_group = true
      AND c.owner_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'group-pictures'
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE (c.id)::text = (storage.foldername(name))[1]
      AND c.is_group = true
      AND c.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Group owners can delete group pictures" ON storage.objects;
CREATE POLICY "Group owners can delete group pictures"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'group-pictures'
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE (c.id)::text = (storage.foldername(name))[1]
      AND c.is_group = true
      AND c.owner_id = auth.uid()
  )
);

-- 4. Revoke EXECUTE on internal-only / RLS-helper SECURITY DEFINER functions
--    These are called by triggers or referenced inside RLS policies (which run
--    as the table owner) and must NOT be directly callable by clients.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_conversation_on_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_push_on_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_message(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_server_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_server_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.accrue_message_coins() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.accrue_activity_coins(integer, integer) FROM PUBLIC, anon;
