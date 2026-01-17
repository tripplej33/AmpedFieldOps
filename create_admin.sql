-- Create admin user
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  raw_user_meta_data,
  raw_app_meta_data,
  email_confirmed_at,
  aud,
  created_at,
  updated_at,
  confirmation_token,
  is_super_admin
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'admin@ampedlogix.com',
  crypt('SecureAdminPass123!', gen_salt('bf')),
  '{"name":"Admin User","role":"admin"}',
  '{"provider":"email","providers":["email"]}',
  now(),
  'authenticated',
  now(),
  now(),
  '',
  false
);
