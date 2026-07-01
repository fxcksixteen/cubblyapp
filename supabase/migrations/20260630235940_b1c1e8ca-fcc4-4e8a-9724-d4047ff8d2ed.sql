
CREATE TABLE IF NOT EXISTS public.conversation_pins (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  pinned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_pins TO authenticated;
GRANT ALL ON public.conversation_pins TO service_role;

ALTER TABLE public.conversation_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own pins"
  ON public.conversation_pins
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS conversation_pins_user_idx ON public.conversation_pins(user_id, pinned_at DESC);
