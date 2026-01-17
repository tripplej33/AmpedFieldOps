-- App Settings table to track setup status
-- This table stores global app configuration like whether first-time setup is complete

create table if not exists public.app_settings (
  id uuid primary key default gen_random_uuid(),
  setup_complete boolean default false not null,
  first_user_id uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default current_timestamp,
  updated_at timestamp with time zone default current_timestamp,
  
  unique(id)
);

-- Enable RLS
alter table public.app_settings enable row level security;

-- Create policy allowing anyone to read app_settings
create policy "Allow all to read app_settings"
  on public.app_settings for select
  using (true);

-- Create policy allowing service role to update
create policy "Allow service role to update app_settings"
  on public.app_settings for update
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Create policy allowing service role to insert
create policy "Allow service role to insert app_settings"
  on public.app_settings for insert
  with check (auth.role() = 'service_role');

-- Create initial app_settings record
insert into public.app_settings (setup_complete)
values (false)
on conflict do nothing;
