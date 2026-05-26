
-- 1) Push trigger: skip recipients who are actively reading the conversation
-- (last_read_at within 30s) OR currently online (profiles.last_seen_at within 30s
-- AND we'll trust the client to mark-read on focus). Cuts push edge invocations
-- dramatically for live group chats.
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
  _active_cutoff timestamptz := now() - interval '30 seconds';
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

  -- Web push: skip recipients who have read the conversation within the last 30s
  -- (they're staring at the chat right now — a push would just be noisy).
  -- Hard LIMIT 500 as a defensive guard for runaway-sized groups.
  for _recipient in
    select distinct cp.user_id
    from public.conversation_participants cp
    where cp.conversation_id = new.conversation_id
      and cp.user_id <> new.sender_id
      and cp.last_read_at < _active_cutoff
      and exists (select 1 from public.push_subscriptions ps where ps.user_id = cp.user_id)
    limit 500
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

  -- iOS push: same skip rule, same LIMIT guard.
  for _recipient in
    select distinct cp.user_id
    from public.conversation_participants cp
    where cp.conversation_id = new.conversation_id
      and cp.user_id <> new.sender_id
      and cp.last_read_at < _active_cutoff
      and exists (select 1 from public.apns_subscriptions a where a.user_id = cp.user_id)
    limit 500
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

-- 2) presence_heartbeat: stop bumping profiles.last_seen_at on every 30s tick.
-- Touch only user_sessions, which online_user_ids already consults. This kills
-- the constant profiles-UPDATE → realtime-fanout → cascade refetch on every
-- signed-in client (the single biggest source of WAL churn + Realtime egress).
CREATE OR REPLACE FUNCTION public.presence_heartbeat(_session_key text DEFAULT NULL::text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _now timestamptz := now();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _session_key IS NOT NULL AND length(_session_key) > 0 THEN
    UPDATE public.user_sessions
       SET last_seen_at = _now, revoked_at = NULL
     WHERE user_id = _uid AND session_key = _session_key;
  END IF;
  RETURN _now;
END;
$function$;

-- 3) Trim realtime publication: drop profiles + user_activities. They were
-- being fanned to every signed-in client with no filter (profiles every 30s
-- per user, user_activities on every game change).
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='profiles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='user_activities'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.user_activities';
  END IF;
END $$;

-- 4) Persistent cache for link previews. Today each render = one edge invocation
-- + one 512 KB upstream fetch. With this table the edge function can do a
-- cache lookup first and only re-fetch when older than 30 days.
CREATE TABLE IF NOT EXISTS public.link_previews (
  url_hash   text PRIMARY KEY,
  url        text NOT NULL,
  title      text,
  description text,
  image      text,
  site_name  text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.link_previews ENABLE ROW LEVEL SECURITY;

-- Any signed-in user can read cached previews; writes are done by the edge
-- function with the service-role key, which bypasses RLS by design.
CREATE POLICY "Authenticated users can read link previews"
ON public.link_previews
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX IF NOT EXISTS link_previews_fetched_at_idx
  ON public.link_previews (fetched_at);
