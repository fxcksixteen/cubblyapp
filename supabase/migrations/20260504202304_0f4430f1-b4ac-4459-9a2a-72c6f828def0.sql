-- =========================================================
-- COIN EARNING ENGINE (v0.3.0)
-- =========================================================

-- 1) Per-user progress buckets
CREATE TABLE public.coin_earning_progress (
  user_id UUID PRIMARY KEY,
  voice_seconds_unclaimed INTEGER NOT NULL DEFAULT 0 CHECK (voice_seconds_unclaimed >= 0),
  message_count_unclaimed INTEGER NOT NULL DEFAULT 0 CHECK (message_count_unclaimed >= 0),
  gaming_seconds_unclaimed INTEGER NOT NULL DEFAULT 0 CHECK (gaming_seconds_unclaimed >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.coin_earning_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own coin progress"
  ON public.coin_earning_progress FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER coin_earning_progress_updated_at
  BEFORE UPDATE ON public.coin_earning_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Internal helper: award coins for a specific user without auth.uid() check
--    (used by the message trigger — runs as the row's sender_id).
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
BEGIN
  IF _amount <= 0 THEN RETURN NULL; END IF;

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

REVOKE EXECUTE ON FUNCTION public._internal_award_coins(UUID, INTEGER, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- 3) Message trigger: every message increments the sender's unclaimed bucket
--    and awards 10 coins for every full 100 messages.
CREATE OR REPLACE FUNCTION public.accrue_message_coins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _bot UUID := '00000000-0000-0000-0000-000000000001';
  _new_count INTEGER;
  _blocks INTEGER;
BEGIN
  IF NEW.sender_id = _bot THEN RETURN NEW; END IF;

  INSERT INTO public.coin_earning_progress (user_id, message_count_unclaimed)
  VALUES (NEW.sender_id, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET message_count_unclaimed = public.coin_earning_progress.message_count_unclaimed + 1
  RETURNING message_count_unclaimed INTO _new_count;

  IF _new_count >= 100 THEN
    _blocks := _new_count / 100;
    UPDATE public.coin_earning_progress
       SET message_count_unclaimed = message_count_unclaimed - (_blocks * 100)
     WHERE user_id = NEW.sender_id;

    PERFORM public._internal_award_coins(
      NEW.sender_id,
      _blocks * 10,
      'messages',
      NULL,
      jsonb_build_object('blocks', _blocks)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_accrue_coins
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.accrue_message_coins();

-- 4) Client-callable accrual for voice + gaming seconds.
--    The client heartbeats once per minute with the delta seconds since
--    its last heartbeat. Server clamps to a per-call max so a malicious
--    client can't dump arbitrarily large numbers.
CREATE OR REPLACE FUNCTION public.accrue_activity_coins(
  _voice_seconds INTEGER DEFAULT 0,
  _gaming_seconds INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid UUID := auth.uid();
  _v INTEGER := GREATEST(0, LEAST(COALESCE(_voice_seconds, 0), 600));   -- max 10 min/heartbeat
  _g INTEGER := GREATEST(0, LEAST(COALESCE(_gaming_seconds, 0), 600));
  _row public.coin_earning_progress%ROWTYPE;
  _voice_blocks INTEGER := 0;
  _gaming_blocks INTEGER := 0;
  _voice_award INTEGER := 0;
  _gaming_award INTEGER := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _v = 0 AND _g = 0 THEN
    RETURN jsonb_build_object('voice_awarded', 0, 'gaming_awarded', 0);
  END IF;

  INSERT INTO public.coin_earning_progress (user_id, voice_seconds_unclaimed, gaming_seconds_unclaimed)
  VALUES (_uid, _v, _g)
  ON CONFLICT (user_id) DO UPDATE
    SET voice_seconds_unclaimed  = public.coin_earning_progress.voice_seconds_unclaimed  + _v,
        gaming_seconds_unclaimed = public.coin_earning_progress.gaming_seconds_unclaimed + _g
  RETURNING * INTO _row;

  -- 30 minute = 1800s blocks
  _voice_blocks  := _row.voice_seconds_unclaimed  / 1800;
  _gaming_blocks := _row.gaming_seconds_unclaimed / 1800;

  IF _voice_blocks > 0 OR _gaming_blocks > 0 THEN
    UPDATE public.coin_earning_progress
       SET voice_seconds_unclaimed  = voice_seconds_unclaimed  - (_voice_blocks  * 1800),
           gaming_seconds_unclaimed = gaming_seconds_unclaimed - (_gaming_blocks * 1800)
     WHERE user_id = _uid;
  END IF;

  IF _voice_blocks > 0 THEN
    _voice_award := _voice_blocks * 10;
    PERFORM public._internal_award_coins(_uid, _voice_award, 'voice_minutes', NULL,
      jsonb_build_object('blocks', _voice_blocks));
  END IF;

  IF _gaming_blocks > 0 THEN
    _gaming_award := _gaming_blocks * 20;
    PERFORM public._internal_award_coins(_uid, _gaming_award, 'gaming_minutes', NULL,
      jsonb_build_object('blocks', _gaming_blocks));
  END IF;

  RETURN jsonb_build_object(
    'voice_awarded', _voice_award,
    'gaming_awarded', _gaming_award
  );
END;
$$;

-- 5) Realtime for instant reward toasts
ALTER PUBLICATION supabase_realtime ADD TABLE public.coin_transactions;