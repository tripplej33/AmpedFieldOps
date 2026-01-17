-- Fix the handle_new_user trigger function to not reference non-existent columns
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
begin
  insert into public.users (id, email, name, role, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'user'),
    new.raw_user_meta_data->>'avatar'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = excluded.name,
    updated_at = now();
  return new;
end;
$function$;
