
CREATE OR REPLACE FUNCTION public.gift_shop_item(_recipient_id uuid, _item_id text, _conversation_id uuid DEFAULT NULL::uuid, _message text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _price_gems integer;
  _price_coins integer;
  _name text;
  _category text;
  _gift_id uuid;
  _new_balance integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _recipient_id IS NULL OR _recipient_id = _uid THEN
    RAISE EXCEPTION 'INVALID_RECIPIENT' USING ERRCODE = 'P0001';
  END IF;

  SELECT price_gems, price, name, category INTO _price_gems, _price_coins, _name, _category
    FROM public.shop_items WHERE id = _item_id AND is_active = true;

  IF _name IS NULL THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Anything in the shop can be gifted with gems. When no explicit gem price
  -- is set, compute one from the coin price: ~10 coins ≈ 1 gem, minimum 20.
  IF _price_gems IS NULL THEN
    _price_gems := GREATEST(20, CEIL(_price_coins::numeric / 10)::integer);
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_inventory WHERE user_id = _recipient_id AND item_id = _item_id) THEN
    RAISE EXCEPTION 'RECIPIENT_ALREADY_OWNS' USING ERRCODE = 'P0001';
  END IF;

  _new_balance := public.spend_gems(
    _price_gems, 'gift_sent', _item_id,
    jsonb_build_object('recipient_id', _recipient_id, 'item_name', _name)
  );

  INSERT INTO public.gift_transactions (sender_id, recipient_id, gift_type, conversation_id, message, payload, status)
  VALUES (
    _uid, _recipient_id, 'shop_item', _conversation_id, _message,
    jsonb_build_object('item_id', _item_id, 'item_name', _name, 'category', _category, 'price_gems', _price_gems),
    'pending'
  )
  RETURNING id INTO _gift_id;

  RETURN jsonb_build_object('gift_id', _gift_id, 'balance_gems', _new_balance, 'price_gems', _price_gems);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.gift_shop_item(uuid, text, uuid, text) FROM anon;
