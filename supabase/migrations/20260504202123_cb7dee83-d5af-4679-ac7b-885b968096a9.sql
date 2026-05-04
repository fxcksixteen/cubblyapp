-- =========================================================
-- COIN CURRENCY SYSTEM (v0.3.0 foundation)
-- =========================================================

-- 1) Balance table
CREATE TABLE public.user_coins (
  user_id UUID PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 25 CHECK (balance >= 0),
  lifetime_earned INTEGER NOT NULL DEFAULT 25 CHECK (lifetime_earned >= 0),
  lifetime_spent INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_spent >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_coins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own coins"
  ON public.user_coins FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- No direct INSERT/UPDATE/DELETE from clients — all changes go through SECURITY DEFINER functions.

CREATE TRIGGER user_coins_updated_at
  BEFORE UPDATE ON public.user_coins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Transaction log
CREATE TABLE public.coin_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount INTEGER NOT NULL,                      -- positive = earned, negative = spent
  reason TEXT NOT NULL,                         -- 'voice_minutes' | 'messages' | 'gaming_minutes' | 'shop_purchase' | 'signup_bonus' | 'admin_grant'
  source_ref TEXT,                              -- e.g. shop item id, call event id
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX coin_transactions_user_idx ON public.coin_transactions (user_id, created_at DESC);

ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own coin transactions"
  ON public.coin_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 3) Backfill: give every existing profile 25 coins
INSERT INTO public.user_coins (user_id, balance, lifetime_earned)
SELECT p.user_id, 25, 25
FROM public.profiles p
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.coin_transactions (user_id, amount, reason, balance_after)
SELECT p.user_id, 25, 'signup_bonus', 25
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.coin_transactions t
  WHERE t.user_id = p.user_id AND t.reason = 'signup_bonus'
);

-- 4) Auto-create coins row on signup (extend handle_new_user)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, username, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    'online'
  );

  INSERT INTO public.user_coins (user_id, balance, lifetime_earned)
  VALUES (NEW.id, 25, 25)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.coin_transactions (user_id, amount, reason, balance_after)
  VALUES (NEW.id, 25, 'signup_bonus', 25);

  RETURN NEW;
END;
$function$;

-- 5) Award coins (called by earning engine — server side only via SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.award_coins(
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
  _caller UUID := auth.uid();
  _new_balance INTEGER;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  -- Users can only award themselves (the actual rate-limiting/validation
  -- happens inside the specific earning RPCs added in the next step).
  IF _caller <> _user_id THEN
    RAISE EXCEPTION 'Cannot award coins to another user';
  END IF;
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Award amount must be positive';
  END IF;
  IF _reason NOT IN ('voice_minutes','messages','gaming_minutes','signup_bonus','admin_grant') THEN
    RAISE EXCEPTION 'Invalid award reason: %', _reason;
  END IF;

  INSERT INTO public.user_coins (user_id, balance, lifetime_earned)
  VALUES (_user_id, _amount + 25, _amount + 25)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.user_coins.balance + _amount,
        lifetime_earned = public.user_coins.lifetime_earned + _amount
  RETURNING balance INTO _new_balance;

  INSERT INTO public.coin_transactions (user_id, amount, reason, source_ref, metadata, balance_after)
  VALUES (_user_id, _amount, _reason, _source_ref, _metadata, _new_balance);

  RETURN _new_balance;
END;
$$;

-- 6) Spend coins (used by shop purchases in a later step)
CREATE OR REPLACE FUNCTION public.spend_coins(
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
  _uid UUID := auth.uid();
  _current INTEGER;
  _new_balance INTEGER;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Spend amount must be positive';
  END IF;
  IF _reason NOT IN ('shop_purchase') THEN
    RAISE EXCEPTION 'Invalid spend reason: %', _reason;
  END IF;

  SELECT balance INTO _current FROM public.user_coins WHERE user_id = _uid FOR UPDATE;
  IF _current IS NULL THEN
    -- Lazy-create row if somehow missing
    INSERT INTO public.user_coins (user_id, balance, lifetime_earned) VALUES (_uid, 25, 25);
    _current := 25;
  END IF;

  IF _current < _amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_COINS' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.user_coins
     SET balance = balance - _amount,
         lifetime_spent = lifetime_spent + _amount
   WHERE user_id = _uid
   RETURNING balance INTO _new_balance;

  INSERT INTO public.coin_transactions (user_id, amount, reason, source_ref, metadata, balance_after)
  VALUES (_uid, -_amount, _reason, _source_ref, _metadata, _new_balance);

  RETURN _new_balance;
END;
$$;

-- 7) Realtime so the coin pill updates instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_coins;