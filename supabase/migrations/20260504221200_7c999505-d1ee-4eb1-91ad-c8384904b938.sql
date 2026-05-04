-- RPC: create a server from an imported template (e.g., Discord template).
-- Skips the default #general / General voice channels and instead seeds the
-- exact channel list provided by the caller. Capped by the same 10-server
-- limit as create_server. Channels are an ordered jsonb array of objects:
--   { name: text, kind: 'text'|'voice', category: text|null }
CREATE OR REPLACE FUNCTION public.create_server_from_template(
  _name text,
  _icon_url text DEFAULT NULL,
  _channels jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _owned int;
  _server_id uuid;
  _conv_id uuid;
  _chan_id uuid;
  _pos int := 0;
  _ch jsonb;
  _kind text;
  _cname text;
  _cat text;
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

  -- Iterate channels in array order. Fall back to a single #general text
  -- channel if the template was empty.
  IF jsonb_array_length(coalesce(_channels, '[]'::jsonb)) = 0 THEN
    _channels := '[{"name":"general","kind":"text","category":null}]'::jsonb;
  END IF;

  FOR _ch IN SELECT * FROM jsonb_array_elements(_channels) LOOP
    _cname := coalesce(trim(_ch->>'name'), '');
    _kind  := lower(coalesce(_ch->>'kind','text'));
    _cat   := nullif(trim(coalesce(_ch->>'category','')), '');
    IF _cname = '' THEN CONTINUE; END IF;
    IF _kind NOT IN ('text','voice') THEN _kind := 'text'; END IF;

    INSERT INTO public.conversations (is_group, name, owner_id, server_id)
    VALUES (true, _cname, _uid, _server_id)
    RETURNING id INTO _conv_id;

    INSERT INTO public.server_channels (server_id, name, kind, category, position, conversation_id)
    VALUES (_server_id, _cname, _kind, _cat, _pos, _conv_id)
    RETURNING id INTO _chan_id;

    UPDATE public.conversations SET server_channel_id = _chan_id WHERE id = _conv_id;

    _pos := _pos + 1;
  END LOOP;

  RETURN _server_id;
END;
$$;