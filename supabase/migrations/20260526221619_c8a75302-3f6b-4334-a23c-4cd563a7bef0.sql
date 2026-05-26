CREATE OR REPLACE FUNCTION public.end_call_event_if_stale(
  _call_event_id uuid,
  _stale_seconds integer DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _conv uuid;
  _state text;
  _started_at timestamptz;
  _live_count integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT ce.conversation_id, ce.state, ce.started_at INTO _conv, _state, _started_at
  FROM public.call_events ce WHERE ce.id = _call_event_id;
  IF _conv IS NULL THEN
    RETURN false;
  END IF;
  IF NOT public.is_conversation_participant(_conv, _uid) THEN
    RAISE EXCEPTION 'Not a participant of this conversation';
  END IF;

  IF _state <> 'ongoing' THEN
    RETURN false;
  END IF;

  -- Brand-new call events can briefly exist before both clients have written
  -- their first participant heartbeat. Never close those immediately; this is
  -- what made fresh web/desktop call pills flip to "ended 00:00" on insert.
  IF _started_at > (now() - make_interval(secs => GREATEST(_stale_seconds, 10))) THEN
    RETURN false;
  END IF;

  SELECT COUNT(*) INTO _live_count
  FROM public.call_participants
  WHERE call_event_id = _call_event_id
    AND left_at IS NULL
    AND last_seen_at > (now() - make_interval(secs => _stale_seconds));

  IF _live_count > 0 THEN
    RETURN false;
  END IF;

  UPDATE public.call_participants
     SET left_at = COALESCE(left_at, last_seen_at, now())
   WHERE call_event_id = _call_event_id
     AND left_at IS NULL;

  UPDATE public.call_events
     SET state = 'ended', ended_at = COALESCE(ended_at, now())
   WHERE id = _call_event_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_call_event_if_stale(uuid, integer) TO authenticated;