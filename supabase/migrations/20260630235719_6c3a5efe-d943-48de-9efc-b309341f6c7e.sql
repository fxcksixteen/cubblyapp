ALTER TABLE public.profiles ALTER COLUMN public_wishlist SET DEFAULT true;
UPDATE public.profiles SET public_wishlist = true WHERE public_wishlist = false;