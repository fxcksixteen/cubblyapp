-- Add banner_url to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banner_url text DEFAULT NULL;

-- Create call_events table for persistent call history
CREATE TABLE public.call_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  caller_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'ongoing',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.call_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view call events in their conversations"
  ON public.call_events FOR SELECT TO authenticated
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Users can create call events"
  ON public.call_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = caller_id AND public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Callers can update their own call events"
  ON public.call_events FOR UPDATE TO authenticated
  USING (auth.uid() = caller_id);