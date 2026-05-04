INSERT INTO public.shop_items (id, name, category, subcategory, price, config)
VALUES (
  'badge_petite',
  'Petite',
  'badge',
  'profile',
  450,
  jsonb_build_object(
    'icon', 'flower',
    'bg', '#fce7f3',
    'fg', '#9d174d',
    'glow', '#f9a8d4',
    'label', 'Petite'
  )
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  subcategory = EXCLUDED.subcategory,
  price = EXCLUDED.price,
  config = EXCLUDED.config;