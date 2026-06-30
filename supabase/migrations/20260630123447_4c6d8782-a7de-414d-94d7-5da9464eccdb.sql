
-- ============================================================
-- v0.4.0 Phase 3 — Gems spending, gifting, wishlist-driven gifts
-- ============================================================

-- spend_gems: deduct gems atomically with balance check + ledger entry
CREATE OR REPLACE FUNCTION public.spend_gems(
  _amount integer,
  _reason text,
  _source_ref text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _bal integer;
  _new_bal integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  INSERT INTO public.gems_balances (user_id, balance) VALUES (_uid, 0)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO _bal FROM public.gems_balances WHERE user_id = _uid FOR UPDATE;
  IF _bal < _amount THEN RAISE EXCEPTION 'INSUFFICIENT_GEMS' USING ERRCODE = 'P0001'; END IF;

  _new_bal := _bal - _amount;
  UPDATE public.gems_balances
     SET balance = _new_bal, lifetime_spent = lifetime_spent + _amount, updated_at = now()
   WHERE user_id = _uid;

  INSERT INTO public.gems_transactions (user_id, amount, balance_after, reason, source_ref, metadata)
  VALUES (_uid, -_amount, _new_bal, _reason, _source_ref, _metadata);

  RETURN _new_bal;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.spend_gems(integer, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.spend_gems(integer, text, text, jsonb) TO authenticated;

-- credit_gems: internal helper to credit gems (used by gift_shop_item recipient leg, refunds, etc.)
CREATE OR REPLACE FUNCTION public._internal_credit_gems(
  _user_id uuid,
  _amount integer,
  _reason text,
  _source_ref text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_bal integer;
BEGIN
  INSERT INTO public.gems_balances (user_id, balance) VALUES (_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.gems_balances
     SET balance = balance + _amount,
         lifetime_earned = lifetime_earned + _amount,
         updated_at = now()
   WHERE user_id = _user_id
   RETURNING balance INTO _new_bal;

  INSERT INTO public.gems_transactions (user_id, amount, balance_after, reason, source_ref, metadata)
  VALUES (_user_id, _amount, _new_bal, _reason, _source_ref, _metadata);

  RETURN _new_bal;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._internal_credit_gems(uuid, integer, text, text, jsonb) FROM PUBLIC;

-- purchase_shop_item_gems: same as purchase_shop_item, but uses gems instead of coins
CREATE OR REPLACE FUNCTION public.purchase_shop_item_gems(_item_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _price_gems integer;
  _category text;
  _new_balance integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT price_gems, category INTO _price_gems, _category
    FROM public.shop_items
   WHERE id = _item_id AND is_active = true;

  IF _price_gems IS NULL THEN RAISE EXCEPTION 'ITEM_NOT_PURCHASABLE_WITH_GEMS' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_inventory WHERE user_id = _uid AND item_id = _item_id) THEN
    RAISE EXCEPTION 'ALREADY_OWNED' USING ERRCODE = 'P0001';
  END IF;

  _new_balance := public.spend_gems(_price_gems, 'shop_purchase', _item_id, jsonb_build_object('category', _category));
  INSERT INTO public.user_inventory (user_id, item_id) VALUES (_uid, _item_id);

  RETURN jsonb_build_object('balance_gems', _new_balance, 'item_id', _item_id, 'category', _category);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_shop_item_gems(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.purchase_shop_item_gems(text) TO authenticated;

-- gift_shop_item: sender pays gems, gift_transactions row created in 'pending' state.
-- Recipient claims later via claim_gift (which adds to inventory).
CREATE OR REPLACE FUNCTION public.gift_shop_item(
  _recipient_id uuid,
  _item_id text,
  _conversation_id uuid DEFAULT NULL,
  _message text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _price_gems integer;
  _name text;
  _category text;
  _gift_id uuid;
  _new_balance integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _recipient_id IS NULL OR _recipient_id = _uid THEN RAISE EXCEPTION 'INVALID_RECIPIENT' USING ERRCODE = 'P0001'; END IF;

  SELECT price_gems, name, category INTO _price_gems, _name, _category
    FROM public.shop_items WHERE id = _item_id AND is_active = true;

  IF _price_gems IS NULL THEN RAISE EXCEPTION 'ITEM_NOT_GIFTABLE' USING ERRCODE = 'P0001'; END IF;

  -- Don't waste gems gifting something the recipient already owns
  IF EXISTS (SELECT 1 FROM public.user_inventory WHERE user_id = _recipient_id AND item_id = _item_id) THEN
    RAISE EXCEPTION 'RECIPIENT_ALREADY_OWNS' USING ERRCODE = 'P0001';
  END IF;

  _new_balance := public.spend_gems(_price_gems, 'gift_sent', _item_id, jsonb_build_object('recipient_id', _recipient_id, 'item_name', _name));

  INSERT INTO public.gift_transactions (sender_id, recipient_id, gift_type, conversation_id, message, payload, status)
  VALUES (
    _uid, _recipient_id, 'shop_item', _conversation_id, _message,
    jsonb_build_object('item_id', _item_id, 'item_name', _name, 'category', _category, 'price_gems', _price_gems),
    'pending'
  )
  RETURNING id INTO _gift_id;

  RETURN jsonb_build_object('gift_id', _gift_id, 'balance_gems', _new_balance);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.gift_shop_item(uuid, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.gift_shop_item(uuid, text, uuid, text) TO authenticated;

-- claim_gift: recipient accepts a pending gift; item gets added to inventory.
CREATE OR REPLACE FUNCTION public.claim_gift(_gift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _g record;
  _item_id text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO _g FROM public.gift_transactions WHERE id = _gift_id FOR UPDATE;
  IF _g IS NULL THEN RAISE EXCEPTION 'GIFT_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF _g.recipient_id <> _uid THEN RAISE EXCEPTION 'NOT_RECIPIENT' USING ERRCODE = 'P0001'; END IF;
  IF _g.status <> 'pending' THEN RAISE EXCEPTION 'ALREADY_HANDLED' USING ERRCODE = 'P0001'; END IF;

  IF _g.gift_type = 'shop_item' THEN
    _item_id := _g.payload->>'item_id';
    INSERT INTO public.user_inventory (user_id, item_id) VALUES (_uid, _item_id)
      ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.gift_transactions
     SET status = 'claimed', claimed_at = now()
   WHERE id = _gift_id;

  RETURN jsonb_build_object('ok', true, 'item_id', _item_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_gift(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_gift(uuid) TO authenticated;

-- Realtime: gems balance + gifts should stream live
ALTER PUBLICATION supabase_realtime ADD TABLE public.gems_balances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.gift_transactions;
