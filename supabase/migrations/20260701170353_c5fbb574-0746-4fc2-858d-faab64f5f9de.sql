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

  RETURN jsonb_build_object('balance_gems', _new_balance, 'item_id', _item_id, 'category', _category);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.purchase_shop_item_gems(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.purchase_shop_item_gems(text) TO authenticated;