CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN auth.uid() IS NOT NULL AND _user_id <> auth.uid() THEN false
      ELSE EXISTS (
        SELECT 1
        FROM public.conversation_participants
        WHERE conversation_id = _conversation_id
          AND user_id = _user_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.conversations c
        WHERE c.id = _conversation_id
          AND c.server_id IS NOT NULL
          AND public.is_server_member(c.server_id, _user_id)
      )
    END
$$;

REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated;