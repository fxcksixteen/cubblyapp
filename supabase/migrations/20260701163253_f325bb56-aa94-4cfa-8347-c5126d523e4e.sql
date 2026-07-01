-- ============================================================
-- v0.4.0 Standard Honey monthly gem claim
-- ============================================================

-- Treat the launch grant as this month's real monthly grant so auto-claiming
-- cannot double-credit the same users on first app launch.
UPDATE public.gems_transactions
   SET source_ref = 'honey_monthly:' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'),
       metadata = metadata || jsonb_build_object('normalized_from', 'v0.4.0_launch_honey_stipend')
 WHERE reason = 'subscription_grant'
   AND source_ref = 'v0.4.0_launch_honey_stipend';

CREATE OR REPLACE FUNCTION public.claim_honey_monthly_gems()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _source_ref text := 'honey_monthly:' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  _balance integer := 0;
  _already_claimed boolean := false;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF COALESCE(public.user_subscription_tier(_uid), 'free') <> 'honey' THEN
    RAISE EXCEPTION 'HONEY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.gems_transactions
    WHERE user_id = _uid
      AND reason = 'subscription_grant'
      AND source_ref = _source_ref
  ) INTO _already_claimed;

  IF _already_claimed THEN
    SELECT balance INTO _balance FROM public.gems_balances WHERE user_id = _uid;
    RETURN jsonb_build_object('granted', false, 'amount', 0, 'balance', COALESCE(_balance, 0), 'source_ref', _source_ref);
  END IF;

  _balance := public._internal_credit_gems(
    _uid,
    500,
    'subscription_grant',
    _source_ref,
    jsonb_build_object('tier', 'honey', 'grant', 'monthly_stipend')
  );

  RETURN jsonb_build_object('granted', true, 'amount', 500, 'balance', _balance, 'source_ref', _source_ref);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_honey_monthly_gems() FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_honey_monthly_gems() TO authenticated;