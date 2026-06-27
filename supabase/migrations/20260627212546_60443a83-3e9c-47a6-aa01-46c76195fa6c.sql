CREATE OR REPLACE FUNCTION public.burn_view_once_note(_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _conv uuid;
  _sender uuid;
  _content text;
  _marker constant text := '[[cubbly:shared-note:v1]]';
  _payload jsonb;
  _title text;
  _new_content text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT m.conversation_id, m.sender_id, m.content
    INTO _conv, _sender, _content
  FROM public.messages m
  WHERE m.id = _message_id;

  IF _conv IS NULL THEN
    RAISE EXCEPTION 'message not found';
  END IF;

  -- Only the recipient may burn — never the sender (so authoring device
  -- doesn't lose its own preview, and so a malicious sender can't pre-burn).
  IF _sender = _uid THEN
    RETURN;
  END IF;

  IF NOT public.is_conversation_participant(_conv, _uid) THEN
    RAISE EXCEPTION 'not a participant of this conversation';
  END IF;

  -- Must look like a shared-note v1 marker.
  IF _content IS NULL OR position(_marker in _content) <> 1 THEN
    RETURN;
  END IF;

  BEGIN
    _payload := (substring(_content from (length(_marker) + 1)))::jsonb;
  EXCEPTION WHEN others THEN
    RETURN;
  END;

  -- Only view-once notes can be burnt.
  IF COALESCE((_payload->>'viewOnce')::boolean, false) <> true THEN
    RETURN;
  END IF;

  -- Already burnt — no-op (idempotent).
  IF COALESCE((_payload->>'burnt')::boolean, false) = true THEN
    RETURN;
  END IF;

  _title := COALESCE(_payload->>'title', 'Untitled');
  _new_content := _marker || jsonb_build_object(
    'title', _title,
    'body', '',
    'viewOnce', true,
    'burnt', true
  )::text;

  UPDATE public.messages
    SET content = _new_content
  WHERE id = _message_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.burn_view_once_note(uuid) TO authenticated;