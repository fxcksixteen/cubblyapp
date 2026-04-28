-- Cross-platform message reactions
CREATE TABLE public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX idx_message_reactions_message_id ON public.message_reactions(message_id);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Helper: is the current user a participant of the conversation owning this message?
CREATE OR REPLACE FUNCTION public.can_access_message(_message_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = _message_id
      AND public.is_conversation_participant(m.conversation_id, auth.uid())
  );
$$;

CREATE POLICY "Users can view reactions in their conversations"
  ON public.message_reactions FOR SELECT
  TO authenticated
  USING (public.can_access_message(message_id));

CREATE POLICY "Users can add their own reactions"
  ON public.message_reactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_access_message(message_id));

CREATE POLICY "Users can remove their own reactions"
  ON public.message_reactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;