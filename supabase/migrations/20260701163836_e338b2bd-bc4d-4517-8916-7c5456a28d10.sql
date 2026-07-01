CREATE OR REPLACE FUNCTION public._internal_award_coins(
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
  _new_balance INTEGER;
  _multiplier INTEGER := 1;
  _final_amount INTEGER;
  _final_metadata JSONB := COALESCE(_metadata, '{}'::jsonb);
BEGIN
  IF _amount <= 0 THEN RETURN NULL; END IF;

  IF _reason IN ('messages','voice_minutes','gaming_minutes') THEN
    _multiplier := public.honey_coin_multiplier(_user_id);
  END IF;

  _final_amount := _amount * _multiplier;
  IF _multiplier > 1 THEN
    _final_metadata := _final_metadata || jsonb_build_object('honey_multiplier', _multiplier, 'base_amount', _amount);
  END IF;

  INSERT INTO public.user_coins (user_id, balance, lifetime_earned)
  VALUES (_user_id, _final_amount, _final_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.user_coins.balance + _final_amount,
        lifetime_earned = public.user_coins.lifetime_earned + _final_amount
  RETURNING balance INTO _new_balance;

  INSERT INTO public.coin_transactions (user_id, amount, reason, source_ref, metadata, balance_after)
  VALUES (_user_id, _final_amount, _reason, _source_ref, _final_metadata, _new_balance);

  RETURN _new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._internal_award_coins(UUID, INTEGER, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;