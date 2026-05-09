-- Make presence database-driven AND version-tolerant: union profiles.last_seen_at
-- with user_sessions.last_seen_at so older clients (which only write
-- user_sessions) still count as online.

CREATE OR REPLACE FUNCTION public.online_user_ids(_window_seconds integer DEFAULT 75)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH w AS (SELECT now() - make_interval(secs => GREATEST(_window_seconds, 30)) AS cutoff)
  SELECT p.user_id
  FROM public.profiles p, w
  WHERE COALESCE(p.status, 'online') <> 'invisible'
    AND (
      p.last_seen_at > w.cutoff
      OR EXISTS (
        SELECT 1 FROM public.user_sessions us, w w2
        WHERE us.user_id = p.user_id
          AND us.revoked_at IS NULL
          AND us.last_seen_at > w2.cutoff
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.online_user_ids(integer) TO authenticated;

-- Heartbeat now also bumps the caller's user_sessions row when a session_key
-- is provided, so the two presence signals stay in lockstep.
CREATE OR REPLACE FUNCTION public.presence_heartbeat(_session_key text DEFAULT NULL)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _now timestamptz := now();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  UPDATE public.profiles SET last_seen_at = _now WHERE user_id = _uid;
  IF _session_key IS NOT NULL AND length(_session_key) > 0 THEN
    UPDATE public.user_sessions
       SET last_seen_at = _now, revoked_at = NULL
     WHERE user_id = _uid AND session_key = _session_key;
  END IF;
  RETURN _now;
END;
$$;

GRANT EXECUTE ON FUNCTION public.presence_heartbeat(text) TO authenticated;
-- Keep the no-arg signature working for clients that haven't shipped the new arg yet.
GRANT EXECUTE ON FUNCTION public.presence_heartbeat() TO authenticated;