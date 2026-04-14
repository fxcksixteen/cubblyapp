
CREATE OR REPLACE FUNCTION public.create_dm_conversation(other_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv_id UUID;
  existing_conv_id UUID;
BEGIN
  -- Check if conversation already exists between these two users
  SELECT cp1.conversation_id INTO existing_conv_id
  FROM conversation_participants cp1
  JOIN conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
  WHERE cp1.user_id = auth.uid() AND cp2.user_id = other_user_id
  LIMIT 1;

  IF existing_conv_id IS NOT NULL THEN
    RETURN existing_conv_id;
  END IF;

  -- Create new conversation
  INSERT INTO conversations DEFAULT VALUES RETURNING id INTO conv_id;
  
  -- Add both participants
  INSERT INTO conversation_participants (conversation_id, user_id) VALUES (conv_id, auth.uid());
  INSERT INTO conversation_participants (conversation_id, user_id) VALUES (conv_id, other_user_id);
  
  RETURN conv_id;
END;
$$;
