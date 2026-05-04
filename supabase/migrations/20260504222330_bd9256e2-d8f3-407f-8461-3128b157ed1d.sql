
REVOKE EXECUTE ON FUNCTION public.create_dm_conversation(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_group_conversation(text, uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_server(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_server_channel(uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_server_from_template(text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_server_invite(uuid, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.equip_shop_item(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.join_server_by_code(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.lookup_server_invite(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_conversation_read(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.purchase_shop_item(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.send_test_bot_reply(uuid) FROM anon;
