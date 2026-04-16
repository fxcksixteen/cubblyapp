-- ============================================
-- user_activities: current activity per user (1 row per user)
-- ============================================
CREATE TABLE public.user_activities (
  user_id uuid PRIMARY KEY,
  activity_type text NOT NULL DEFAULT 'playing',
  name text,
  details text,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  privacy_visible boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_activities ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can see activities that are marked visible
CREATE POLICY "Visible activities readable by authenticated users"
ON public.user_activities
FOR SELECT
TO authenticated
USING (privacy_visible = true OR user_id = auth.uid());

CREATE POLICY "Users can insert own activity"
ON public.user_activities
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own activity"
ON public.user_activities
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own activity"
ON public.user_activities
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_user_activities_updated_at
BEFORE UPDATE ON public.user_activities
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER TABLE public.user_activities REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_activities;

-- ============================================
-- user_games: each user's personal manually-added games
-- ============================================
CREATE TABLE public.user_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  process_name text NOT NULL,
  display_name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, process_name)
);

ALTER TABLE public.user_games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own games"
ON public.user_games
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can add own games"
ON public.user_games
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove own games"
ON public.user_games
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_user_games_user_id ON public.user_games(user_id);