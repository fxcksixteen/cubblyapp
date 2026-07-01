
-- 1. Lock down award_coins (prevent self-minting)
REVOKE EXECUTE ON FUNCTION public.award_coins(uuid, integer, text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- 2. Remove user_coins and coin_transactions from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.user_coins;
ALTER PUBLICATION supabase_realtime DROP TABLE public.coin_transactions;

-- 3. Fix activity_details privacy: drop duplicate/permissive SELECT policies and add privacy-aware policy
DROP POLICY IF EXISTS "Anyone authed can read activity details" ON public.activity_details;
DROP POLICY IF EXISTS "anyone reads activity details" ON public.activity_details;

CREATE POLICY "Read activity details respecting privacy"
  ON public.activity_details
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_activities ua
      WHERE ua.user_id = public.activity_details.user_id
        AND ua.privacy_visible = true
    )
  );

-- 4. Set fixed search_path on functions missing it
ALTER FUNCTION public._honey_gift_gems_price(text, text) SET search_path = public;
ALTER FUNCTION public.validate_dm_preferences() SET search_path = public;

-- 5. Revoke EXECUTE from anon on all SECURITY DEFINER functions in public schema.
--    These are all authenticated-user actions; none should be callable while signed out.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;
