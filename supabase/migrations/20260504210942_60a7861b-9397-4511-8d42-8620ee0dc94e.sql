
-- ============================================================
-- Bit 9: Servers (communities) — schema + RPCs
-- ============================================================

-- Servers (a.k.a. guilds/communities)
CREATE TABLE public.servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  icon_url text,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_servers_owner ON public.servers(owner_id);

-- Membership
CREATE TABLE public.server_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member', -- 'owner' | 'admin' | 'member'
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, user_id)
);
CREATE INDEX idx_server_members_user ON public.server_members(user_id);
CREATE INDEX idx_server_members_server ON public.server_members(server_id);

-- Invites (short codes)
CREATE TABLE public.server_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  max_uses integer,
  uses integer NOT NULL DEFAULT 0
);
CREATE INDEX idx_server_invites_server ON public.server_invites(server_id);

-- Channels (text or voice). Each text channel maps 1:1 to a conversation row.
CREATE TABLE public.server_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'text', -- 'text' | 'voice'
  category text,
  position integer NOT NULL DEFAULT 0,
  conversation_id uuid, -- for text channels
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_server_channels_server ON public.server_channels(server_id);

-- Add server_id to conversations so RLS can grant access via server membership
ALTER TABLE public.conversations
  ADD COLUMN server_id uuid REFERENCES public.servers(id) ON DELETE CASCADE,
  ADD COLUMN server_channel_id uuid REFERENCES public.server_channels(id) ON DELETE CASCADE;

-- Membership-check helper
CREATE OR REPLACE FUNCTION public.is_server_member(_server_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.server_members WHERE server_id = _server_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_server_owner(_server_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.servers WHERE id = _server_id AND owner_id = _user_id
  );
$$;

-- Extend the conversation-participant check so server members can read/post in
-- channel-conversations without needing rows in conversation_participants.
CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conversation_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = _conversation_id
      AND c.server_id IS NOT NULL
      AND public.is_server_member(c.server_id, _user_id)
  );
$$;

-- ───── RLS ─────
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_channels ENABLE ROW LEVEL SECURITY;

-- servers
CREATE POLICY "Members view their servers" ON public.servers FOR SELECT TO authenticated
USING (public.is_server_member(id, auth.uid()));
CREATE POLICY "Owners update their servers" ON public.servers FOR UPDATE TO authenticated
USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners delete their servers" ON public.servers FOR DELETE TO authenticated
USING (auth.uid() = owner_id);
-- INSERT happens only via RPC.

-- server_members
CREATE POLICY "Members view co-members" ON public.server_members FOR SELECT TO authenticated
USING (public.is_server_member(server_id, auth.uid()));
CREATE POLICY "Users leave own membership" ON public.server_members FOR DELETE TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Owners remove members" ON public.server_members FOR DELETE TO authenticated
USING (public.is_server_owner(server_id, auth.uid()));

