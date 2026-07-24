CREATE OR REPLACE FUNCTION public.acquire_call_session(
  _conversation_id uuid,
  _reuse_without_live_peer boolean DEFAULT false,
  _is_muted boolean DEFAULT false,
  _is_deafened boolean DEFAULT false,
  _is_video_on boolean DEFAULT false,
  _is_screen_sharing boolean DEFAULT false
)
RETURNS TABLE(call_event_id uuid, started_at timestamptz, is_creator boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  INSERT INTO public.call_participants (
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

  RETURN QUERY SELECT _event_id, _started_at, _created;
END;
$$;

REVOKE ALL ON FUNCTION public.acquire_call_session(uuid, boolean, boolean, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquire_call_session(uuid, boolean, boolean, boolean, boolean, boolean) TO authenticated, service_role;

DROP POLICY IF EXISTS "Callers can update their own call events" ON public.call_events;
CREATE POLICY "Callers can update their own call events"
ON public.call_events
FOR UPDATE
TO authenticated
USING (auth.uid() = caller_id AND public.is_conversation_participant(conversation_id, auth.uid()))
WITH CHECK (auth.uid() = caller_id AND public.is_conversation_participant(conversation_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.enforce_gift_claim_update_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.recipient_id AND (
    NEW.id IS DISTINCT FROM OLD.id OR
    NEW.sender_id IS DISTINCT FROM OLD.sender_id OR
    NEW.recipient_id IS DISTINCT FROM OLD.recipient_id OR
    NEW.gift_type IS DISTINCT FROM OLD.gift_type OR
    NEW.payload IS DISTINCT FROM OLD.payload OR
    NEW.message IS DISTINCT FROM OLD.message OR
    NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR
    NEW.message_id IS DISTINCT FROM OLD.message_id OR
    NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'Gift claim updates may only change status and claimed_at';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_gift_claim_update_fields ON public.gift_transactions;
CREATE TRIGGER enforce_gift_claim_update_fields
BEFORE UPDATE ON public.gift_transactions
FOR EACH ROW EXECUTE FUNCTION public.enforce_gift_claim_update_fields();

DROP POLICY IF EXISTS "recipient updates claim status" ON public.gift_transactions;
CREATE POLICY "recipient updates claim status"
ON public.gift_transactions
FOR UPDATE
TO authenticated
USING (auth.uid() = recipient_id)
WITH CHECK (auth.uid() = recipient_id AND status IN ('pending','claimed','declined'));

CREATE OR REPLACE FUNCTION public.enforce_message_request_update_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = OLD.recipient_id AND (
    NEW.id IS DISTINCT FROM OLD.id OR
    NEW.sender_id IS DISTINCT FROM OLD.sender_id OR
    NEW.recipient_id IS DISTINCT FROM OLD.recipient_id OR
    NEW.preview IS DISTINCT FROM OLD.preview OR
    NEW.conversation_id IS DISTINCT FROM OLD.conversation_id OR
    NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'Message request recipients may only change status';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_message_request_update_fields ON public.message_requests;
CREATE TRIGGER enforce_message_request_update_fields
BEFORE UPDATE ON public.message_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_message_request_update_fields();

DROP POLICY IF EXISTS "recipient updates request" ON public.message_requests;
CREATE POLICY "recipient updates request"
ON public.message_requests
FOR UPDATE
TO authenticated
USING (auth.uid() = recipient_id)
WITH CHECK (auth.uid() = recipient_id AND status IN ('accepted','declined','blocked'));

DROP POLICY IF EXISTS "sender can withdraw" ON public.message_requests;
CREATE POLICY "sender can withdraw"
ON public.message_requests
FOR UPDATE
TO authenticated
USING (auth.uid() = sender_id)
WITH CHECK (auth.uid() = sender_id AND status = 'declined');