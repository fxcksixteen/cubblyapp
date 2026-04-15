CREATE TABLE public.gif_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  gif_id text NOT NULL,
  gif_url text NOT NULL,
  gif_preview_url text NOT NULL,
  title text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, gif_id)
);
ALTER TABLE public.gif_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own favorites" ON public.gif_favorites FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can add favorites" ON public.gif_favorites FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove favorites" ON public.gif_favorites FOR DELETE TO authenticated USING (auth.uid() = user_id);