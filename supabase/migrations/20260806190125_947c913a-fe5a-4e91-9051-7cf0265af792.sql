-- 1) Subscription gate helper
CREATE OR REPLACE FUNCTION public.meets_required_tier(_user_id uuid, _required text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _required IS NULL OR btrim(_required) = '' OR lower(_required) = 'none' THEN true
    ELSE (
      CASE lower(COALESCE(public.user_subscription_tier(_user_id), 'none'))
        WHEN 'honey' THEN 2 WHEN 'basic' THEN 1 ELSE 0 END
      >=
      CASE lower(_required)
        WHEN 'honey' THEN 2 WHEN 'basic' THEN 1 ELSE 0 END
    )
  END
$$;

REVOKE ALL ON FUNCTION public.meets_required_tier(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meets_required_tier(uuid, text) TO authenticated, service_role;

-- 2) Enforce the gate on every acquisition path
CREATE OR REPLACE FUNCTION public.purchase_shop_item(_item_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _price INTEGER;
  _category TEXT;
  _config JSONB;
  _requires TEXT;
  _new_balance INTEGER;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT price, category, COALESCE(config, '{}'::jsonb), requires_subscription
    INTO _price, _category, _config, _requires
  FROM public.shop_items
  WHERE id = _item_id AND is_active = true;
  IF _price IS NULL THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.meets_required_tier(_uid, _requires) THEN
    RAISE EXCEPTION 'SUBSCRIPTION_REQUIRED' USING ERRCODE = 'P0001';
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

  DELETE FROM public.wishlist_items
   WHERE user_id = _uid AND item_id = _item_id;

  RETURN jsonb_build_object('balance', _new_balance, 'item_id', _item_id, 'category', _category);
END;
$function$;

CREATE OR REPLACE FUNCTION public.purchase_shop_item_gems(_item_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _price_gems integer;
  _category text;
  _config jsonb;
  _requires text;
  _new_balance integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT price_gems, category, COALESCE(config, '{}'::jsonb), requires_subscription
    INTO _price_gems, _category, _config, _requires
    FROM public.shop_items
   WHERE id = _item_id AND is_active = true;

  IF _price_gems IS NULL OR _price_gems <= 0 OR NOT COALESCE((_config->>'gems_only')::boolean, false) THEN
    RAISE EXCEPTION 'ITEM_NOT_PURCHASABLE_WITH_GEMS' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.meets_required_tier(_uid, _requires) THEN
    RAISE EXCEPTION 'SUBSCRIPTION_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_inventory WHERE user_id = _uid AND item_id = _item_id) THEN
    RAISE EXCEPTION 'ALREADY_OWNED' USING ERRCODE = 'P0001';
  END IF;

  _new_balance := public.spend_gems(_price_gems, 'shop_purchase', _item_id, jsonb_build_object('category', _category));
  INSERT INTO public.user_inventory (user_id, item_id) VALUES (_uid, _item_id);

  DELETE FROM public.wishlist_items
   WHERE user_id = _uid AND item_id = _item_id;

  RETURN jsonb_build_object('balance_gems', _new_balance, 'item_id', _item_id, 'category', _category);
END;
$function$;

CREATE OR REPLACE FUNCTION public.gift_shop_item(_recipient_id uuid, _item_id text, _conversation_id uuid DEFAULT NULL::uuid, _message text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _price_gems integer;
  _direct_price_gems integer;
  _price_coins integer;
  _name text;
  _category text;
  _config jsonb;
  _requires text;
  _is_gems_only boolean;
  _gift_id uuid;
  _new_balance integer;
  _marker_body text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _recipient_id IS NULL OR _recipient_id = _uid THEN
    RAISE EXCEPTION 'INVALID_RECIPIENT' USING ERRCODE = 'P0001';
  END IF;

  SELECT price_gems, price, name, category, COALESCE(config, '{}'::jsonb), requires_subscription
    INTO _direct_price_gems, _price_coins, _name, _category, _config, _requires
    FROM public.shop_items
   WHERE id = _item_id AND is_active = true;

  IF _name IS NULL THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.meets_required_tier(_recipient_id, _requires) THEN
    RAISE EXCEPTION 'RECIPIENT_SUBSCRIPTION_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  _is_gems_only := COALESCE((_config->>'gems_only')::boolean, false);

  IF _is_gems_only THEN
    IF _direct_price_gems IS NULL OR _direct_price_gems <= 0 THEN
      RAISE EXCEPTION 'ITEM_GEM_PRICE_MISSING' USING ERRCODE = 'P0001';
    END IF;
    _price_gems := _direct_price_gems;
  ELSE
    IF _price_coins IS NULL OR _price_coins <= 0 THEN
      RAISE EXCEPTION 'ITEM_COIN_PRICE_MISSING' USING ERRCODE = 'P0001';
    END IF;
    _price_gems := GREATEST(20, CEIL(_price_coins::numeric / 10)::integer);
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_inventory WHERE user_id = _recipient_id AND item_id = _item_id) THEN
    RAISE EXCEPTION 'RECIPIENT_ALREADY_OWNS' USING ERRCODE = 'P0001';
  END IF;

  _new_balance := public.spend_gems(
    _price_gems, 'gift_sent', _item_id,
    jsonb_build_object('recipient_id', _recipient_id, 'item_name', _name, 'direct_currency', CASE WHEN _is_gems_only THEN 'gems' ELSE 'coins' END)
  );

  INSERT INTO public.gift_transactions (sender_id, recipient_id, gift_type, conversation_id, message, payload, status)
  VALUES (
    _uid, _recipient_id, 'shop_item', _conversation_id, _message,
    jsonb_build_object('item_id', _item_id, 'item_name', _name, 'category', _category, 'price_gems', _price_gems),
    'pending'
  )
  RETURNING id INTO _gift_id;

  IF _conversation_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.conversation_participants
     WHERE conversation_id = _conversation_id AND user_id = _uid
  ) THEN
    _marker_body := '[[cubbly:shop-gift:v1]]' || jsonb_build_object(
      'giftId',    _gift_id,
      'itemId',    _item_id,
      'itemName',  _name,
      'category',  _category,
      'priceGems', _price_gems,
      'message',   _message
    )::text;

    INSERT INTO public.messages (conversation_id, sender_id, content)
    VALUES (_conversation_id, _uid, _marker_body);
  END IF;

  RETURN jsonb_build_object(
    'gift_id',      _gift_id,
    'balance_gems', _new_balance,
    'price_gems',   _price_gems
  );
END;
$function$;

-- 3) Remove anonymous EXECUTE on SECURITY DEFINER routines
REVOKE ALL ON FUNCTION public.acquire_call_session(uuid, boolean, boolean, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquire_call_session(uuid, boolean, boolean, boolean, boolean, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.gift_transactions_lock_non_status_on_recipient_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.message_requests_lock_non_status_on_recipient_update() FROM PUBLIC, anon, authenticated;