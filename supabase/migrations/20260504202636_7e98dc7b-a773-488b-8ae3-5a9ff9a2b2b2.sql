-- =========================================================
-- SHOP CATALOG + INVENTORY (v0.3.0)
-- =========================================================

-- 1) Catalog
CREATE TABLE public.shop_items (
  id TEXT PRIMARY KEY,                           -- stable string id like 'name_color_static_red'
  category TEXT NOT NULL,                        -- 'name_color' | 'theme' | 'badge'
  subcategory TEXT,                              -- e.g. 'static' | 'gradient' | 'animated'
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL CHECK (price >= 0),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,     -- type-specific payload (colors, theme tokens, svg ref…)
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX shop_items_category_idx ON public.shop_items (category, sort_order);

ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Catalog readable by authenticated users"
  ON public.shop_items FOR SELECT TO authenticated
  USING (is_active = true);

-- 2) Per-user inventory (owned items)
CREATE TABLE public.user_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  item_id TEXT NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);

CREATE INDEX user_inventory_user_idx ON public.user_inventory (user_id);

ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own inventory"
  ON public.user_inventory FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 3) What a user currently has equipped per category.
--    name_color & theme = at most one row per (user, category).
--    badge can have multiple rows per user (we'll cap in UI later).
CREATE TABLE public.user_equipped (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  category TEXT NOT NULL,
  item_id TEXT NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL DEFAULT 0,               -- for multi-slot categories (badges)
  equipped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, category, slot)
);

CREATE INDEX user_equipped_user_idx ON public.user_equipped (user_id);

ALTER TABLE public.user_equipped ENABLE ROW LEVEL SECURITY;

-- Equipped rows are PUBLIC reads (so other users can see your name color/badges)
CREATE POLICY "Equipped items readable by authenticated users"
  ON public.user_equipped FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users equip from their own inventory"
  ON public.user_equipped FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.user_inventory ui
      WHERE ui.user_id = auth.uid() AND ui.item_id = user_equipped.item_id
    )
  );

CREATE POLICY "Users update their own equipped rows"
  ON public.user_equipped FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users unequip their own rows"
  ON public.user_equipped FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 4) Atomic purchase
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
  _new_balance INTEGER;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT price, category INTO _price, _category
  FROM public.shop_items
  WHERE id = _item_id AND is_active = true;
  IF _price IS NULL THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_inventory WHERE user_id = _uid AND item_id = _item_id) THEN
    RAISE EXCEPTION 'ALREADY_OWNED' USING ERRCODE = 'P0001';
  END IF;

  -- spend_coins handles balance check + transaction log
  _new_balance := public.spend_coins(_price, 'shop_purchase', _item_id, jsonb_build_object('category', _category));

  INSERT INTO public.user_inventory (user_id, item_id) VALUES (_uid, _item_id);

  RETURN jsonb_build_object('balance', _new_balance, 'item_id', _item_id, 'category', _category);
END;
$$;

-- 5) Realtime for instant inventory + equipped updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_equipped;