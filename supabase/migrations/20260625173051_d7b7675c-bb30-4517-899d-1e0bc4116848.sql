
CREATE TABLE public.conversation_mutes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  muted_until TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, conversation_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_mutes TO authenticated;
GRANT ALL ON public.conversation_mutes TO service_role;

ALTER TABLE public.conversation_mutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own conversation mutes"
ON public.conversation_mutes
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS conversation_mutes_user_idx ON public.conversation_mutes(user_id);
