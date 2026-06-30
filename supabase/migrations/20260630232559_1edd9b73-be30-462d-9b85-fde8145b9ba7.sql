
CREATE TABLE IF NOT EXISTS public.server_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#99aab5',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS server_roles_server_idx ON public.server_roles(server_id, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.server_roles TO authenticated;
GRANT ALL ON public.server_roles TO service_role;
ALTER TABLE public.server_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read server roles"
  ON public.server_roles FOR SELECT TO authenticated
  USING (public.is_server_member(server_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.server_member_roles (
  server_id uuid NOT NULL REFERENCES public.servers(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.server_roles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, user_id)
);
CREATE INDEX IF NOT EXISTS server_member_roles_user_idx ON public.server_member_roles(server_id, user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.server_member_roles TO authenticated;
GRANT ALL ON public.server_member_roles TO service_role;
ALTER TABLE public.server_member_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read role assignments"
  ON public.server_member_roles FOR SELECT TO authenticated
  USING (public.is_server_member(server_id, auth.uid()));

-- ============= RPCs (owner-only mutations) =============

CREATE OR REPLACE FUNCTION public.create_server_role(_server_id uuid, _name text, _color text DEFAULT '#99aab5')
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _id uuid; _next int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_server_owner(_server_id, _uid) THEN RAISE EXCEPTION 'Not the owner'; END IF;
  IF coalesce(trim(_name),'') = '' THEN RAISE EXCEPTION 'Name required'; END IF;
  SELECT coalesce(max(position),-1) + 1 INTO _next FROM public.server_roles WHERE server_id = _server_id;
  INSERT INTO public.server_roles (server_id, name, color, position)
  VALUES (_server_id, trim(_name), coalesce(_color,'#99aab5'), _next)
  RETURNING id INTO _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.update_server_role(_role_id uuid, _name text DEFAULT NULL, _color text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _srv uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT server_id INTO _srv FROM public.server_roles WHERE id = _role_id;
  IF _srv IS NULL THEN RAISE EXCEPTION 'Role not found'; END IF;
  IF NOT public.is_server_owner(_srv, _uid) THEN RAISE EXCEPTION 'Not the owner'; END IF;
  UPDATE public.server_roles
     SET name = COALESCE(NULLIF(trim(_name), ''), name),
         color = COALESCE(_color, color)
   WHERE id = _role_id;
END $$;

CREATE OR REPLACE FUNCTION public.delete_server_role(_role_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _srv uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT server_id INTO _srv FROM public.server_roles WHERE id = _role_id;
  IF _srv IS NULL THEN RETURN; END IF;
  IF NOT public.is_server_owner(_srv, _uid) THEN RAISE EXCEPTION 'Not the owner'; END IF;
  DELETE FROM public.server_roles WHERE id = _role_id;
END $$;

CREATE OR REPLACE FUNCTION public.assign_server_role(_role_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _srv uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT server_id INTO _srv FROM public.server_roles WHERE id = _role_id;
  IF _srv IS NULL THEN RAISE EXCEPTION 'Role not found'; END IF;
  IF NOT public.is_server_owner(_srv, _uid) THEN RAISE EXCEPTION 'Not the owner'; END IF;
  IF NOT public.is_server_member(_srv, _user_id) THEN RAISE EXCEPTION 'User not a member'; END IF;
  INSERT INTO public.server_member_roles (server_id, role_id, user_id)
  VALUES (_srv, _role_id, _user_id)
  ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.unassign_server_role(_role_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _srv uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT server_id INTO _srv FROM public.server_roles WHERE id = _role_id;
  IF _srv IS NULL THEN RETURN; END IF;
  IF NOT public.is_server_owner(_srv, _uid) THEN RAISE EXCEPTION 'Not the owner'; END IF;
  DELETE FROM public.server_member_roles WHERE role_id = _role_id AND user_id = _user_id;
END $$;
