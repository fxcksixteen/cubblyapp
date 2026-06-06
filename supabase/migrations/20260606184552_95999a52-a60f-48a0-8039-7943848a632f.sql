CREATE OR REPLACE FUNCTION public.create_dm_conversation(other_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  conv_id UUID;
  existing_conv_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Look for an existing TRUE 1:1 DM (not a group) that contains both users
  -- and has exactly 2 participants.
  SELECT c.id INTO existing_conv_id
  FROM public.conversations c
  JOIN public.conversation_participants cp1
    ON cp1.conversation_id = c.id AND cp1.user_id = auth.uid()
  JOIN public.conversation_participants cp2
    ON cp2.conversation_id = c.id AND cp2.user_id = other_user_id
  WHERE c.is_group = false
    AND c.server_id IS NULL
    AND (
      SELECT count(*) FROM public.conversation_participants p
      WHERE p.conversation_id = c.id
    ) = 2
  LIMIT 1;

  IF existing_conv_id IS NOT NULL THEN
    RETURN existing_conv_id;
  END IF;

  INSERT INTO public.conversations (is_group) VALUES (false) RETURNING id INTO conv_id;
  INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (conv_id, auth.uid());
  INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (conv_id, other_user_id);

  RETURN conv_id;
END;
$function$;