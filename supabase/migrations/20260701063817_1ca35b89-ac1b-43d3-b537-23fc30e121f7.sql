
CREATE OR REPLACE FUNCTION public.honey_subscribers(_user_ids uuid[])
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.user_id
  FROM public.subscriptions s
  WHERE s.user_id = ANY(_user_ids)
    AND s.tier = 'honey'
    AND s.status IN ('active','trialing')
    AND (s.current_period_end IS NULL OR s.current_period_end > now());
$$;

GRANT EXECUTE ON FUNCTION public.honey_subscribers(uuid[]) TO authenticated;
