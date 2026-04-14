
-- Tighten conversation_participants insert: users can only add themselves
DROP POLICY "Authenticated users can add participants" ON public.conversation_participants;
CREATE POLICY "Users can add themselves to conversations"
  ON public.conversation_participants FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Tighten conversations insert: require user to also add themselves as participant
-- (kept permissive since creating a conversation is harmless without participants)
DROP POLICY "Authenticated users can create conversations" ON public.conversations;
CREATE POLICY "Authenticated users can create conversations"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
