-- Add a mutual-server helper and gate DM creation so that users who are
-- neither friends nor share at least one server cannot open a DM or send a
-- message request. Discord-style: friends can DM directly; non-friends who
-- share a server route through the existing message-request/policy flow;
-- everyone else is blocked outright.

CREATE OR REPLACE FUNCTION public.share_mutual_server(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.server_members sma
    JOIN public.server_members smb ON smb.server_id = sma.server_id
    WHERE sma.user_id = _a
      AND smb.user_id = _b
  );
$$;

CREATE OR REPLACE FUNCTION public.create_dm_conversation(other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  conv_id uuid;
  existing_conv_id uuid;
  policy text;
  are_fr boolean;
  share_srv boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF other_user_id = auth.uid() THEN RAISE EXCEPTION 'CANT_DM_SELF'; END IF;

  -- If a 1:1 conversation already exists between these two users, return it
  -- immediately — they can keep talking regardless of current friend/server
  -- status (prevents breaking historical DMs if a server is later left).
  SELECT c.id INTO existing_conv_id
  FROM public.conversations c
  JOIN public.conversation_participants cp1
    ON cp1.conversation_id = c.id AND cp1.user_id = auth.uid()
  JOIN public.conversation_participants cp2
    ON cp2.conversation_id = c.id AND cp2.user_id = other_user_id
  WHERE c.is_group = false
    AND c.server_id IS NULL
    AND (SELECT count(*) FROM public.conversation_participants p WHERE p.conversation_id = c.id) = 2
  LIMIT 1;
  IF existing_conv_id IS NOT NULL THEN RETURN existing_conv_id; END IF;

  are_fr    := public.are_friends(auth.uid(), other_user_id);
  share_srv := public.share_mutual_server(auth.uid(), other_user_id);

  -- Hard gate: not friends AND no mutual server → cannot initiate a DM or
  -- even a message request. Must add them as a friend first.
  IF NOT are_fr AND NOT share_srv THEN
    RAISE EXCEPTION 'NO_MUTUAL_SERVER' USING ERRCODE = 'P0001';
  END IF;

  -- Friends bypass the recipient's who_can_dm policy.
  IF NOT are_fr THEN
    SELECT who_can_dm INTO policy FROM public.dm_preferences WHERE user_id = other_user_id;
    policy := COALESCE(policy, 'everyone');

    IF policy = 'friends_only' THEN
      INSERT INTO public.message_requests (sender_id, recipient_id, status)
      VALUES (auth.uid(), other_user_id, 'pending')
      ON CONFLICT DO NOTHING;
      RAISE EXCEPTION 'MESSAGE_REQUEST_SENT' USING ERRCODE = 'P0001';
    END IF;

    IF policy = 'friends_of_friends'
       AND NOT public.share_mutual_friend(auth.uid(), other_user_id) THEN
      INSERT INTO public.message_requests (sender_id, recipient_id, status)
      VALUES (auth.uid(), other_user_id, 'pending')
      ON CONFLICT DO NOTHING;
      RAISE EXCEPTION 'MESSAGE_REQUEST_SENT' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.conversations (is_group) VALUES (false) RETURNING id INTO conv_id;
  INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (conv_id, auth.uid());
  INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (conv_id, other_user_id);

  RETURN conv_id;
END $$;
