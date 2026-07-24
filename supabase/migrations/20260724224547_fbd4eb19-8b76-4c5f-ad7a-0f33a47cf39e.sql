DROP FUNCTION IF EXISTS public.acquire_call_session(uuid, boolean, boolean, boolean, boolean, boolean);

CREATE FUNCTION public.acquire_call_session(
  _conversation_id uuid,
  _reuse_without_live_peer boolean DEFAULT false,
  _is_muted boolean DEFAULT false,
  _is_deafened boolean DEFAULT false,
  _is_video_on boolean DEFAULT false,
  _is_screen_sharing boolean DEFAULT false
)
RETURNS TABLE(out_call_event_id uuid, out_started_at timestamptz, out_is_creator boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _event_id uuid;
  _started_at timestamptz;
  _created boolean := false;
  _preferred_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.is_conversation_participant(_conversation_id, _uid) THEN
    RAISE EXCEPTION 'Not a participant of this conversation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_conversation_id::text, 913));

  SELECT ce.id
    INTO _preferred_id
    FROM public.call_events ce
   WHERE ce.conversation_id = _conversation_id
     AND ce.state = 'ongoing'
     AND (
       _reuse_without_live_peer
       OR EXISTS (
         SELECT 1
           FROM public.call_participants cp
          WHERE cp.call_event_id = ce.id
            AND cp.user_id <> _uid
            AND cp.left_at IS NULL
            AND COALESCE(cp.last_seen_at, cp.joined_at) > now() - interval '35 seconds'
       )
     )
   ORDER BY ce.started_at ASC, ce.id ASC
   LIMIT 1
   FOR UPDATE;

  IF _preferred_id IS NOT NULL THEN
    _event_id := public.canonicalize_ongoing_call_event(_conversation_id, _preferred_id);
    SELECT ce.started_at INTO _started_at FROM public.call_events ce WHERE ce.id = _event_id;
  ELSE
    UPDATE public.call_events
       SET state = 'ended', ended_at = COALESCE(ended_at, now())
     WHERE conversation_id = _conversation_id AND state = 'ongoing';
    UPDATE public.call_participants cp
       SET left_at = COALESCE(cp.left_at, now())
     WHERE cp.call_event_id IN (
       SELECT ce.id FROM public.call_events ce
        WHERE ce.conversation_id = _conversation_id AND ce.state = 'ended'
     )
       AND cp.left_at IS NULL;

    INSERT INTO public.call_events (conversation_id, caller_id, state)
    VALUES (_conversation_id, _uid, 'ongoing')
    RETURNING id, public.call_events.started_at INTO _event_id, _started_at;
    _created := true;
  END IF;

  INSERT INTO public.call_participants AS cp (
    call_event_id, user_id, is_muted, is_deafened, is_video_on,
    is_screen_sharing, joined_at, last_seen_at, left_at
  ) VALUES (
    _event_id, _uid, _is_muted, _is_deafened, _is_video_on,
    _is_screen_sharing, now(), now(), NULL
  )
  ON CONFLICT (call_event_id, user_id) DO UPDATE SET
    is_muted = EXCLUDED.is_muted,
    is_deafened = EXCLUDED.is_deafened,
    is_video_on = EXCLUDED.is_video_on,
    is_screen_sharing = EXCLUDED.is_screen_sharing,
    last_seen_at = now(),
    left_at = NULL;

  out_call_event_id := _event_id;
  out_started_at    := _started_at;
  out_is_creator    := _created;
  RETURN NEXT;
END;
$function$;