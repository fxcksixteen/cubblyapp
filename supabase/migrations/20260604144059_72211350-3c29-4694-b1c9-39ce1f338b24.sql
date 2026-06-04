ALTER TABLE public.user_coins REPLICA IDENTITY FULL;
ALTER TABLE public.coin_transactions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_coins;
ALTER PUBLICATION supabase_realtime ADD TABLE public.coin_transactions;