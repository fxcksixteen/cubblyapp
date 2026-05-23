-- Private table holding a shared secret for internal push calls.
CREATE TABLE IF NOT EXISTS public._internal_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._internal_secrets ENABLE ROW LEVEL SECURITY;
-- No policies => only service_role / SECURITY DEFINER funcs can read.
REVOKE ALL ON public._internal_secrets FROM anon, authenticated, public;

INSERT INTO public._internal_secrets (name, value)
VALUES ('push_internal_secret', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

-- SECURITY DEFINER fn callable only by service_role to fetch the secret.
CREATE OR REPLACE FUNCTION public.get_internal_secret(_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _v text;
BEGIN
  -- Only service_role may call this (edge funcs using SERVICE_ROLE key).
  IF current_setting('request.jwt.claim.role', true) <> 'service_role'
     AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT value INTO _v FROM public._internal_secrets WHERE name = _name;
  RETURN _v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_internal_secret(text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.get_internal_secret(text) TO service_role;

-- Update push trigger to send the internal secret as Bearer.
CREATE OR REPLACE FUNCTION public.notify_push_on_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'net'
AS $function$
declare
  _sender_name text;
  _sender_avatar text;
  _conv_is_group boolean;
  _conv_name text;
  _conv_pic text;
  _title text;
  _preview text;
  _recipient record;
  _supabase_url text := 'https://rubalrtmsxmdrpcknprz.supabase.co';
  _web_fn_url text := _supabase_url || '/functions/v1/send-push-notification';
  _ios_fn_url text := _supabase_url || '/functions/v1/send-apns-push';
  _push_secret text;
begin
  if new.sender_id = '00000000-0000-0000-0000-000000000001'::uuid then
    return new;
  end if;

  SELECT value INTO _push_secret FROM public._internal_secrets WHERE name = 'push_internal_secret';

  select display_name, avatar_url
    into _sender_name, _sender_avatar
  from public.profiles where user_id = new.sender_id limit 1;

  select is_group, name, picture_url
    into _conv_is_group, _conv_name, _conv_pic
  from public.conversations where id = new.conversation_id limit 1;

  _preview := coalesce(new.content, '');
  _preview := regexp_replace(_preview, '\[attachments\].*?\[/attachments\]', '📎 Attachment', 'gs');
  _preview := btrim(_preview);
  if length(_preview) > 140 then
    _preview := left(_preview, 140) || '…';
  end if;
  if _preview = '' then
    _preview := 'Sent you a message';
  end if;

  if _conv_is_group then
    _title := coalesce(_sender_name, 'Someone') ||
      case when _conv_name is not null and _conv_name <> '' then ' • ' || _conv_name else '' end;
  else
    _title := coalesce(_sender_name, 'Someone');
  end if;

  for _recipient in
    select distinct cp.user_id
    from public.conversation_participants cp
    where cp.conversation_id = new.conversation_id
      and cp.user_id <> new.sender_id
      and exists (select 1 from public.push_subscriptions ps where ps.user_id = cp.user_id)
  loop
    perform net.http_post(
      url := _web_fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', _push_secret
      ),
      body := jsonb_build_object(
        'user_id', _recipient.user_id,
        'title', _title,
        'body', _preview,
        'tag', 'dm:' || new.conversation_id::text,
        'url', '/@me/chat/' || new.conversation_id::text,
        'icon', coalesce(case when _conv_is_group then _conv_pic else _sender_avatar end, '/favicon.ico')
      )
    );
  end loop;

  for _recipient in
    select distinct cp.user_id
    from public.conversation_participants cp
    where cp.conversation_id = new.conversation_id
      and cp.user_id <> new.sender_id
      and exists (select 1 from public.apns_subscriptions a where a.user_id = cp.user_id)
  loop
    perform net.http_post(
      url := _ios_fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', _push_secret
      ),
      body := jsonb_build_object(
        'user_id', _recipient.user_id,
        'title', _title,
        'body', _preview,
        'conversation_id', new.conversation_id::text,
        'thread_id', 'dm:' || new.conversation_id::text
      )
    );
  end loop;

  return new;
exception when others then
  raise warning 'notify_push_on_message failed: %', sqlerrm;
  return new;
end;
$function$;