-- server_invites
CREATE POLICY "Members view invites" ON public.server_invites FOR SELECT TO authenticated
USING (public.is_server_member(server_id, auth.uid()));
CREATE POLICY "Members create invites" ON public.server_invites FOR INSERT TO authenticated
WITH CHECK (public.is_server_member(server_id, auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Owners delete invites" ON public.server_invites FOR DELETE TO authenticated
USING (public.is_server_owner(server_id, auth.uid()));

-- server_channels
CREATE POLICY "Members view channels" ON public.server_channels FOR SELECT TO authenticated
USING (public.is_server_member(server_id, auth.uid()));
CREATE POLICY "Owners create channels" ON public.server_channels FOR INSERT TO authenticated
WITH CHECK (public.is_server_owner(server_id, auth.uid()));
CREATE POLICY "Owners update channels" ON public.server_channels FOR UPDATE TO authenticated
USING (public.is_server_owner(server_id, auth.uid())) WITH CHECK (public.is_server_owner(server_id, auth.uid()));
CREATE POLICY "Owners delete channels" ON public.server_channels FOR DELETE TO authenticated
USING (public.is_server_owner(server_id, auth.uid()));

-- ───── RPCs ─────

-- Create a new server (capped at 10 owned). Seeds a #general text channel + a "General" voice channel.
CREATE OR REPLACE FUNCTION public.create_server(_name text, _icon_url text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _owned int;
  _server_id uuid;
  _conv_id uuid;
  _chan_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'Name required'; END IF;

  SELECT count(*) INTO _owned FROM public.servers WHERE owner_id = _uid;
  IF _owned >= 10 THEN RAISE EXCEPTION 'SERVER_LIMIT_REACHED' USING ERRCODE = 'P0001'; END IF;

  INSERT INTO public.servers (name, icon_url, owner_id)
  VALUES (trim(_name), _icon_url, _uid)
  RETURNING id INTO _server_id;

  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (_server_id, _uid, 'owner');

  -- Default text channel: backed by a conversation
  INSERT INTO public.conversations (is_group, name, owner_id, server_id)
  VALUES (true, 'general', _uid, _server_id)
  RETURNING id INTO _conv_id;

  INSERT INTO public.server_channels (server_id, name, kind, position, conversation_id)
  VALUES (_server_id, 'general', 'text', 0, _conv_id)
  RETURNING id INTO _chan_id;

  UPDATE public.conversations SET server_channel_id = _chan_id WHERE id = _conv_id;

  -- Default voice channel: also backed by a conversation so we can reuse the group-call stack
  INSERT INTO public.conversations (is_group, name, owner_id, server_id)
  VALUES (true, 'General', _uid, _server_id)
  RETURNING id INTO _conv_id;

  INSERT INTO public.server_channels (server_id, name, kind, position, conversation_id)
  VALUES (_server_id, 'General', 'voice', 1, _conv_id)
  RETURNING id INTO _chan_id;

  UPDATE public.conversations SET server_channel_id = _chan_id WHERE id = _conv_id;

  RETURN _server_id;
END;
$$;

-- Create an invite code
CREATE OR REPLACE FUNCTION public.create_server_invite(_server_id uuid, _max_uses int DEFAULT NULL, _expires_in_seconds int DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _code text;
  _expires_at timestamptz;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_server_member(_server_id, _uid) THEN RAISE EXCEPTION 'Not a member'; END IF;

  -- 8-char alphanumeric, uppercase
  _code := upper(substring(replace(encode(gen_random_bytes(9), 'base64'), '/', '') from 1 for 8));
  IF _expires_in_seconds IS NOT NULL THEN
    _expires_at := now() + make_interval(secs => _expires_in_seconds);
  END IF;

  INSERT INTO public.server_invites (server_id, code, created_by, expires_at, max_uses)
  VALUES (_server_id, _code, _uid, _expires_at, _max_uses);

  RETURN _code;
END;
$$;

-- Look up an invite (callable while not yet a member)
CREATE OR REPLACE FUNCTION public.lookup_server_invite(_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _inv public.server_invites;
  _srv public.servers;
  _members int;
BEGIN
  SELECT * INTO _inv FROM public.server_invites WHERE code = upper(trim(_code));
  IF _inv IS NULL THEN RAISE EXCEPTION 'INVITE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF _inv.expires_at IS NOT NULL AND _inv.expires_at < now() THEN
    RAISE EXCEPTION 'INVITE_EXPIRED' USING ERRCODE = 'P0001';
  END IF;
  IF _inv.max_uses IS NOT NULL AND _inv.uses >= _inv.max_uses THEN
    RAISE EXCEPTION 'INVITE_USED_UP' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO _srv FROM public.servers WHERE id = _inv.server_id;
  SELECT count(*) INTO _members FROM public.server_members WHERE server_id = _srv.id;
  RETURN jsonb_build_object(
    'server_id', _srv.id,
    'name', _srv.name,
    'icon_url', _srv.icon_url,
    'member_count', _members
  );
END;
$$;

-- Join via invite code
CREATE OR REPLACE FUNCTION public.join_server_by_code(_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _inv public.server_invites;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO _inv FROM public.server_invites WHERE code = upper(trim(_code));
  IF _inv IS NULL THEN RAISE EXCEPTION 'INVITE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF _inv.expires_at IS NOT NULL AND _inv.expires_at < now() THEN
    RAISE EXCEPTION 'INVITE_EXPIRED' USING ERRCODE = 'P0001';
  END IF;
  IF _inv.max_uses IS NOT NULL AND _inv.uses >= _inv.max_uses THEN
    RAISE EXCEPTION 'INVITE_USED_UP' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.server_members (server_id, user_id, role)
  VALUES (_inv.server_id, _uid, 'member')
  ON CONFLICT (server_id, user_id) DO NOTHING;

  UPDATE public.server_invites SET uses = uses + 1 WHERE id = _inv.id;

  RETURN _inv.server_id;
END;
$$;

-- Create a channel
CREATE OR REPLACE FUNCTION public.create_server_channel(_server_id uuid, _name text, _kind text DEFAULT 'text', _category text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _conv_id uuid;
  _chan_id uuid;
  _next_pos int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_server_owner(_server_id, _uid) THEN RAISE EXCEPTION 'Not the owner'; END IF;
  IF _kind NOT IN ('text','voice') THEN RAISE EXCEPTION 'Invalid kind'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'Name required'; END IF;

  SELECT coalesce(max(position),-1) + 1 INTO _next_pos
  FROM public.server_channels WHERE server_id = _server_id;

  INSERT INTO public.conversations (is_group, name, owner_id, server_id)
  VALUES (true, trim(_name), _uid, _server_id)
  RETURNING id INTO _conv_id;

  INSERT INTO public.server_channels (server_id, name, kind, category, position, conversation_id)
  VALUES (_server_id, trim(_name), _kind, _category, _next_pos, _conv_id)
  RETURNING id INTO _chan_id;

  UPDATE public.conversations SET server_channel_id = _chan_id WHERE id = _conv_id;

  RETURN _chan_id;
END;
$$;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.servers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.server_channels;
