CREATE OR REPLACE FUNCTION public.is_server_member(_server_id uuid, _user_id uuid)
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
        FROM public.server_members
        WHERE server_id = _server_id
          AND user_id = _user_id
      )
    END
$$;

CREATE OR REPLACE FUNCTION public.is_server_owner(_server_id uuid, _user_id uuid)
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
        FROM public.servers
        WHERE id = _server_id
          AND owner_id = _user_id
      )
    END
$$;

REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_server_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_server_owner(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_message(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_server_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_server_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_message(uuid) TO authenticated;