-- Enable pg_net so we can make HTTP calls from triggers
create extension if not exists pg_net with schema extensions;

-- Function: on message insert, call send-push-notification for every
-- other conversation participant (who has at least one push subscription)
create or replace function public.notify_push_on_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _sender_name text;
  _sender_avatar text;
  _conv_is_group boolean;
  _conv_name text;
  _conv_pic text;
  _title text;
  _body text;
  _preview text;
  _recipient record;
  _supabase_url text := 'https://rubalrtmsxmdrpcknprz.supabase.co';
  _fn_url text := _supabase_url || '/functions/v1/send-push-notification';
  _auth_header text;
begin
  -- Skip bot messages (special uuid used by send_test_bot_reply)
  if new.sender_id = '00000000-0000-0000-0000-000000000001'::uuid then
    return new;
  end if;

  -- Sender profile
  select display_name, avatar_url
    into _sender_name, _sender_avatar
  from public.profiles
  where user_id = new.sender_id
  limit 1;

  -- Conversation metadata
  select is_group, name, picture_url
    into _conv_is_group, _conv_name, _conv_pic
  from public.conversations
  where id = new.conversation_id
  limit 1;

  -- Preview: strip attachment blocks and clamp length
  _preview := coalesce(new.content, '');
  _preview := regexp_replace(_preview, '\[attachments\].*?\[/attachments\]', '📎 Attachment', 'gs');
  _preview := btrim(_preview);
  if length(_preview) > 140 then
    _preview := left(_preview, 140) || '…';
  end if;
  if _preview = '' then
    _preview := 'Sent you a message';
  end if;

  -- Title: sender name (prepend group name when relevant)
  if _conv_is_group then
    _title := coalesce(_sender_name, 'Someone') ||
      case when _conv_name is not null and _conv_name <> '' then ' • ' || _conv_name else '' end;
  else
    _title := coalesce(_sender_name, 'Someone');
  end if;

  -- Service-role auth for invoking the edge function from Postgres
  _auth_header := 'Bearer ' || current_setting('app.settings.service_role_key', true);
  if _auth_header is null or _auth_header = 'Bearer ' then
    -- Fallback for environments without app.settings; pg_net will still send to a
    -- public verify_jwt=false function. We keep the header blank in that case.
    _auth_header := '';
  end if;

  -- For every other participant who has at least one push subscription, fire a push
  for _recipient in
    select distinct cp.user_id
    from public.conversation_participants cp
    where cp.conversation_id = new.conversation_id
      and cp.user_id <> new.sender_id
      and exists (
        select 1 from public.push_subscriptions ps where ps.user_id = cp.user_id
      )
  loop
    perform extensions.http_post(
      url := _fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      )::jsonb,
      body := jsonb_build_object(
        'user_id', _recipient.user_id,
        'title', _title,
        'body', _preview,
        'tag', 'dm:' || new.conversation_id::text,
        'url', '/@me/chat/' || new.conversation_id::text,
        'icon', coalesce(
          case when _conv_is_group then _conv_pic else _sender_avatar end,
          '/favicon.ico'
        )
      )::jsonb
    );
  end loop;

  return new;
exception when others then
  -- Never let a push failure block the message insert
  raise warning 'notify_push_on_message failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notify_push_on_message on public.messages;

create trigger trg_notify_push_on_message
after insert on public.messages
for each row
execute function public.notify_push_on_message();