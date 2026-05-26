INSERT INTO public.shop_items (id, name, category, subcategory, price, description, sort_order, config) VALUES
('theme_sky_dusk', 'Sky Dusk', 'theme', 'theme', 700, 'Soft dusk gradient with slow drifting clouds.', 50, '{"theme":"sky"}'::jsonb),
('theme_snowy_drift', 'Snowy Drift', 'theme', 'theme', 800, 'Calm frosted blue sky with gentle falling snow.', 51, '{"theme":"snowy"}'::jsonb),
('theme_moonlit_hills', 'Moonlit Hills', 'theme', 'theme', 900, 'Layered night silhouettes beneath a starry sky and quiet moon.', 52, '{"theme":"hills"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, price=EXCLUDED.price, description=EXCLUDED.description, sort_order=EXCLUDED.sort_order, config=EXCLUDED.config, is_active=true;