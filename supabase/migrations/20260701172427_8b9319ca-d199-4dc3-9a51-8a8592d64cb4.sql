UPDATE public.shop_items
SET config = COALESCE(config, '{}'::jsonb) || jsonb_build_object(
  'icon_url', '/assets/shop/hello-kitty-3d.png',
  'gems_only', true
)
WHERE id = 'name_color_animated_hello_kitty';