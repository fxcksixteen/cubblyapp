-- honey_gifts: a gift card for a Cubbly Honey subscription posted in a chat.
CREATE TABLE public.honey_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('basic','honey')),
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('month','year')),
  payment_source TEXT NOT NULL CHECK (payment_source IN ('gems','stripe')),
  price_amount INTEGER NOT NULL, -- gems for gems, cents for stripe
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','refunded','canceled')),
  message TEXT,
  claimed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  stripe_session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.honey_gifts TO authenticated;
GRANT ALL ON public.honey_gifts TO service_role;

ALTER TABLE public.honey_gifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view honey gifts in their conversations"
ON public.honey_gifts FOR SELECT TO authenticated
USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE INDEX honey_gifts_conversation_idx ON public.honey_gifts(conversation_id);
CREATE INDEX honey_gifts_status_idx ON public.honey_gifts(status);

-- ── Gems pricing helper ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public._honey_gift_gems_price(_tier TEXT, _interval TEXT)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN _tier = 'basic' AND _interval = 'month' THEN 800
    WHEN _tier = 'basic' AND _interval = 'year'  THEN 8500
    WHEN _tier = 'honey' AND _interval = 'month' THEN 2200
    WHEN _tier = 'honey' AND _interval = 'year'  THEN 21000
    ELSE NULL
  END;
$$;

-- ── Send Honey Gift (paid with gems) ────────────────────────
CREATE OR REPLACE FUNCTION public.send_honey_gift_gems(
  _conversation_id UUID,
  _tier TEXT,
  _interval TEXT,
  _message TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _price INTEGER;
  _gift_id UUID;
  _msg_id UUID;
  _marker CONSTANT TEXT := '[[cubbly:honey-gift:v1]]';
  _payload JSONB;
  _new_balance INTEGER;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.is_conversation_participant(_conversation_id, _uid) THEN
    RAISE EXCEPTION 'Not a participant of this conversation';
  END IF;

  _price := public._honey_gift_gems_price(_tier, _interval);
  IF _price IS NULL THEN
    RAISE EXCEPTION 'INVALID_GIFT_PLAN' USING ERRCODE = 'P0001';
  END IF;

  _new_balance := public.spend_gems(_price, 'honey_gift',
    NULL, jsonb_build_object('tier', _tier, 'interval', _interval));

  INSERT INTO public.honey_gifts (
    sender_id, conversation_id, tier, billing_interval,
    payment_source, price_amount, message, status
  ) VALUES (
    _uid, _conversation_id, _tier, _interval,
    'gems', _price, NULLIF(btrim(_message),''), 'pending'
  ) RETURNING id INTO _gift_id;

  _payload := jsonb_build_object(
    'giftId',   _gift_id,
    'tier',     _tier,
    'interval', _interval,
    'message',  NULLIF(btrim(_message),'')
  );

  INSERT INTO public.messages (conversation_id, sender_id, content)
  VALUES (_conversation_id, _uid, _marker || _payload::text)
  RETURNING id INTO _msg_id;

  RETURN jsonb_build_object(
    'gift_id', _gift_id,
    'message_id', _msg_id,
    'balance_gems', _new_balance,
    'price', _price
  );
END;
$$;

-- ── Claim Honey Gift ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_honey_gift(_gift_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _g public.honey_gifts;
  _existing public.subscriptions;
  _period_add INTERVAL;
  _new_end TIMESTAMPTZ;
  _base_start TIMESTAMPTZ;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO _g FROM public.honey_gifts WHERE id = _gift_id FOR UPDATE;
  IF _g IS NULL THEN RAISE EXCEPTION 'GIFT_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF _g.status <> 'pending' THEN
    RAISE EXCEPTION 'ALREADY_CLAIMED' USING ERRCODE = 'P0001';
  END IF;
  IF _g.sender_id = _uid THEN
    RAISE EXCEPTION 'CANT_CLAIM_OWN_GIFT' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.is_conversation_participant(_g.conversation_id, _uid) THEN
    RAISE EXCEPTION 'Not a participant of this conversation';
  END IF;

  _period_add := CASE
    WHEN _g.billing_interval = 'year' THEN INTERVAL '1 year'
    ELSE INTERVAL '1 month'
  END;

  SELECT * INTO _existing FROM public.subscriptions WHERE user_id = _uid;

  IF _existing.user_id IS NOT NULL
     AND _existing.status IN ('active','trialing')
     AND _existing.current_period_end IS NOT NULL
     AND _existing.current_period_end > now() THEN
    _base_start := _existing.current_period_end;
  ELSE
    _base_start := now();
  END IF;
  _new_end := _base_start + _period_add;

  -- If they have an active PAID (stripe) sub, just extend the end date and
  -- keep their existing tier — never downgrade a paying member.
  IF _existing.user_id IS NOT NULL
     AND _existing.stripe_subscription_id IS NOT NULL
     AND _existing.status IN ('active','trialing') THEN
    UPDATE public.subscriptions
       SET current_period_end = _new_end,
           updated_at = now()
     WHERE user_id = _uid;
  ELSE
    -- No paid sub — grant/replace with the gifted tier.
    INSERT INTO public.subscriptions (
      user_id, tier, interval, status, current_period_end,
      stripe_customer_id, stripe_subscription_id, cancel_at_period_end
    ) VALUES (
      _uid, _g.tier,
      CASE WHEN _g.billing_interval = 'year' THEN 'annual' ELSE 'monthly' END,
      'active', _new_end, NULL, NULL, false
    )
    ON CONFLICT (user_id) DO UPDATE SET
      tier = EXCLUDED.tier,
      interval = EXCLUDED.interval,
      status = 'active',
      current_period_end = _new_end,
      cancel_at_period_end = false,
      updated_at = now();
  END IF;

  UPDATE public.honey_gifts
     SET status = 'claimed', claimed_by = _uid, claimed_at = now()
   WHERE id = _gift_id;

  RETURN jsonb_build_object(
    'ok', true,
    'tier', _g.tier,
    'interval', _g.billing_interval,
    'valid_until', _new_end
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_honey_gift_gems(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_honey_gift(UUID) TO authenticated;