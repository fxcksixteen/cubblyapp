CREATE OR REPLACE FUNCTION public.send_test_bot_reply(_conversation_id uuid)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bot_user_id constant uuid := '00000000-0000-0000-0000-000000000001';
  _reply text;
  _inserted_message public.messages;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.is_conversation_participant(_conversation_id, auth.uid()) THEN
    RAISE EXCEPTION 'You are not part of this conversation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = _conversation_id
      AND user_id = _bot_user_id
  ) THEN
    RAISE EXCEPTION 'Conversation does not include the test bot';
  END IF;

  _reply := (
    ARRAY[
      'Hey there! 👋 How''s it going?',
      'That''s interesting! Tell me more.',
      'I''m just a bot, but I''m here to help you test! 🤖',
      'Nice message! Everything seems to be working great.',
      'Beep boop! Message received loud and clear! 📬',
      'Thanks for chatting with me! I''m CubblyBot, your friendly test companion.',
      'Wow, great conversation! Keep it coming! 😄',
      'I can confirm: your messages are being sent and delivered perfectly! ✅'
    ]
  )[1 + floor(random() * 8)::int];

  INSERT INTO public.messages (conversation_id, sender_id, content)
  VALUES (_conversation_id, _bot_user_id, _reply)
  RETURNING * INTO _inserted_message;

  RETURN _inserted_message;
END;
$$;

DROP POLICY IF EXISTS "Bot can send messages to its conversations" ON public.messages;
CREATE POLICY "Bot can send messages to its conversations"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = '00000000-0000-0000-0000-000000000001'
  AND public.is_conversation_participant(conversation_id, auth.uid())
  AND public.is_conversation_participant(conversation_id, sender_id)
);