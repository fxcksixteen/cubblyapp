
-- 1. Replace create_server_invite to avoid gen_random_bytes (pgcrypto is not enabled in this project)
CREATE OR REPLACE FUNCTION public.create_server_invite(_server_id uuid, _max_uses integer DEFAULT NULL::integer, _expires_in_seconds integer DEFAULT NULL::integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _code text;
  _expires_at timestamptz;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_server_member(_server_id, _uid) THEN RAISE EXCEPTION 'Not a member'; END IF;

  -- 8-char uppercase alphanumeric, generated from a random uuid so we
  -- don't depend on pgcrypto's gen_random_bytes being installed.
  _code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));

  IF _expires_in_seconds IS NOT NULL THEN
    _expires_at := now() + make_interval(secs => _expires_in_seconds);
  END IF;

  INSERT INTO public.server_invites (server_id, code, created_by, expires_at, max_uses)
  VALUES (_server_id, _code, _uid, _expires_at, _max_uses);

  RETURN _code;
END;
$function$;

-- 2. Realtime DELETE for messages — need REPLICA IDENTITY FULL so the
-- `conversation_id=eq.X` filter still matches on DELETE payloads (the row
-- is gone, postgres has to log the full old row).
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- Make sure the table is in the realtime publication (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;
END $$;
