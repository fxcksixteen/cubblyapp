CREATE OR REPLACE FUNCTION public.mutual_friends(_other uuid)
RETURNS TABLE(user_id uuid, display_name text, username text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT CASE WHEN f.requester_id = auth.uid() THEN f.addressee_id ELSE f.requester_id END AS uid
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (f.requester_id = auth.uid() OR f.addressee_id = auth.uid())
  ), them AS (
    SELECT CASE WHEN f.requester_id = _other THEN f.addressee_id ELSE f.requester_id END AS uid
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (f.requester_id = _other OR f.addressee_id = _other)
  )
  SELECT p.user_id, p.display_name, p.username, p.avatar_url
  FROM public.profiles p
  JOIN me ON me.uid = p.user_id
  JOIN them ON them.uid = p.user_id
  WHERE auth.uid() IS NOT NULL
    AND p.user_id <> auth.uid()
    AND p.user_id <> _other
  ORDER BY p.display_name;
$$;

CREATE OR REPLACE FUNCTION public.mutual_servers(_other uuid)
RETURNS TABLE(id uuid, name text, icon_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.icon_url
  FROM public.servers s
  JOIN public.server_members a ON a.server_id = s.id AND a.user_id = auth.uid()
  JOIN public.server_members b ON b.server_id = s.id AND b.user_id = _other
  WHERE auth.uid() IS NOT NULL
  ORDER BY s.name;
$$;

REVOKE EXECUTE ON FUNCTION public.mutual_friends(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mutual_servers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mutual_friends(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mutual_servers(uuid) TO authenticated;