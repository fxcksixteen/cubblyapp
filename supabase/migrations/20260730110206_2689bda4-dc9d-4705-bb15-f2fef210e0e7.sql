ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS complimentary boolean NOT NULL DEFAULT false;

-- Mark the three lifetime-comped accounts and give them a real, current
-- monthly period instead of the year-2126 sentinel.
UPDATE public.subscriptions
   SET complimentary = true,
       status = 'active',
       interval = 'monthly',
       cancel_at_period_end = false,
       current_period_end = (date_trunc('month', now()) + interval '1 month')
 WHERE user_id IN (
   'e72383bf-dbc3-4342-aadb-03104914fac4',
   'b7b10e15-bc39-4871-bebe-4bcf2b3617b9',
   '96b65493-ddc3-46df-b107-8bb97c0dd4c0'
 );

-- Self-renewing complimentary plans: whenever the stored period has elapsed,
-- roll it forward month by month so the plan behaves like a real recurring
-- subscription (and the existing monthly gem stipend keeps firing).
CREATE OR REPLACE FUNCTION public.roll_complimentary_subscription()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.subscriptions%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO _row FROM public.subscriptions WHERE user_id = _uid;
  IF NOT FOUND OR NOT _row.complimentary THEN
    RETURN jsonb_build_object('rolled', false);
  END IF;

  -- Anything absurdly far in the future was the old sentinel value: normalize.
  IF _row.current_period_end IS NULL OR _row.current_period_end > now() + interval '2 years' THEN
    UPDATE public.subscriptions
       SET current_period_end = date_trunc('month', now()) + interval '1 month',
           status = 'active',
           cancel_at_period_end = false
     WHERE user_id = _uid
     RETURNING * INTO _row;
    RETURN jsonb_build_object('rolled', true, 'current_period_end', _row.current_period_end);
  END IF;

  IF _row.current_period_end <= now() THEN
    UPDATE public.subscriptions
       SET current_period_end = date_trunc('month', now()) + interval '1 month',
           status = 'active',
           cancel_at_period_end = false
     WHERE user_id = _uid
     RETURNING * INTO _row;
    RETURN jsonb_build_object('rolled', true, 'current_period_end', _row.current_period_end);
  END IF;

  RETURN jsonb_build_object('rolled', false, 'current_period_end', _row.current_period_end);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.roll_complimentary_subscription() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.roll_complimentary_subscription() TO authenticated;