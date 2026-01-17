-- Auto-create user profile in public.users when auth.users record is created
-- This ensures public.users stays in sync with auth.users

-- Function to create/update user profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, name, role, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'user'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = excluded.name,
    updated_at = now();
  return new;
end;
$$;

-- Trigger on auth.users insert
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
select
  au.id,
  au.email,
  '',  -- Empty password_hash
  coalesce(au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)),
  coalesce(au.raw_user_meta_data->>'role', 'admin'),  -- Default to admin for existing users
  au.raw_user_meta_data->>'avatar',
  true
from auth.users au
left join public.users u on au.id = u.id
where u.id is null
on conflict (email) do update
set
  id = excluded.id,
  password_hash = excluded.password_hash,
  updated_at = now();
