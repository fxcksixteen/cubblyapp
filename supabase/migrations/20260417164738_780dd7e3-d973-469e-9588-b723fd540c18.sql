ALTER TABLE public.messages
  ADD COLUMN reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id ON public.messages(reply_to_id);