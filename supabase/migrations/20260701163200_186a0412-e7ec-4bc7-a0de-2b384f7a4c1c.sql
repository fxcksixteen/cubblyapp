-- ============================================================
-- v0.4.0 Honey perk enforcement + launch gem stipend
-- ============================================================

-- Keep the gem transaction reason list aligned with the app/webhook.
ALTER TABLE public.gems_transactions
  DROP CONSTRAINT IF EXISTS gems_transactions_reason_check;

ALTER TABLE public.gems_transactions
  ADD CONSTRAINT gems_transactions_reason_check
  CHECK (reason IN ('purchase','subscription_grant','shop_purchase','gift_sent','gift_received','admin_grant','refund'));

-- Prevent duplicate monthly/launch Honey grants for the same user/source.
CREATE UNIQUE INDEX IF NOT EXISTS gems_transactions_subscription_grant_source_uidx
  ON public.gems_transactions (user_id, source_ref)
  WHERE reason = 'subscription_grant' AND source_ref IS NOT NULL;

-- Active subscription helpers.
CREATE OR REPLACE FUNCTION public.user_subscription_tier(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.tier
  FROM public.subscriptions s
  WHERE s.user_id = _user_id
    AND s.status IN ('active','trialing')
    AND (s.current_period_end IS NULL OR s.current_period_end > now())
  ORDER BY CASE s.tier WHEN 'honey' THEN 2 WHEN 'basic' THEN 1 ELSE 0 END DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.honey_coin_multiplier(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN public.user_subscription_tier(_user_id) = 'honey' THEN 2 ELSE 1 END
$$;

CREATE OR REPLACE FUNCTION public.honey_badge_limit(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE public.user_subscription_tier(_user_id)
    WHEN 'honey' THEN 3
    WHEN 'basic' THEN 2
    ELSE 1
  END
$$;

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
    t.tier = 'honey',
    t.tier = 'honey',
    t.tier IN ('basic','honey'),
    CASE WHEN t.tier = 'honey' THEN 500 ELSE 0 END
  FROM t
$$;

GRANT EXECUTE ON FUNCTION public.user_subscription_tier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.honey_coin_multiplier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.honey_badge_limit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.honey_entitlements(uuid) TO authenticated;

-- Server-side 2x Standard Honey coin multiplier for earned coins only.
CREATE OR REPLACE FUNCTION public._internal_award_coins(
  _user_id UUID,
  _amount INTEGER,
  _reason TEXT,
  _source_ref TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _new_balance INTEGER;
  _multiplier INTEGER := 1;
  _final_amount INTEGER;
  _final_metadata JSONB := COALESCE(_metadata, '{}'::jsonb);
BEGIN
  IF _amount <= 0 THEN RETURN NULL; END IF;

  IF _reason IN ('messages','voice_minutes','gaming_minutes') THEN
    _multiplier := public.honey_coin_multiplier(_user_id);
  END IF;

  _final_amount := _amount * _multiplier;
  IF _multiplier > 1 THEN
    _final_metadata := _final_metadata || jsonb_build_object('honey_multiplier', _multiplier, 'base_amount', _amount);
  END IF;

  INSERT INTO public.user_coins (user_id, balance, lifetime_earned)
  VALUES (_user_id, _final_amount + 25, _final_amount + 25)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.user_coins.balance + _final_amount,
        lifetime_earned = public.user_coins.lifetime_earned + _final_amount
  RETURNING balance INTO _new_balance;

  INSERT INTO public.coin_transactions (user_id, amount, reason, source_ref, metadata, balance_after)
  VALUES (_user_id, _final_amount, _reason, _source_ref, _final_metadata, _new_balance);

  RETURN _new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._internal_award_coins(UUID, INTEGER, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- Trim equipped badges down to the currently allowed tier limit.
CREATE OR REPLACE FUNCTION public.trim_equipped_badges(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _limit integer := public.honey_badge_limit(_user_id);
BEGIN
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY slot ASC, equipped_at ASC, id ASC) AS rn
    FROM public.user_equipped
    WHERE user_id = _user_id
      AND category = 'badge'
  )
  DELETE FROM public.user_equipped ue
  USING ranked r
  WHERE ue.id = r.id
    AND r.rn > _limit;

  -- Re-pack remaining badge slots to 0..N so future equips land cleanly.
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY slot ASC, equipped_at ASC, id ASC) - 1 AS new_slot
    FROM public.user_equipped
    WHERE user_id = _user_id
      AND category = 'badge'
  )
  UPDATE public.user_equipped ue
     SET slot = ranked.new_slot
    FROM ranked
   WHERE ue.id = ranked.id
     AND ue.slot <> ranked.new_slot;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trim_equipped_badges(uuid) TO authenticated;

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
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS subscriptions_trim_badges ON public.subscriptions;
CREATE TRIGGER subscriptions_trim_badges
  AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.trim_badges_after_subscription_change();

-- Enforce badge caps and Standard-Honey-only animated cosmetics at equip time.
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
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.user_inventory WHERE user_id = _uid AND item_id = _item_id) THEN
    RAISE EXCEPTION 'NOT_OWNED' USING ERRCODE = 'P0001';
  END IF;

  SELECT category, subcategory INTO _category, _subcategory FROM public.shop_items WHERE id = _item_id;
  IF _category IS NULL THEN RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;

  _tier := COALESCE(public.user_subscription_tier(_uid), 'free');

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

-- Standard Honey badge lookup stays active-Honey-only, but Basic/Standard both get badge artwork.
CREATE OR REPLACE FUNCTION public.honey_subscribers(_user_ids uuid[])
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.user_id
  FROM public.subscriptions s
  WHERE s.user_id = ANY(_user_ids)
    AND s.tier IN ('basic','honey')
    AND s.status IN ('active','trialing')
    AND (s.current_period_end IS NULL OR s.current_period_end > now());
$$;

GRANT EXECUTE ON FUNCTION public.honey_subscribers(uuid[]) TO authenticated;

-- Internal safe gem grant helper used below and by service code patterns.
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
  IF _amount <= 0 THEN RETURN NULL; END IF;

  IF _reason = 'subscription_grant' AND _source_ref IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.gems_transactions
    WHERE user_id = _user_id AND reason = 'subscription_grant' AND source_ref = _source_ref
  ) THEN
    SELECT balance INTO _new_bal FROM public.gems_balances WHERE user_id = _user_id;
    RETURN COALESCE(_new_bal, 0);
  END IF;

  INSERT INTO public.gems_balances (user_id, balance) VALUES (_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.gems_balances
     SET balance = balance + _amount,
         lifetime_earned = lifetime_earned + _amount,
         updated_at = now()
   WHERE user_id = _user_id
   RETURNING balance INTO _new_bal;

  INSERT INTO public.gems_transactions (user_id, amount, balance_after, reason, source_ref, metadata)
  VALUES (_user_id, _amount, _new_bal, _reason, _source_ref, COALESCE(_metadata, '{}'::jsonb));

  RETURN _new_bal;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._internal_credit_gems(uuid, integer, text, text, jsonb) FROM PUBLIC;

-- One-time v0.4.0 launch stipend for everyone who already has active Standard Honey.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT user_id
    FROM public.subscriptions
    WHERE tier = 'honey'
      AND status IN ('active','trialing')
      AND (current_period_end IS NULL OR current_period_end > now())
  LOOP
    PERFORM public._internal_credit_gems(
      r.user_id,
      500,
      'subscription_grant',
      'v0.4.0_launch_honey_stipend',
      jsonb_build_object('tier', 'honey', 'grant', 'launch_stipend')
    );
  END LOOP;
END $$;

-- Normalize existing equipped badges immediately after the rule change.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM public.user_equipped WHERE category = 'badge'
  LOOP
    PERFORM public.trim_equipped_badges(r.user_id);
  END LOOP;
END $$;