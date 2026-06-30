
-- =========================================================
-- v0.4.0 Honey + Alpha foundation
-- =========================================================

-- ---------- profiles extensions ----------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS public_wishlist boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS who_can_dm text NOT NULL DEFAULT 'everyone' CHECK (who_can_dm IN ('everyone','friends_only','friends_of_friends'));

-- ---------- shop_items extensions ----------
ALTER TABLE public.shop_items
  ADD COLUMN IF NOT EXISTS price_gems integer,
  ADD COLUMN IF NOT EXISTS requires_subscription text CHECK (requires_subscription IN ('basic','honey'));

-- ---------- subscriptions ----------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('basic','honey')),
  interval text NOT NULL CHECK (interval IN ('monthly','annual')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','past_due','canceled','trialing','incomplete')),
  stripe_customer_id text,
  stripe_subscription_id text UNIQUE,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own subscription" ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- subscription_events ----------
CREATE TABLE IF NOT EXISTS public.subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_event_id text UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_events TO authenticated;
GRANT ALL ON public.subscription_events TO service_role;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own subscription events" ON public.subscription_events FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ---------- gems_balances ----------
CREATE TABLE IF NOT EXISTS public.gems_balances (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_earned integer NOT NULL DEFAULT 0,
  lifetime_spent integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gems_balances TO authenticated;
GRANT ALL ON public.gems_balances TO service_role;
ALTER TABLE public.gems_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own gems balance" ON public.gems_balances FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ---------- gems_transactions ----------
CREATE TABLE IF NOT EXISTS public.gems_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  reason text NOT NULL CHECK (reason IN ('purchase','subscription_grant','shop_purchase','gift_sent','gift_received','admin_grant','refund')),
  source_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  balance_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gems_transactions TO authenticated;
GRANT ALL ON public.gems_transactions TO service_role;
ALTER TABLE public.gems_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own gem transactions" ON public.gems_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ---------- gift_transactions ----------
CREATE TABLE IF NOT EXISTS public.gift_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gift_type text NOT NULL CHECK (gift_type IN ('subscription','shop_item','gems_bundle')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','declined','refunded')),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.gift_transactions TO authenticated;
GRANT ALL ON public.gift_transactions TO service_role;
ALTER TABLE public.gift_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see gifts they sent or received" ON public.gift_transactions FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE POLICY "users insert as sender" ON public.gift_transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "recipient updates claim status" ON public.gift_transactions FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id);

-- ---------- wishlist_items ----------
CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);
GRANT SELECT, INSERT, DELETE ON public.wishlist_items TO authenticated;
GRANT ALL ON public.wishlist_items TO service_role;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own wishlist" ON public.wishlist_items FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "anyone reads public wishlists" ON public.wishlist_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = wishlist_items.user_id AND p.public_wishlist = true));

-- ---------- message_requests ----------
CREATE TABLE IF NOT EXISTS public.message_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preview text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','blocked')),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender_id, recipient_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_requests TO authenticated;
GRANT ALL ON public.message_requests TO service_role;
ALTER TABLE public.message_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own message requests" ON public.message_requests FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE POLICY "users create requests they send" ON public.message_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "recipient updates request" ON public.message_requests FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id);
CREATE POLICY "sender can withdraw" ON public.message_requests FOR DELETE TO authenticated
  USING (auth.uid() = sender_id);
CREATE TRIGGER message_requests_updated_at BEFORE UPDATE ON public.message_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- custom_statuses ----------
CREATE TABLE IF NOT EXISTS public.custom_statuses (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  text text NOT NULL DEFAULT '',
  emoji text,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.custom_statuses TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.custom_statuses TO authenticated;
GRANT ALL ON public.custom_statuses TO service_role;
ALTER TABLE public.custom_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads custom statuses" ON public.custom_statuses FOR SELECT TO authenticated USING (true);
CREATE POLICY "users manage own status" ON public.custom_statuses FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER custom_statuses_updated_at BEFORE UPDATE ON public.custom_statuses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- activity_details ----------
CREATE TABLE IF NOT EXISTS public.activity_details (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_key)
);
GRANT SELECT ON public.activity_details TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.activity_details TO authenticated;
GRANT ALL ON public.activity_details TO service_role;
ALTER TABLE public.activity_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone reads activity details" ON public.activity_details FOR SELECT TO authenticated USING (true);
CREATE POLICY "users manage own activity details" ON public.activity_details FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- helper: entitlement check ----------
CREATE OR REPLACE FUNCTION public.user_subscription_tier(_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tier FROM public.subscriptions
   WHERE user_id = _user_id
     AND status IN ('active','trialing')
     AND (current_period_end IS NULL OR current_period_end > now())
   LIMIT 1
$$;
