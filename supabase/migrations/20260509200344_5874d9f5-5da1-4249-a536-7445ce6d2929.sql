-- Server-side presence: a heartbeat column on profiles that every client
-- bumps periodically. "Online" = last_seen_at within 75 seconds AND status != 'invisible'.
-- This is the source of truth so flickering presence channels can no longer
-- mark a user offline incorrectly.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at ON public.profiles (last_seen_at DESC);

-- RPC every client calls every ~30s while the app is open.
CREATE OR REPLACE FUNCTION public.presence_heartbeat()
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
  RETURN _now;
END;
$$;

GRANT EXECUTE ON FUNCTION public.presence_heartbeat() TO authenticated;

-- Helper: list user_ids considered online (last_seen within window AND not invisible).
CREATE OR REPLACE FUNCTION public.online_user_ids(_window_seconds integer DEFAULT 75)
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id
  FROM public.profiles p
  WHERE p.last_seen_at > (now() - make_interval(secs => GREATEST(_window_seconds, 30)))
    AND COALESCE(p.status, 'online') <> 'invisible';
$$;

GRANT EXECUTE ON FUNCTION public.online_user_ids(integer) TO authenticated;