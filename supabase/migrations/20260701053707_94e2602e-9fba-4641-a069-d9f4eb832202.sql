
-- Guard purchase_shop_item against gems_only items
CREATE OR REPLACE FUNCTION public.purchase_shop_item(_item_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _price INTEGER;
  _category TEXT;
  _config JSONB;
  _new_balance INTEGER;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT price, category, config INTO _price, _category, _config
  FROM public.shop_items
  WHERE id = _item_id AND is_active = true;
  IF _price IS NULL THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE((_config->>'gems_only')::boolean, false) THEN
    RAISE EXCEPTION 'ITEM_GEMS_ONLY' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_inventory WHERE user_id = _uid AND item_id = _item_id) THEN
    RAISE EXCEPTION 'ALREADY_OWNED' USING ERRCODE = 'P0001';
  END IF;

  _new_balance := public.spend_coins(_price, 'shop_purchase', _item_id, jsonb_build_object('category', _category));
  INSERT INTO public.user_inventory (user_id, item_id) VALUES (_uid, _item_id);

  RETURN jsonb_build_object('balance', _new_balance, 'item_id', _item_id, 'category', _category);
END;
$function$;

-- Premium gem-only animated themes
INSERT INTO public.shop_items (id, category, subcategory, name, description, price, price_gems, config, sort_order) VALUES
('theme_cosmic_nebula', 'theme', 'premium', 'Cosmic Nebula',
  'Swirling violet gas clouds, drifting starlight, and quiet pulses of deep-space color.',
  0, 750,
  jsonb_build_object('animated', true, 'gems_only', true, 'theme', 'nebula',
    'preview', 'radial-gradient(ellipse at 30% 20%, #4c1d95 0%, #1e0b3b 40%, #05030f 100%)'),
  1010),
('theme_cyber_grid', 'theme', 'premium', 'Cyber Grid',
  'Neon horizon, laser grid, and slow scanlines. Straight out of a cyberpunk nightscape.',
  0, 650,
  jsonb_build_object('animated', true, 'gems_only', true, 'theme', 'cyber',
    'preview', 'linear-gradient(180deg,#050014 0%,#0f0330 45%,#ff2fbf 100%)'),
  1020),
('theme_volcanic', 'theme', 'premium', 'Volcanic',
  'Molten fissures, rising embers, and heat haze glowing beneath dark rock.',
  0, 700,
  jsonb_build_object('animated', true, 'gems_only', true, 'theme', 'volcanic',
    'preview', 'radial-gradient(ellipse at 50% 100%, #ff5b1f 0%, #7a1502 35%, #1a0503 100%)'),
  1030),
('theme_bioluminescent', 'theme', 'premium', 'Bioluminescent',
  'Deep-sea abyss with glowing jellyfish drifting through cold blue water.',
  0, 850,
  jsonb_build_object('animated', true, 'gems_only', true, 'theme', 'abyss',
    'preview', 'radial-gradient(ellipse at 50% 20%, #062a5c 0%, #021030 55%, #01050f 100%)'),
  1040),
('theme_aurora_borealis', 'theme', 'premium', 'Aurora Borealis',
  'Dancing green-violet curtains of light above a silent mountain skyline.',
  0, 900,
  jsonb_build_object('animated', true, 'gems_only', true, 'theme', 'aurora',
    'preview', 'linear-gradient(180deg,#01102a 0%,#03215a 40%,#0b6b6b 80%,#0a3f45 100%)'),
  1050),
('theme_sakura_storm', 'theme', 'premium', 'Sakura Storm',
  'Cherry-blossom petals swirl on wind against a warm dusk sky.',
  0, 800,
  jsonb_build_object('animated', true, 'gems_only', true, 'theme', 'sakura',
    'preview', 'linear-gradient(180deg,#2a0e30 0%,#5c1846 40%,#c86e94 80%,#f4c1a6 100%)'),
  1060)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  price_gems = EXCLUDED.price_gems,
  config = EXCLUDED.config,
  subcategory = EXCLUDED.subcategory,
  sort_order = EXCLUDED.sort_order;

-- Premium gem-only motion name colors. `style` picks the render path.
INSERT INTO public.shop_items (id, category, subcategory, name, description, price, price_gems, config, sort_order) VALUES
('name_color_animated_stardust', 'name_color', 'animated', 'Stardust',
  'A silver-gold shimmer that sweeps across your name.',
  0, 250,
  jsonb_build_object('gems_only', true, 'style', 'sweep', 'duration', '4s',
    'stops', jsonb_build_array('#b58a2b','#f4d089','#ffffff','#f4d089','#b58a2b')),
  2010),
('name_color_animated_prism', 'name_color', 'animated', 'Prism',
  'Iridescent chromatic light shifting through the full spectrum.',
  0, 300,
  jsonb_build_object('gems_only', true, 'style', 'hueshift', 'duration', '8s',
    'stops', jsonb_build_array('#ff3ea5','#7c3aed','#22d3ee','#22c55e','#facc15','#ff3ea5')),
  2020),
('name_color_animated_plasma', 'name_color', 'animated', 'Plasma',
  'Rotating conic plasma of neon violet, pink, and cyan.',
  0, 300,
  jsonb_build_object('gems_only', true, 'style', 'conic', 'duration', '6s',
    'stops', jsonb_build_array('#a855f7','#ec4899','#22d3ee','#a855f7')),
  2030),
('name_color_animated_phoenix', 'name_color', 'animated', 'Phoenix',
  'A living ember pulse of deep crimson, orange, and molten gold.',
  0, 350,
  jsonb_build_object('gems_only', true, 'style', 'pulse', 'duration', '3.5s',
    'stops', jsonb_build_array('#7f1d1d','#dc2626','#f59e0b','#fde047','#f59e0b','#7f1d1d')),
  2040),
('name_color_animated_oceanmist', 'name_color', 'animated', 'Ocean Mist',
  'A cool teal and cyan shimmer with a bright breath of sea foam.',
  0, 250,
  jsonb_build_object('gems_only', true, 'style', 'sweep', 'duration', '5s',
    'stops', jsonb_build_array('#0e7490','#22d3ee','#ecfeff','#22d3ee','#0e7490')),
  2050),
('name_color_animated_neonpulse', 'name_color', 'animated', 'Neon Pulse',
  'Hot pink, electric purple, and cyan pulsing to a slow beat.',
  0, 300,
  jsonb_build_object('gems_only', true, 'style', 'pulse', 'duration', '3s',
    'stops', jsonb_build_array('#ec4899','#a855f7','#22d3ee','#a855f7','#ec4899')),
  2060),
('name_color_animated_holographic', 'name_color', 'animated', 'Holographic',
  'Pearl iridescence — sheen glides across as the palette hue-shifts.',
  0, 400,
  jsonb_build_object('gems_only', true, 'style', 'hueshift', 'duration', '10s',
    'stops', jsonb_build_array('#f0abfc','#a5f3fc','#fef3c7','#c7d2fe','#f0abfc')),
  2070),
('name_color_animated_solarflare', 'name_color', 'animated', 'Solar Flare',
  'Blinding solar white sweeps across a deep-orange corona.',
  0, 350,
  jsonb_build_object('gems_only', true, 'style', 'sweep', 'duration', '3.6s',
    'stops', jsonb_build_array('#7c2d12','#ea580c','#fde047','#ffffff','#fde047','#ea580c','#7c2d12')),
  2080)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  price_gems = EXCLUDED.price_gems,
  config = EXCLUDED.config,
  subcategory = EXCLUDED.subcategory,
  sort_order = EXCLUDED.sort_order;
