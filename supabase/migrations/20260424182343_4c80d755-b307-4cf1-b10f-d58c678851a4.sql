-- iOS device push tokens (APNs)
CREATE TABLE IF NOT EXISTS public.apns_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_token text NOT NULL,
  bundle_id text NOT NULL DEFAULT 'app.cubbly.ios',
  environment text NOT NULL DEFAULT 'production', -- 'sandbox' or 'production'
  device_name text,
  app_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_token)
);

CREATE INDEX IF NOT EXISTS idx_apns_subs_user ON public.apns_subscriptions(user_id);

ALTER TABLE public.apns_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own apns subs"
  ON public.apns_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own apns subs"
  ON public.apns_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own apns subs"
  ON public.apns_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own apns subs"
  ON public.apns_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_apns_subs_updated_at
  BEFORE UPDATE ON public.apns_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Update message push trigger to also call send-apns-push for iOS devices.
CREATE OR REPLACE FUNCTION public.notify_push_on_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
    perform extensions.http_post(
      url := _web_fn_url,
      headers := jsonb_build_object('Content-Type', 'application/json')::jsonb,
      body := jsonb_build_object(
        'user_id', _recipient.user_id,
        'title', _title,
        'body', _preview,
        'tag', 'dm:' || new.conversation_id::text,
        'url', '/@me/chat/' || new.conversation_id::text,
        'icon', coalesce(case when _conv_is_group then _conv_pic else _sender_avatar end, '/favicon.ico')
      )::jsonb
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
    perform extensions.http_post(
      url := _ios_fn_url,
      headers := jsonb_build_object('Content-Type', 'application/json')::jsonb,
      body := jsonb_build_object(
        'user_id', _recipient.user_id,
        'title', _title,
        'body', _preview,
        'conversation_id', new.conversation_id::text,
        'thread_id', 'dm:' || new.conversation_id::text
      )::jsonb
    );
  end loop;

  return new;
exception when others then
  raise warning 'notify_push_on_message failed: %', sqlerrm;
  return new;
end;
$function$;
