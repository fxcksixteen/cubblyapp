
-- 1) Tighten conversations INSERT policy: enforce owner == self and server membership.
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON public.conversations;

CREATE POLICY "Users can create conversations they own"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (owner_id IS NULL OR owner_id = auth.uid())
  AND (server_id IS NULL OR public.is_server_member(server_id, auth.uid()))
  AND (
    server_channel_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.server_channels sc
      WHERE sc.id = server_channel_id
        AND public.is_server_member(sc.server_id, auth.uid())
    )
  )
);

-- 2) Revoke EXECUTE from anon (and PUBLIC) on SECURITY DEFINER functions that
--    were reachable without signing in. Trigger functions don't need any grant;
--    user-callable helpers stay callable by authenticated.
REVOKE EXECUTE ON FUNCTION public.claim_honey_monthly_gems() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.honey_badge_limit(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.honey_coin_multiplier(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.honey_entitlements(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trim_badges_after_subscription_change() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trim_equipped_badges(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trim_honey_cosmetics(uuid) FROM anon, PUBLIC;
