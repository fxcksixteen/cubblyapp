-- Group chat support: add metadata to conversations table
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS is_group boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS picture_url text,
  ADD COLUMN IF NOT EXISTS owner_id uuid;

-- Allow conversation owners (and participants for non-destructive fields) to update group metadata
CREATE POLICY "Owners can update group conversations"
ON public.conversations
FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

-- Allow participants to leave a group (delete their own row)
CREATE POLICY "Users can remove themselves from conversations"
ON public.conversation_participants
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Allow group owners to add/remove other participants
CREATE POLICY "Group owners can add participants"
ON public.conversation_participants
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
      AND c.is_group = true
      AND c.owner_id = auth.uid()
  )
);

CREATE POLICY "Group owners can remove participants"
ON public.conversation_participants
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
      AND c.is_group = true
      AND c.owner_id = auth.uid()
  )
);

-- RPC: create a group conversation with initial members in one transaction
CREATE OR REPLACE FUNCTION public.create_group_conversation(
  _name text,
  _member_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv_id uuid;
  member_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.conversations (is_group, name, owner_id)
  VALUES (true, NULLIF(trim(_name), ''), auth.uid())
  RETURNING id INTO conv_id;

  -- Add the creator
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (conv_id, auth.uid());

  -- Add each member (skip the owner if accidentally included, dedupe)
  IF _member_ids IS NOT NULL THEN
    FOREACH member_id IN ARRAY _member_ids LOOP
      IF member_id IS NOT NULL AND member_id <> auth.uid() THEN
        INSERT INTO public.conversation_participants (conversation_id, user_id)
        VALUES (conv_id, member_id)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN conv_id;
END;
$$;

-- Storage bucket for group pictures (public, like avatars)
INSERT INTO storage.buckets (id, name, public)
VALUES ('group-pictures', 'group-pictures', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Group pictures are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'group-pictures');

CREATE POLICY "Authenticated users can upload group pictures"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'group-pictures');

CREATE POLICY "Users can update group pictures they uploaded"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'group-pictures' AND auth.uid()::text = (storage.foldername(name))[1]);
