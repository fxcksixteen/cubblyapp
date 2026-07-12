-- v0.4.6 — wishlist auto-clear on purchase + stale server-call sweeper

-- 1) purchase_shop_item: remove matching wishlist row after successful purchase
CREATE OR REPLACE FUNCTION public.purchase_shop_item(_item_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid UUID := auth.uid();
  _price INTEGER;
  _category TEXT;
  _config JSONB;
  _new_balance INTEGER;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT price, category, COALESCE(config, '{}'::jsonb) INTO _price, _category, _config
  FROM public.shop_items
  WHERE id = _item_id AND is_active = true;
  IF _price IS NULL THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE((_config->>'gems_only')::boolean, false) THEN
    RAISE EXCEPTION 'ITEM_NOT_PURCHASABLE_WITH_COINS' USING ERRCODE = 'P0001';
  END IF;

  IF _price <= 0 THEN
    RAISE EXCEPTION 'ITEM_COIN_PRICE_MISSING' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_inventory WHERE user_id = _uid AND item_id = _item_id) THEN
    RAISE EXCEPTION 'ALREADY_OWNED' USING ERRCODE = 'P0001';
  END IF;

  _new_balance := public.spend_coins(_price, 'shop_purchase', _item_id, jsonb_build_object('category', _category));

  INSERT INTO public.user_inventory (user_id, item_id) VALUES (_uid, _item_id);

  -- v0.4.6: auto-clear from wishlist so users don't have to remove it by hand
  DELETE FROM public.wishlist_items
   WHERE user_id = _uid AND item_id = _item_id;

  RETURN jsonb_build_object('balance', _new_balance, 'item_id', _item_id, 'category', _category);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_shop_item(text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_shop_item(text) TO authenticated;

-- 2) purchase_shop_item_gems: same wishlist cleanup
CREATE OR REPLACE FUNCTION public.purchase_shop_item_gems(_item_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _price_gems integer;
  _category text;
  _config jsonb;
  _new_balance integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT price_gems, category, COALESCE(config, '{}'::jsonb)
    INTO _price_gems, _category, _config
    FROM public.shop_items
   WHERE id = _item_id AND is_active = true;

  IF _price_gems IS NULL OR _price_gems <= 0 OR NOT COALESCE((_config->>'gems_only')::boolean, false) THEN
    RAISE EXCEPTION 'ITEM_NOT_PURCHASABLE_WITH_GEMS' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_inventory WHERE user_id = _uid AND item_id = _item_id) THEN
    RAISE EXCEPTION 'ALREADY_OWNED' USING ERRCODE = 'P0001';
  END IF;

  _new_balance := public.spend_gems(_price_gems, 'shop_purchase', _item_id, jsonb_build_object('category', _category));
  INSERT INTO public.user_inventory (user_id, item_id) VALUES (_uid, _item_id);

  -- v0.4.6: auto-clear from wishlist so users don't have to remove it by hand
  DELETE FROM public.wishlist_items
   WHERE user_id = _uid AND item_id = _item_id;

  RETURN jsonb_build_object('balance_gems', _new_balance, 'item_id', _item_id, 'category', _category);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_shop_item_gems(text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_shop_item_gems(text) TO authenticated;

-- 3) sweep_stale_call_events: end call_events where every participant has left
-- or gone silent for >= 45s. Fixes server voice-channel timers that used to
-- count up forever because a crashed/backgrounded client never cleared its
-- participant row.
CREATE OR REPLACE FUNCTION public.sweep_stale_call_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _stale_ids uuid[];
  _now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT COALESCE(array_agg(id), '{}')
    INTO _stale_ids
    FROM public.call_events ce
   WHERE ce.state = 'ongoing'
     AND NOT EXISTS (
       SELECT 1
         FROM public.call_participants cp
        WHERE cp.call_event_id = ce.id
          AND cp.left_at IS NULL
          AND COALESCE(cp.last_seen_at, cp.joined_at) > _now - interval '45 seconds'
     );

  IF array_length(_stale_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.call_events
     SET state = 'ended', ended_at = COALESCE(ended_at, _now)
   WHERE id = ANY(_stale_ids);

  UPDATE public.call_participants
     SET left_at = _now
   WHERE call_event_id = ANY(_stale_ids)
     AND left_at IS NULL;

  RETURN COALESCE(array_length(_stale_ids, 1), 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sweep_stale_call_events() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.sweep_stale_call_events() TO authenticated;