-- 1. Add last_read_at to conversation_participants for unread tracking
ALTER TABLE public.conversation_participants
ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Allow users to update their own participant row (to mark as read)
CREATE POLICY "Users can update their own participant row"
ON public.conversation_participants
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 2. Default new profiles to 'online' instead of 'offline'
ALTER TABLE public.profiles
ALTER COLUMN status SET DEFAULT 'online';

-- Update existing offline profiles to online (one-time fix for existing users stuck offline)
UPDATE public.profiles SET status = 'online' WHERE status = 'offline';

-- Update handle_new_user to explicitly set online status
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, username, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    'online'
  );
  RETURN NEW;
END;
$function$;

-- 3. Call participants table for tracking who is in a call + their mute/deafen state
CREATE TABLE IF NOT EXISTS public.call_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_event_id UUID NOT NULL REFERENCES public.call_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  is_muted BOOLEAN NOT NULL DEFAULT false,
  is_deafened BOOLEAN NOT NULL DEFAULT false,
  is_video_on BOOLEAN NOT NULL DEFAULT false,
  is_screen_sharing BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  UNIQUE(call_event_id, user_id)
);

ALTER TABLE public.call_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view call participants in their conversations"
ON public.call_participants FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.call_events ce
  WHERE ce.id = call_event_id
    AND public.is_conversation_participant(ce.conversation_id, auth.uid())
));

CREATE POLICY "Users can insert their own call participation"
ON public.call_participants FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own call participation"
ON public.call_participants FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. Enable realtime on tables that need instant updates
ALTER TABLE public.friendships REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_participants REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.call_participants REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.call_participants; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 5. Function: bump conversations.updated_at when a new message is inserted (so DM list reorders live)
CREATE OR REPLACE FUNCTION public.bump_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bump_conversation_on_message_trigger ON public.messages;
CREATE TRIGGER bump_conversation_on_message_trigger
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_on_message();

-- 6. Function to mark a conversation as read
CREATE OR REPLACE FUNCTION public.mark_conversation_read(_conversation_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.conversation_participants
  SET last_read_at = now()
  WHERE conversation_id = _conversation_id AND user_id = auth.uid();
$$;