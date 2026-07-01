CREATE OR REPLACE FUNCTION public.gift_shop_item(
  _recipient_id uuid,
  _item_id text,
  _conversation_id uuid DEFAULT NULL::uuid,
  _message text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _price_gems integer;
  _direct_price_gems integer;
  _price_coins integer;
  _name text;
  _category text;
  _config jsonb;
  _is_gems_only boolean;
  _gift_id uuid;
  _new_balance integer;
  _marker_body text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _recipient_id IS NULL OR _recipient_id = _uid THEN
    RAISE EXCEPTION 'INVALID_RECIPIENT' USING ERRCODE = 'P0001';
  END IF;

  SELECT price_gems, price, name, category, COALESCE(config, '{}'::jsonb)
    INTO _direct_price_gems, _price_coins, _name, _category, _config
    FROM public.shop_items
   WHERE id = _item_id AND is_active = true;

  IF _name IS NULL THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0001';
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
$$;

REVOKE EXECUTE ON FUNCTION public.gift_shop_item(uuid, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.gift_shop_item(uuid, text, uuid, text) TO authenticated;