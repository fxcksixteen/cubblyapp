-- v0.4.0 shop catalog correction: no Honey-included shop items.
-- Animated name colors/themes are normal gem shop items and must be purchased or gifted.

CREATE OR REPLACE FUNCTION public.honey_entitlements(_user_id uuid)
RETURNS TABLE(
  tier text,
  coin_multiplier integer,
  max_equipped_badges integer,
  attachment_cap_mb integer,
  message_cap_chars integer,
  can_use_motion_name_colors boolean,
  can_use_animated_themes boolean,
  can_share_note_advanced boolean,
  monthly_gems integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH t AS (SELECT COALESCE(public.user_subscription_tier(_user_id), 'free') AS tier)
  SELECT
    t.tier,
    CASE WHEN t.tier = 'honey' THEN 2 ELSE 1 END,
    CASE WHEN t.tier = 'honey' THEN 3 WHEN t.tier = 'basic' THEN 2 ELSE 1 END,
    CASE WHEN t.tier = 'honey' THEN 250 WHEN t.tier = 'basic' THEN 100 ELSE 25 END,
    CASE WHEN t.tier = 'honey' THEN 4000 WHEN t.tier = 'basic' THEN 1000 ELSE 2000 END,
    false,
    false,
    t.tier IN ('basic','honey'),
    CASE WHEN t.tier = 'honey' THEN 500 ELSE 0 END
  FROM t
$$;

GRANT EXECUTE ON FUNCTION public.honey_entitlements(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.trim_honey_cosmetics(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_equipped ue
  USING public.shop_items si
  WHERE ue.user_id = _user_id
    AND ue.item_id = si.id
    AND ue.category IN ('name_color','theme')
    AND si.subcategory = 'animated'
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_inventory ui
      WHERE ui.user_id = _user_id
        AND ui.item_id = ue.item_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.trim_honey_cosmetics(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.equip_shop_item(_item_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid UUID := auth.uid();
  _category TEXT;
  _subcategory TEXT;
  _next_slot INTEGER;
  _badge_limit INTEGER;
  _badge_count INTEGER;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT category, subcategory INTO _category, _subcategory
  FROM public.shop_items
  WHERE id = _item_id AND is_active = true;
  IF _category IS NULL THEN RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_inventory WHERE user_id = _uid AND item_id = _item_id) THEN
    RAISE EXCEPTION 'NOT_OWNED' USING ERRCODE = 'P0001';
  END IF;

  IF _category IN ('name_color','theme') THEN
    DELETE FROM public.user_equipped
     WHERE user_id = _uid
       AND category = _category;

    INSERT INTO public.user_equipped (user_id, category, item_id, slot)
    VALUES (_uid, _category, _item_id, 0)
    ON CONFLICT (user_id, category) WHERE category IN ('theme', 'name_color')
    DO UPDATE SET item_id = EXCLUDED.item_id,
                  slot = 0,
                  equipped_at = now();
  ELSIF _category = 'badge' THEN
    PERFORM public.trim_equipped_badges(_uid);
    _badge_limit := public.honey_badge_limit(_uid);

    IF EXISTS (SELECT 1 FROM public.user_equipped WHERE user_id = _uid AND category = 'badge' AND item_id = _item_id) THEN
      DELETE FROM public.user_equipped WHERE user_id = _uid AND category = 'badge' AND item_id = _item_id;
      RETURN;
    END IF;

    SELECT COUNT(*) INTO _badge_count
    FROM public.user_equipped
    WHERE user_id = _uid AND category = 'badge';

    IF _badge_count >= _badge_limit THEN
      RAISE EXCEPTION 'BADGE_LIMIT' USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(MIN(s), 0) INTO _next_slot FROM (
      SELECT generate_series(0, _badge_limit - 1) AS s
      EXCEPT
      SELECT slot FROM public.user_equipped WHERE user_id = _uid AND category = 'badge'
    ) gaps;
    INSERT INTO public.user_equipped (user_id, category, item_id, slot) VALUES (_uid, 'badge', _item_id, _next_slot);
  ELSE
    RAISE EXCEPTION 'UNSUPPORTED_CATEGORY' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.equip_shop_item(text) TO authenticated;

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

  RETURN jsonb_build_object('balance', _new_balance, 'item_id', _item_id, 'category', _category);
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_shop_item(text) TO authenticated;

-- Remove old Honey auto-granted animated cosmetics from inventory/equipped if there is no gem purchase or gift record.
DELETE FROM public.user_equipped ue
USING public.shop_items si
WHERE ue.item_id = si.id
  AND ue.category IN ('name_color','theme')
  AND si.subcategory = 'animated'
  AND NOT EXISTS (
    SELECT 1
    FROM public.gems_transactions gt
    WHERE gt.user_id = ue.user_id
      AND gt.reason = 'shop_purchase'
      AND gt.source_ref = ue.item_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.gift_transactions gft
    WHERE gft.recipient_id = ue.user_id
      AND gft.gift_type = 'shop_item'
      AND gft.payload->>'item_id' = ue.item_id
  );

DELETE FROM public.user_inventory ui
USING public.shop_items si
WHERE ui.item_id = si.id
  AND si.category IN ('name_color','theme')
  AND si.subcategory = 'animated'
  AND NOT EXISTS (
    SELECT 1
    FROM public.gems_transactions gt
    WHERE gt.user_id = ui.user_id
      AND gt.reason = 'shop_purchase'
      AND gt.source_ref = ui.item_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.gift_transactions gft
    WHERE gft.recipient_id = ui.user_id
      AND gft.gift_type = 'shop_item'
      AND gft.payload->>'item_id' = ui.item_id
  );

-- Ensure direct shop currency is exclusive.
UPDATE public.shop_items
SET price_gems = NULL,
    config = COALESCE(config, '{}'::jsonb) - 'gems_only'
WHERE NOT (category IN ('name_color','theme') AND subcategory IN ('animated','premium'))
  AND price > 0;

-- Rebalance animated name colors so Bow is the premium top item at 1,200 gems.
UPDATE public.shop_items SET price = 0, price_gems = 550, config = COALESCE(config, '{}'::jsonb) || '{"gems_only": true}'::jsonb WHERE id = 'name_color_animated_ice';
UPDATE public.shop_items SET price = 0, price_gems = 550, config = COALESCE(config, '{}'::jsonb) || '{"gems_only": true}'::jsonb WHERE id = 'name_color_animated_emeraldwave';
UPDATE public.shop_items SET price = 0, price_gems = 600, config = COALESCE(config, '{}'::jsonb) || '{"gems_only": true}'::jsonb WHERE id = 'name_color_animated_oceanmist';
UPDATE public.shop_items SET price = 0, price_gems = 650, config = COALESCE(config, '{}'::jsonb) || '{"gems_only": true}'::jsonb WHERE id = 'name_color_animated_aurora';
UPDATE public.shop_items SET price = 0, price_gems = 650, config = COALESCE(config, '{}'::jsonb) || '{"gems_only": true}'::jsonb WHERE id = 'name_color_animated_inferno';
UPDATE public.shop_items SET price = 0, price_gems = 700, config = COALESCE(config, '{}'::jsonb) || '{"gems_only": true}'::jsonb WHERE id = 'name_color_animated_stardust';
UPDATE public.shop_items SET price = 0, price_gems = 750, config = COALESCE(config, '{}'::jsonb) || '{"gems_only": true}'::jsonb WHERE id = 'name_color_animated_galaxy';
UPDATE public.shop_items SET price = 0, price_gems = 800, config = COALESCE(config, '{}'::jsonb) || '{"gems_only": true}'::jsonb WHERE id = 'name_color_animated_rainbow';
UPDATE public.shop_items SET price = 0, price_gems = 850, config = COALESCE(config, '{}'::jsonb) || '{"gems_only": true}'::jsonb WHERE id = 'name_color_animated_plasma';
UPDATE public.shop_items SET price = 0, price_gems = 900, config = COALESCE(config, '{}'::jsonb) || '{"gems_only": true}'::jsonb WHERE id = 'name_color_animated_phoenix';
UPDATE public.shop_items SET price = 0, price_gems = 900, config = COALESCE(config, '{}'::jsonb) || '{"gems_only": true}'::jsonb WHERE id = 'name_color_animated_solarflare';
UPDATE public.shop_items SET price = 0, price_gems = 950, config = COALESCE(config, '{}'::jsonb) || '{"gems_only": true}'::jsonb WHERE id = 'name_color_animated_prism';
UPDATE public.shop_items SET price = 0, price_gems = 950, config = COALESCE(config, '{}'::jsonb) || '{"gems_only": true}'::jsonb WHERE id = 'name_color_animated_neonpulse';
UPDATE public.shop_items SET price = 0, price_gems = 1000, config = COALESCE(config, '{}'::jsonb) || '{"gems_only": true}'::jsonb WHERE id = 'name_color_animated_holographic';

UPDATE public.shop_items
SET price = 0,
    price_gems = 1000,
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
      'gems_only', true,
      'style', 'sweep',
      'duration', '4.8s',
      'stops', jsonb_build_array('#ff4fa3', '#ff9acb', '#ffffff', '#a7e8ff', '#5bbcff', '#ff4fa3')
    )
WHERE id = 'name_color_animated_cotton_candy';

UPDATE public.shop_items
SET price = 0,
    price_gems = 1100,
    config = (COALESCE(config, '{}'::jsonb) - 'bow') || jsonb_build_object(
      'gems_only', true,
      'style', 'sweep',
      'duration', '4.8s',
      'stops', jsonb_build_array('#ff4f9f', '#fff7fb', '#ffb7d5', '#e11d48', '#ffffff', '#ff4f9f'),
      'icon_url', '/__l5e/assets-v1/a0c71d59-b483-4782-a4bf-2128d99b196d/hello-kitty-3d.png'
    )
WHERE id = 'name_color_animated_hello_kitty';

UPDATE public.shop_items
SET price = 0,
    price_gems = 1200,
    config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
      'gems_only', true,
      'bow', true,
      'style', 'sweep',
      'duration', '5s',
      'stops', jsonb_build_array('#f9a8d4', '#ec4899', '#a855f7', '#7c3aed', '#ec4899', '#f9a8d4')
    )
WHERE id = 'name_color_animated_bow';