
-- Lock non-status columns on recipient UPDATE for gift_transactions and message_requests.
-- RLS WITH CHECK cannot reference OLD, so enforce via BEFORE UPDATE triggers.

CREATE OR REPLACE FUNCTION public.gift_transactions_lock_non_status_on_recipient_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce for the recipient acting on their own row (client-side path).
  -- service_role and other paths bypass by design (edge functions, admin).
  IF auth.uid() IS NULL OR auth.uid() <> OLD.recipient_id THEN
    RETURN NEW;
  END IF;
  IF NEW.sender_id      IS DISTINCT FROM OLD.sender_id
  OR NEW.recipient_id   IS DISTINCT FROM OLD.recipient_id
  OR NEW.gift_type      IS DISTINCT FROM OLD.gift_type
  OR NEW.payload        IS DISTINCT FROM OLD.payload
  OR NEW.message        IS DISTINCT FROM OLD.message
  OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
  OR NEW.message_id     IS DISTINCT FROM OLD.message_id
  OR NEW.created_at     IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Recipients may only update status/claimed_at on gift_transactions';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gift_transactions_lock_non_status ON public.gift_transactions;
CREATE TRIGGER gift_transactions_lock_non_status
BEFORE UPDATE ON public.gift_transactions
FOR EACH ROW EXECUTE FUNCTION public.gift_transactions_lock_non_status_on_recipient_update();


CREATE OR REPLACE FUNCTION public.message_requests_lock_non_status_on_recipient_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> OLD.recipient_id THEN
    RETURN NEW;
  END IF;
  IF NEW.sender_id       IS DISTINCT FROM OLD.sender_id
  OR NEW.recipient_id    IS DISTINCT FROM OLD.recipient_id
  OR NEW.preview         IS DISTINCT FROM OLD.preview
  OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
  OR NEW.created_at      IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Recipients may only update status on message_requests';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS message_requests_lock_non_status ON public.message_requests;
CREATE TRIGGER message_requests_lock_non_status
BEFORE UPDATE ON public.message_requests
FOR EACH ROW EXECUTE FUNCTION public.message_requests_lock_non_status_on_recipient_update();
