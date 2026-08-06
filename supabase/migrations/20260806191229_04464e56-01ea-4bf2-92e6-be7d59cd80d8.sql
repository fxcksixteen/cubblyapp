CREATE OR REPLACE FUNCTION public.roll_complimentary_subscription()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.subscriptions%ROWTYPE;
  _next timestamptz;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO _row FROM public.subscriptions WHERE user_id = _uid;
  IF NOT FOUND OR NOT _row.complimentary THEN
    RETURN jsonb_build_object('rolled', false);
  END IF;

  -- Roll forward whenever the period is missing, lapsed, or an absurd sentinel.
  IF _row.current_period_end IS NULL
     OR _row.current_period_end <= now()
     OR _row.current_period_end > now() + interval '2 years' THEN
    _next := date_trunc('month', now()) + interval '1 month';
    WHILE _next <= now() LOOP
      _next := _next + interval '1 month';
    END LOOP;

    UPDATE public.subscriptions
       SET current_period_end = _next,
           status = 'active',
           cancel_at_period_end = false
     WHERE user_id = _uid
     RETURNING * INTO _row;

    RETURN jsonb_build_object('rolled', true, 'current_period_end', _row.current_period_end);
  END IF;

  RETURN jsonb_build_object('rolled', false, 'current_period_end', _row.current_period_end);
END;
$function$;

UPDATE public.subscriptions
   SET current_period_end = date_trunc('month', now()) + interval '1 month',
       status = 'active',
       cancel_at_period_end = false,
       updated_at = now()
 WHERE complimentary
   AND (current_period_end IS NULL OR current_period_end <= now());