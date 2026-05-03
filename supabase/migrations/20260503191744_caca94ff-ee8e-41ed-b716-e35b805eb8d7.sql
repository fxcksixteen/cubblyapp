REVOKE EXECUTE ON FUNCTION public.heartbeat_call_participant(uuid, boolean, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.heartbeat_call_participant(uuid, boolean, boolean, boolean, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.end_call_event_if_stale(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_call_event_if_stale(uuid, integer) TO authenticated;