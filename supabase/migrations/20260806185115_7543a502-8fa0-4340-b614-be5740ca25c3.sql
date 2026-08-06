CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_desc_nulls_last
  ON public.messages (conversation_id, created_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_call_events_started_at
  ON public.call_events (started_at);