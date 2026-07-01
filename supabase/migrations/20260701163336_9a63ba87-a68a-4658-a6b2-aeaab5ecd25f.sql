-- ============================================================
-- v0.4.0 Standard Honey animated cosmetic access
-- ============================================================

CREATE OR REPLACE FUNCTION public.trim_honey_cosmetics(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(public.user_subscription_tier(_user_id), 'free') = 'honey' THEN
    RETURN;
  END IF;

  DELETE FROM public.user_equipped ue
  USING public.shop_items si
  WHERE ue.user_id = _user_id
    AND ue.item_id = si.id
    AND ue.category IN ('name_color','theme')
    AND si.subcategory = 'animated';
END;
$$;

GRANT EXECUTE ON FUNCTION public.trim_honey_cosmetics(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.trim_badges_after_subscription_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid;
BEGIN
  _uid := COALESCE(NEW.user_id, OLD.user_id);
  IF _uid IS NOT NULL THEN
    PERFORM public.trim_equipped_badges(_uid);
    PERFORM public.trim_honey_cosmetics(_uid);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

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
  _tier TEXT;
  _owned BOOLEAN;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT category, subcategory INTO _category, _subcategory FROM public.shop_items WHERE id = _item_id AND is_active = true;
  IF _category IS NULL THEN RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;

  _tier := COALESCE(public.user_subscription_tier(_uid), 'free');

  SELECT EXISTS (SELECT 1 FROM public.user_inventory WHERE user_id = _uid AND item_id = _item_id) INTO _owned;

  IF NOT _owned THEN
    IF _tier = 'honey' AND _category IN ('name_color','theme') AND _subcategory = 'animated' THEN
      INSERT INTO public.user_inventory (user_id, item_id)
      VALUES (_uid, _item_id)
      ON CONFLICT (user_id, item_id) DO NOTHING;
      _owned := true;
    ELSE
      RAISE EXCEPTION 'NOT_OWNED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF _category IN ('name_color','theme') AND _subcategory = 'animated' AND _tier <> 'honey' THEN
    RAISE EXCEPTION 'HONEY_REQUIRED' USING ERRCODE = 'P0001';
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

REVOKE EXECUTE ON FUNCTION public.equip_shop_item(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.equip_shop_item(TEXT) TO authenticated;

-- Normalize current state for anyone who no longer has Standard Honey.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM public.user_equipped WHERE category IN ('name_color','theme')
  LOOP
    PERFORM public.trim_honey_cosmetics(r.user_id);
  END LOOP;
END $$;