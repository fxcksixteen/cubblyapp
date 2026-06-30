
ALTER TABLE public.dm_preferences
  ADD COLUMN IF NOT EXISTS who_can_dm text NOT NULL DEFAULT 'everyone';

CREATE OR REPLACE FUNCTION public.validate_dm_preferences()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.who_can_dm NOT IN ('everyone','friends_of_friends','friends_only') THEN
    RAISE EXCEPTION 'INVALID_WHO_CAN_DM';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_dm_preferences_t ON public.dm_preferences;
CREATE TRIGGER validate_dm_preferences_t
  BEFORE INSERT OR UPDATE ON public.dm_preferences
  FOR EACH ROW EXECUTE FUNCTION public.validate_dm_preferences();

CREATE OR REPLACE FUNCTION public.are_friends(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND ((requester_id = _a AND addressee_id = _b)
        OR (requester_id = _b AND addressee_id = _a))
  );
$$;

CREATE OR REPLACE FUNCTION public.share_mutual_friend(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH friends_of_a AS (
    SELECT CASE WHEN requester_id = _a THEN addressee_id ELSE requester_id END AS uid
    FROM public.friendships
    WHERE status='accepted' AND (requester_id=_a OR addressee_id=_a)
  ),
  friends_of_b AS (
    SELECT CASE WHEN requester_id = _b THEN addressee_id ELSE requester_id END AS uid
    FROM public.friendships
    WHERE status='accepted' AND (requester_id=_b OR addressee_id=_b)
  )
  SELECT EXISTS (
    SELECT uid FROM friends_of_a
    INTERSECT
    SELECT uid FROM friends_of_b
  );
$$;

CREATE OR REPLACE FUNCTION public.create_dm_conversation(other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  conv_id uuid;
  existing_conv_id uuid;
  policy text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF other_user_id = auth.uid() THEN RAISE EXCEPTION 'CANT_DM_SELF'; END IF;

  SELECT c.id INTO existing_conv_id
  FROM public.conversations c
  JOIN public.conversation_participants cp1
    ON cp1.conversation_id = c.id AND cp1.user_id = auth.uid()
  JOIN public.conversation_participants cp2
    ON cp2.conversation_id = c.id AND cp2.user_id = other_user_id
  WHERE c.is_group = false
    AND c.server_id IS NULL
    AND (SELECT count(*) FROM public.conversation_participants p WHERE p.conversation_id = c.id) = 2
  LIMIT 1;
  IF existing_conv_id IS NOT NULL THEN RETURN existing_conv_id; END IF;

  SELECT who_can_dm INTO policy FROM public.dm_preferences WHERE user_id = other_user_id;
  policy := COALESCE(policy, 'everyone');

  IF policy = 'friends_only' AND NOT public.are_friends(auth.uid(), other_user_id) THEN
    INSERT INTO public.message_requests (sender_id, recipient_id, status)
    VALUES (auth.uid(), other_user_id, 'pending')
    ON CONFLICT DO NOTHING;
    RAISE EXCEPTION 'MESSAGE_REQUEST_SENT' USING ERRCODE = 'P0001';
  END IF;

  IF policy = 'friends_of_friends'
     AND NOT public.are_friends(auth.uid(), other_user_id)
     AND NOT public.share_mutual_friend(auth.uid(), other_user_id) THEN
    INSERT INTO public.message_requests (sender_id, recipient_id, status)
    VALUES (auth.uid(), other_user_id, 'pending')
    ON CONFLICT DO NOTHING;
    RAISE EXCEPTION 'MESSAGE_REQUEST_SENT' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.conversations (is_group) VALUES (false) RETURNING id INTO conv_id;
  INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (conv_id, auth.uid());
  INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (conv_id, other_user_id);

  RETURN conv_id;
END $$;

-- Recipient-edit RPC. Notes are end-to-end encrypted server-side, so we
-- only mutate the message-card payload (and any live mirrors). The
-- author's personal vault row is intentionally untouched — author can
-- "Save changes" from their own client if they want it written back.
CREATE OR REPLACE FUNCTION public.apply_recipient_note_edit(
  _message_id uuid, _title text, _body text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _marker constant text := '[[cubbly:shared-note:v1]]';
  _row record;
  _payload jsonb;
  _view_once boolean;
  _can_edit boolean;
  _edit_used boolean;
  _is_burnt boolean;
  _new_content text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT m.id, m.content, m.sender_id, m.conversation_id, m.note_ref
    INTO _row
  FROM public.messages m WHERE m.id = _message_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'NOTE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;

  IF _row.sender_id = _uid THEN RAISE EXCEPTION 'AUTHOR_CANNOT_EDIT_HERE' USING ERRCODE = 'P0001'; END IF;
  IF NOT public.is_conversation_participant(_row.conversation_id, _uid) THEN
    RAISE EXCEPTION 'NOT_A_PARTICIPANT' USING ERRCODE = 'P0001';
  END IF;
  IF _row.content IS NULL OR position(_marker in _row.content) <> 1 THEN
    RAISE EXCEPTION 'NOT_A_SHARED_NOTE' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    _payload := (substring(_row.content from (length(_marker) + 1)))::jsonb;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'NOT_A_SHARED_NOTE' USING ERRCODE = 'P0001';
  END;

  _view_once := COALESCE((_payload->>'viewOnce')::boolean, false);
  _can_edit  := COALESCE((_payload->>'recipientCanEdit')::boolean, false);
  _edit_used := COALESCE((_payload->>'recipientEditUsed')::boolean, false);
  _is_burnt  := COALESCE((_payload->>'burnt')::boolean, false);

  IF NOT _can_edit THEN RAISE EXCEPTION 'EDIT_NOT_ALLOWED' USING ERRCODE = 'P0001'; END IF;
  IF _is_burnt THEN RAISE EXCEPTION 'NOTE_BURNT' USING ERRCODE = 'P0001'; END IF;
  IF _view_once AND _edit_used THEN
    RAISE EXCEPTION 'EDIT_ALREADY_USED' USING ERRCODE = 'P0001';
  END IF;

  _payload := _payload
    || jsonb_build_object(
         'title', COALESCE(_title, ''),
         'body',  COALESCE(_body, ''),
         'recipientEditUsed', (_view_once OR _edit_used)
       );
  _new_content := _marker || _payload::text;
  UPDATE public.messages SET content = _new_content WHERE id = _message_id;

  -- Live-sync: if author kept this note linked across chats, mirror the edit.
  IF _row.note_ref IS NOT NULL THEN
    UPDATE public.messages m
       SET content = _marker || (
         (substring(m.content from (length(_marker) + 1)))::jsonb
           || jsonb_build_object('title', COALESCE(_title,''), 'body', COALESCE(_body,''))
       )::text
     WHERE m.note_ref = _row.note_ref
       AND m.sender_id = _row.sender_id
       AND m.id <> _message_id
       AND m.content LIKE _marker || '%';
  END IF;
END $$;
