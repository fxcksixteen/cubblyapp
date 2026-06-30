
CREATE TABLE IF NOT EXISTS public.activity_details (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  game_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_details TO authenticated;
GRANT ALL ON public.activity_details TO service_role;

ALTER TABLE public.activity_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authed can read activity details"
  ON public.activity_details FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users manage their own activity details"
  ON public.activity_details FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_details;
ALTER TABLE public.activity_details REPLICA IDENTITY FULL;
