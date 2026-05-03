-- v0.2.27 hotfix: real call liveness tracking + safe stale-call cleanup.
-- Adds last_seen_at to call_participants so the app can distinguish a row
-- that's actually live (recently heartbeated) from a ghost row left over
-- after a crash / suspend / failed cleanup. Also adds two SECURITY DEFINER
-- helpers so participants can heartbeat themselves and any conversation
-- member (not just the original caller) can end a stale event.

-- 1) Schema change
ALTER TABLE public.call_participants
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_call_participants_event_live
  ON public.call_participants(call_event_id)
  WHERE left_at IS NULL;

-- 2) Heartbeat / upsert (also used for rejoin: revives an existing row by
--    clearing left_at instead of failing on the UNIQUE(call_event_id, user_id)).
CREATE OR REPLACE FUNCTION public.heartbeat_call_participant(
  _call_event_id uuid,
  _is_muted boolean DEFAULT NULL,
  _is_deafened boolean DEFAULT NULL,
  _is_video_on boolean DEFAULT NULL,
  _is_screen_sharing boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _conv uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Caller must be a participant of the underlying conversation.
  SELECT ce.conversation_id INTO _conv FROM public.call_events ce WHERE ce.id = _call_event_id;
  IF _conv IS NULL THEN
    RAISE EXCEPTION 'call_event not found';
  END IF;
  IF NOT public.is_conversation_participant(_conv, _uid) THEN
    RAISE EXCEPTION 'Not a participant of this conversation';
  END IF;

  INSERT INTO public.call_participants AS cp (
    call_event_id, user_id, is_muted, is_deafened, is_video_on, is_screen_sharing, last_seen_at, left_at
  )
  VALUES (
    _call_event_id, _uid,
    COALESCE(_is_muted, false),
    COALESCE(_is_deafened, false),
    COALESCE(_is_video_on, false),
    COALESCE(_is_screen_sharing, false),
    now(),
    NULL
  )
  ON CONFLICT (call_event_id, user_id) DO UPDATE SET
    last_seen_at = now(),
    left_at = NULL,
    is_muted = COALESCE(EXCLUDED.is_muted, cp.is_muted),
    is_deafened = COALESCE(EXCLUDED.is_deafened, cp.is_deafened),
    is_video_on = COALESCE(EXCLUDED.is_video_on, cp.is_video_on),
    is_screen_sharing = COALESCE(EXCLUDED.is_screen_sharing, cp.is_screen_sharing);
END;
$$;

-- 3) Stale-event cleanup any conversation member can call.
--    "Stale" = no participant has left_at IS NULL with last_seen_at within
--    the freshness window (default 30s). Closes the call_event so a brand
--    new call can start cleanly. Also force-marks lingering "live" rows as
--    left to prevent them coming back as ghosts.
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
  _live_count integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT ce.conversation_id, ce.state INTO _conv, _state
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

  SELECT COUNT(*) INTO _live_count
  FROM public.call_participants
  WHERE call_event_id = _call_event_id
    AND left_at IS NULL
    AND last_seen_at > (now() - make_interval(secs => _stale_seconds));

  IF _live_count > 0 THEN
    RETURN false;
  END IF;

  -- Force-mark every still-"live" row as left at their last heartbeat so
  -- they don't re-spawn as ghosts.
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