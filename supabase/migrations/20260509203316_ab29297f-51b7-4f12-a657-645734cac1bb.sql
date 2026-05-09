-- Remove the legacy zero-arg presence_heartbeat overload so there's a single canonical
-- function. The session-key-aware version still works when called with no args
-- (the parameter has DEFAULT NULL).
DROP FUNCTION IF EXISTS public.presence_heartbeat();