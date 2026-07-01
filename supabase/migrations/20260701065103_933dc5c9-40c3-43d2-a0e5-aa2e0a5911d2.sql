-- Clean up any accidental duplicate single-slot cosmetics before enforcing the rule.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, category
           ORDER BY equipped_at DESC, id DESC
         ) AS rn
  FROM public.user_equipped
  WHERE category IN ('theme', 'name_color')
)
DELETE FROM public.user_equipped ue
USING ranked r
WHERE ue.id = r.id
  AND r.rn > 1;

-- Themes and name colors are single-equip categories, regardless of slot.
CREATE UNIQUE INDEX IF NOT EXISTS user_equipped_single_category_unique
ON public.user_equipped (user_id, category)
WHERE category IN ('theme', 'name_color');

CREATE OR REPLACE FUNCTION public.equip_shop_item(_item_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _category TEXT;
  _next_slot INTEGER;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_inventory WHERE user_id = _uid AND item_id = _item_id) THEN
    RAISE EXCEPTION 'NOT_OWNED' USING ERRCODE = 'P0001';
  END IF;

  SELECT category INTO _category FROM public.shop_items WHERE id = _item_id;
  IF _category IS NULL THEN RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;

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
    -- Avoid dupes
    DELETE FROM public.user_equipped WHERE user_id = _uid AND category = 'badge' AND item_id = _item_id;
    SELECT COALESCE(MIN(s), 0) INTO _next_slot FROM (
      SELECT generate_series(0,2) AS s
      EXCEPT
      SELECT slot FROM public.user_equipped WHERE user_id = _uid AND category = 'badge'
    ) gaps;
    INSERT INTO public.user_equipped (user_id, category, item_id, slot) VALUES (_uid, 'badge', _item_id, _next_slot);
  ELSE
    RAISE EXCEPTION 'UNSUPPORTED_CATEGORY' USING ERRCODE = 'P0001';
  END IF;
END;
$function$;