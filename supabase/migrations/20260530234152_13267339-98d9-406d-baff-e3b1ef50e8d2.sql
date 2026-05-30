GRANT SELECT ON public.shop_items TO authenticated;
GRANT SELECT ON public.user_equipped TO authenticated;
GRANT ALL ON public.shop_items TO service_role;
GRANT ALL ON public.user_equipped TO service_role;