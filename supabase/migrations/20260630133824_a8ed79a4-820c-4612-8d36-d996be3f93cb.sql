
-- ===== Server admin RPCs (owner-only) =====

CREATE OR REPLACE FUNCTION public.update_server(_server_id uuid, _name text DEFAULT NULL, _icon_url text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_server_owner(_server_id, _uid) THEN RAISE EXCEPTION 'Not the owner'; END IF;
  UPDATE public.servers
     SET name = COALESCE(NULLIF(trim(_name), ''), name),
         icon_url = COALESCE(_icon_url, icon_url)
   WHERE id = _server_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_server(_server_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_server_owner(_server_id, _uid) THEN RAISE EXCEPTION 'Not the owner'; END IF;
  DELETE FROM public.servers WHERE id = _server_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rename_server_channel(_channel_id uuid, _name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _srv uuid; _conv uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'Name required'; END IF;
  SELECT server_id, conversation_id INTO _srv, _conv FROM public.server_channels WHERE id = _channel_id;
  IF _srv IS NULL THEN RAISE EXCEPTION 'Channel not found'; END IF;
  IF NOT public.is_server_owner(_srv, _uid) THEN RAISE EXCEPTION 'Not the owner'; END IF;
  UPDATE public.server_channels SET name = trim(_name) WHERE id = _channel_id;
  IF _conv IS NOT NULL THEN UPDATE public.conversations SET name = trim(_name) WHERE id = _conv; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_server_channel(_channel_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _srv uuid; _conv uuid; _count int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT server_id, conversation_id INTO _srv, _conv FROM public.server_channels WHERE id = _channel_id;
  IF _srv IS NULL THEN RAISE EXCEPTION 'Channel not found'; END IF;
  IF NOT public.is_server_owner(_srv, _uid) THEN RAISE EXCEPTION 'Not the owner'; END IF;
  SELECT count(*) INTO _count FROM public.server_channels WHERE server_id = _srv;
  IF _count <= 1 THEN RAISE EXCEPTION 'CANNOT_DELETE_LAST_CHANNEL' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM public.server_channels WHERE id = _channel_id;
  IF _conv IS NOT NULL THEN DELETE FROM public.conversations WHERE id = _conv; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.kick_server_member(_server_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _owner uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_server_owner(_server_id, _uid) THEN RAISE EXCEPTION 'Not the owner'; END IF;
  SELECT owner_id INTO _owner FROM public.servers WHERE id = _server_id;
  IF _user_id = _owner THEN RAISE EXCEPTION 'CANNOT_KICK_OWNER' USING ERRCODE = 'P0001'; END IF;
  DELETE FROM public.server_members WHERE server_id = _server_id AND user_id = _user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_server_ownership(_server_id uuid, _new_owner uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_server_owner(_server_id, _uid) THEN RAISE EXCEPTION 'Not the owner'; END IF;
  IF _new_owner = _uid THEN RAISE EXCEPTION 'ALREADY_OWNER' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.server_members WHERE server_id = _server_id AND user_id = _new_owner) THEN
    RAISE EXCEPTION 'NOT_A_MEMBER' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.servers SET owner_id = _new_owner WHERE id = _server_id;
  UPDATE public.server_members SET role = 'owner' WHERE server_id = _server_id AND user_id = _new_owner;
  UPDATE public.server_members SET role = 'member' WHERE server_id = _server_id AND user_id = _uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_server_invite(_invite_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _srv uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT server_id INTO _srv FROM public.server_invites WHERE id = _invite_id;
  IF _srv IS NULL THEN RETURN; END IF;
  IF NOT public.is_server_owner(_srv, _uid) THEN RAISE EXCEPTION 'Not the owner'; END IF;
  DELETE FROM public.server_invites WHERE id = _invite_id;
END;
$$;
