UPDATE public.shop_items
SET subcategory = 'animated',
    config = CASE id
      WHEN 'theme_sky_dusk'      THEN '{"theme":"sky","animated":true,"preview":"linear-gradient(180deg,#1a3a6e 0%,#3a5a8e 35%,#6b7fa8 65%,#d4a373 100%)"}'::jsonb
      WHEN 'theme_snowy_drift'   THEN '{"theme":"snowy","animated":true,"preview":"linear-gradient(180deg,#1a2735 0%,#243a52 60%,#3a5470 100%)"}'::jsonb
      WHEN 'theme_moonlit_hills' THEN '{"theme":"hills","animated":true,"preview":"linear-gradient(180deg,#050818 0%,#0d1426 35%,#1a2244 70%,#2a3358 100%)"}'::jsonb
    END
WHERE id IN ('theme_sky_dusk','theme_snowy_drift','theme_moonlit_hills');