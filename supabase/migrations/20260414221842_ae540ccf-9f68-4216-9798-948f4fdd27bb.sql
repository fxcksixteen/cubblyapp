-- Create the test bot profile
INSERT INTO public.profiles (user_id, display_name, username, status, avatar_url, bio)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'CubblyBot',
  'cubblybot',
  'online',
  NULL,
  'I am a friendly test bot! Send me a message and I will reply.'
) ON CONFLICT DO NOTHING;

-- Create kaszy's profile from existing auth user
INSERT INTO public.profiles (user_id, display_name, username, status)
VALUES (
  'e72383bf-dbc3-4342-aadb-03104914fac4',
  'kaszy',
  'kaszy',
  'online'
) ON CONFLICT DO NOTHING;

-- Add friendship between kaszy and CubblyBot  
INSERT INTO public.friendships (requester_id, addressee_id, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'e72383bf-dbc3-4342-aadb-03104914fac4',
  'accepted'
) ON CONFLICT DO NOTHING;