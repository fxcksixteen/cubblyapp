-- 1. Replace the trigger function to use the correct pg_net function name
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
  _anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1YmFscnRtc3htZHJwY2tucHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTIxNjgsImV4cCI6MjA5MTc2ODE2OH0.xIiNVGM7mT-hKcBpyoL51Mo8IC1WeHQH5q96FaSgiM0';
begin
  if new.sender_id = '00000000-0000-0000-0000-000000000001'::uuid then
    return new;
  end if;

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

  -- Web push
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
        'Authorization', 'Bearer ' || _anon_key
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

  -- iOS APNs push
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
        'Authorization', 'Bearer ' || _anon_key
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

-- 2. Attach the trigger (drop first if exists for idempotency)
DROP TRIGGER IF EXISTS trg_notify_push_on_message ON public.messages;
CREATE TRIGGER trg_notify_push_on_message
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_push_on_message();

-- 3. Also ensure bump_conversation trigger is attached (sidecar, used by inbox sort)
DROP TRIGGER IF EXISTS trg_bump_conversation_on_message ON public.messages;
CREATE TRIGGER trg_bump_conversation_on_message
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.bump_conversation_on_message();

-- 4. Ensure handle_new_user trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- 5. Remove the malformed half-length token (64 chars instead of 160)
DELETE FROM public.apns_subscriptions WHERE length(device_token) <> 160;