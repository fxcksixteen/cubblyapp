CREATE OR REPLACE FUNCTION public.debug_voice_snapshot(_conversation_id uuid, _call_event_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _server_id uuid;
  _is_conversation_member boolean := false;
  _is_server_member boolean := false;
  _events jsonb := '[]'::jsonb;
  _participants jsonb := '[]'::jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT c.server_id INTO _server_id
  FROM public.conversations c
  WHERE c.id = _conversation_id;

  _is_conversation_member := public.is_conversation_participant(_conversation_id, _uid);
  IF _server_id IS NOT NULL THEN
    _is_server_member := public.is_server_member(_server_id, _uid);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ce.id,
    'state', ce.state,
    'caller_id', ce.caller_id,
    'started_at', ce.started_at,
    'ended_at', ce.ended_at
  ) ORDER BY ce.started_at DESC), '[]'::jsonb)
  INTO _events
  FROM public.call_events ce
  WHERE ce.conversation_id = _conversation_id
    AND (_call_event_id IS NULL OR ce.id = _call_event_id OR ce.state = 'ongoing');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'call_event_id', cp.call_event_id,
    'user_id', cp.user_id,
    'left_at', cp.left_at,
    'joined_at', cp.joined_at,
    'last_seen_at', cp.last_seen_at,
    'fresh_seconds_ago', CASE
      WHEN COALESCE(cp.last_seen_at, cp.joined_at) IS NULL THEN NULL
      ELSE EXTRACT(EPOCH FROM (now() - COALESCE(cp.last_seen_at, cp.joined_at)))::int
    END
  ) ORDER BY cp.call_event_id, cp.user_id), '[]'::jsonb)
  INTO _participants
  FROM public.call_participants cp
  JOIN public.call_events ce ON ce.id = cp.call_event_id
  WHERE ce.conversation_id = _conversation_id
    AND (_call_event_id IS NULL OR cp.call_event_id = _call_event_id OR ce.state = 'ongoing');

  RETURN jsonb_build_object(
    'viewer_id', _uid,
    'conversation_id', _conversation_id,
    'server_id', _server_id,
    'is_conversation_member', _is_conversation_member,
    'is_server_member', _is_server_member,
    'call_events', _events,
    'participants', _participants
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.debug_voice_snapshot(uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.debug_voice_snapshot(uuid, uuid) TO authenticated;