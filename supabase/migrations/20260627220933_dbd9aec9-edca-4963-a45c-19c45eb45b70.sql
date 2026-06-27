
-- 1. Reference column so a "Shared Note" message can be linked back to the
--    original personal note for live edit-sync. Nullable: only set when the
--    sender opted into live sync at share time.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS note_ref uuid;

CREATE INDEX IF NOT EXISTS idx_messages_note_ref
  ON public.messages (note_ref)
  WHERE note_ref IS NOT NULL;

-- 2. Sync RPC. Caller must be the author. Only updates messages they sent,
--    that are still v1 shared-note payloads, are NOT burnt, and have
--    live:true in their payload. Skips view-once notes (those can't live-sync).
CREATE OR REPLACE FUNCTION public.sync_shared_note(
  _note_id uuid,
  _title text,
  _body text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _marker constant text := '[[cubbly:shared-note:v1]]';
  _updated integer := 0;
  _row record;
  _payload jsonb;
  _new_content text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _note_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR _row IN
    SELECT id, content
      FROM public.messages
     WHERE note_ref = _note_id
       AND sender_id = _uid
       AND content LIKE _marker || '%'
  LOOP
    BEGIN
      _payload := (substring(_row.content from (length(_marker) + 1)))::jsonb;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;

    -- Skip burnt or non-live messages.
    IF COALESCE((_payload->>'burnt')::boolean, false) THEN CONTINUE; END IF;
    IF COALESCE((_payload->>'viewOnce')::boolean, false) THEN CONTINUE; END IF;
    IF NOT COALESCE((_payload->>'live')::boolean, false) THEN CONTINUE; END IF;

    _payload := _payload
      || jsonb_build_object('title', COALESCE(_title, ''), 'body', COALESCE(_body, ''));

    _new_content := _marker || _payload::text;

    UPDATE public.messages
       SET content = _new_content
     WHERE id = _row.id;

    _updated := _updated + 1;
  END LOOP;

  RETURN _updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_shared_note(uuid, text, text) TO authenticated;

-- 3. Make sure UPDATE events on messages carry the full new row so realtime
--    listeners can re-render edited shared-note cards.
ALTER TABLE public.messages REPLICA IDENTITY FULL;
