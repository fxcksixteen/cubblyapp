CREATE OR REPLACE FUNCTION public.award_coins(
  _user_id UUID,
  _amount INTEGER,
  _reason TEXT,
  _source_ref TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _request_role TEXT := current_setting('request.jwt.claim.role', true);
  _new_balance INTEGER;
BEGIN
  IF _request_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;

  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Award amount must be positive';
  END IF;

  IF _reason NOT IN ('voice_minutes','messages','gaming_minutes','signup_bonus','admin_grant') THEN
    RAISE EXCEPTION 'Invalid award reason: %', _reason;
  END IF;

  INSERT INTO public.user_coins (user_id, balance, lifetime_earned)
  VALUES (_user_id, _amount + 25, _amount + 25)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.user_coins.balance + _amount,
        lifetime_earned = public.user_coins.lifetime_earned + _amount
  RETURNING balance INTO _new_balance;

  INSERT INTO public.coin_transactions (user_id, amount, reason, source_ref, metadata, balance_after)
  VALUES (_user_id, _amount, _reason, _source_ref, COALESCE(_metadata, '{}'::jsonb), _new_balance);

  RETURN _new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_coins(UUID, INTEGER, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_coins(UUID, INTEGER, TEXT, TEXT, JSONB) TO service_role;