-- Per-user DM preferences (pin / mute / hidden) for iOS quick menu and future cross-platform parity
CREATE TABLE public.dm_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  peer_user_id UUID NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  muted BOOLEAN NOT NULL DEFAULT false,
  hidden BOOLEAN NOT NULL DEFAULT false,
  pinned_at TIMESTAMPTZ,
  muted_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, peer_user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dm_preferences TO authenticated;
GRANT ALL ON public.dm_preferences TO service_role;

ALTER TABLE public.dm_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own dm prefs" ON public.dm_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own dm prefs" ON public.dm_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own dm prefs" ON public.dm_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own dm prefs" ON public.dm_preferences
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_dm_preferences_user ON public.dm_preferences(user_id);

CREATE TRIGGER update_dm_preferences_updated_at
  BEFORE UPDATE ON public.dm_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();