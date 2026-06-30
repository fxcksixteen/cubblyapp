
CREATE OR REPLACE FUNCTION public.accept_message_request(_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _req public.message_requests;
  _conv uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT * INTO _req FROM public.message_requests WHERE id = _request_id FOR UPDATE;
  IF _req IS NULL THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF _req.recipient_id <> _uid THEN
    RAISE EXCEPTION 'NOT_RECIPIENT' USING ERRCODE = 'P0001';
  END IF;
  IF _req.status <> 'pending' THEN
    RAISE EXCEPTION 'ALREADY_HANDLED' USING ERRCODE = 'P0001';
  END IF;

  -- Reuse existing DM or create one between the two users.
  SELECT c.id INTO _conv
  FROM public.conversations c
  JOIN public.conversation_participants cp1
    ON cp1.conversation_id = c.id AND cp1.user_id = _uid
  JOIN public.conversation_participants cp2
    ON cp2.conversation_id = c.id AND cp2.user_id = _req.sender_id
  WHERE c.is_group = false
    AND c.server_id IS NULL
    AND (SELECT count(*) FROM public.conversation_participants p WHERE p.conversation_id = c.id) = 2
  LIMIT 1;

  IF _conv IS NULL THEN
    INSERT INTO public.conversations (is_group) VALUES (false) RETURNING id INTO _conv;
    INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (_conv, _uid);
    INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (_conv, _req.sender_id);
  END IF;

  UPDATE public.message_requests
     SET status = 'accepted', conversation_id = _conv, updated_at = now()
   WHERE id = _request_id;

  RETURN _conv;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_message_request(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.decline_message_request(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  UPDATE public.message_requests
     SET status = 'declined', updated_at = now()
   WHERE id = _request_id
     AND recipient_id = _uid
     AND status = 'pending';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decline_message_request(uuid) FROM anon;

-- Realtime for inbox updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.custom_statuses;
