GRANT SELECT, INSERT, UPDATE ON public.call_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.call_participants TO authenticated;
GRANT ALL ON public.call_events TO service_role;
GRANT ALL ON public.call_participants TO service_role;

CREATE OR REPLACE FUNCTION public.canonicalize_ongoing_call_event(_conversation_id uuid, _preferred_call_event_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _canonical_id uuid;
  _duplicate_ids uuid[];
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_conversation_participant(_conversation_id, _uid) THEN
    RAISE EXCEPTION 'Not a participant of this conversation';
  END IF;

  SELECT ce.id
    INTO _canonical_id
    FROM public.call_events ce
   WHERE ce.conversation_id = _conversation_id
     AND ce.state = 'ongoing'
   ORDER BY
     CASE WHEN ce.id = _preferred_call_event_id THEN 0 ELSE 1 END,
     ce.started_at DESC
   LIMIT 1;

  IF _canonical_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(array_agg(ce.id), '{}')
    INTO _duplicate_ids
    FROM public.call_events ce
   WHERE ce.conversation_id = _conversation_id
     AND ce.state = 'ongoing'
     AND ce.id <> _canonical_id;

  IF array_length(_duplicate_ids, 1) IS NOT NULL THEN
    INSERT INTO public.call_participants (
      call_event_id,
      user_id,
      is_muted,
      is_deafened,
      is_video_on,
      is_screen_sharing,
      joined_at,
      last_seen_at,
      left_at
    )
    SELECT
      _canonical_id,
      cp.user_id,
      cp.is_muted,
      cp.is_deafened,
      cp.is_video_on,
      cp.is_screen_sharing,
      cp.joined_at,
      COALESCE(cp.last_seen_at, cp.joined_at, now()),
      cp.left_at
    FROM public.call_participants cp
    WHERE cp.call_event_id = ANY(_duplicate_ids)
    ON CONFLICT (call_event_id, user_id) DO UPDATE SET
      last_seen_at = GREATEST(
        COALESCE(public.call_participants.last_seen_at, public.call_participants.joined_at, '-infinity'::timestamptz),
        COALESCE(EXCLUDED.last_seen_at, EXCLUDED.joined_at, '-infinity'::timestamptz)
      ),
      left_at = CASE
        WHEN public.call_participants.left_at IS NULL OR EXCLUDED.left_at IS NULL THEN NULL
        ELSE GREATEST(public.call_participants.left_at, EXCLUDED.left_at)
      END,
      is_muted = EXCLUDED.is_muted,
      is_deafened = EXCLUDED.is_deafened,
      is_video_on = EXCLUDED.is_video_on,
      is_screen_sharing = EXCLUDED.is_screen_sharing;

    UPDATE public.call_events
       SET state = 'ended', ended_at = COALESCE(ended_at, now())
     WHERE id = ANY(_duplicate_ids);

    UPDATE public.call_participants
       SET left_at = COALESCE(left_at, now())
     WHERE call_event_id = ANY(_duplicate_ids)
       AND left_at IS NULL;
  END IF;

  RETURN _canonical_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.canonicalize_ongoing_call_event(uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.canonicalize_ongoing_call_event(uuid, uuid) TO authenticated;