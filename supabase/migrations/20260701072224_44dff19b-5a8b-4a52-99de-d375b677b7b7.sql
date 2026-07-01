
-- Force all usernames to lowercase and enforce it going forward.
UPDATE public.profiles SET username = lower(username) WHERE username IS NOT NULL AND username <> lower(username);

CREATE OR REPLACE FUNCTION public.lowercase_profile_username()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.username IS NOT NULL THEN
    NEW.username := lower(NEW.username);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_lowercase_username ON public.profiles;
CREATE TRIGGER profiles_lowercase_username
BEFORE INSERT OR UPDATE OF username ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.lowercase_profile_username();

-- Also lowercase inside handle_new_user for consistency with auth metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, username, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    lower(COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))),
    'online'
  );

  INSERT INTO public.user_coins (user_id, balance, lifetime_earned)
  VALUES (NEW.id, 25, 25)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.coin_transactions (user_id, amount, reason, balance_after)
  VALUES (NEW.id, 25, 'signup_bonus', 25);

  RETURN NEW;
END;
$$;
