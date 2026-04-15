
-- Fix 1: Friendships - only addressee can update (accept/decline)
DROP POLICY IF EXISTS "Users can update friendships they are part of" ON public.friendships;
CREATE POLICY "Only addressee can update friendship status"
  ON public.friendships FOR UPDATE TO authenticated
  USING (auth.uid() = addressee_id)
  WITH CHECK (auth.uid() = addressee_id);

-- Fix 2: Make chat-attachments bucket private
UPDATE storage.buckets SET public = false WHERE id = 'chat-attachments';

-- Fix 3: Drop overly broad storage policies and add proper ones
DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own chat attachments" ON storage.objects;

-- Only conversation participants can view attachments (folder = conversation_id)
CREATE POLICY "Conversation participants can view attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND public.is_conversation_participant(
      (storage.foldername(name))[1]::uuid,
      auth.uid()
    )
  );

-- Only conversation participants can upload attachments
CREATE POLICY "Conversation participants can upload attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND public.is_conversation_participant(
      (storage.foldername(name))[1]::uuid,
      auth.uid()
    )
  );

-- Users can delete their own uploads
CREATE POLICY "Users can delete own chat attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT conversation_id FROM public.conversation_participants WHERE user_id = auth.uid()
    )
  );
