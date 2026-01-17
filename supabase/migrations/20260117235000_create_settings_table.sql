-- Settings table for key-value configuration storage
-- Stores all application configuration like Xero credentials, timezones, etc.

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value text,
  description text,
  created_at timestamp with time zone default current_timestamp,
  updated_at timestamp with time zone default current_timestamp
);

create index idx_settings_key on public.settings (key);

-- Enable RLS
alter table public.settings enable row level security;

-- Create policy allowing anyone to read settings
create policy "Allow all to read settings"
  on public.settings for select
  using (true);

-- Create policy allowing service role to update/insert settings
create policy "Allow service role to update settings"
  on public.settings for update
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Allow service role to insert settings"
  on public.settings for insert
  with check (auth.role() = 'service_role');

-- Insert initial settings with common keys
insert into public.settings (key, value, description) values
  ('timezone', 'UTC', 'Application timezone'),
  ('status_notifications', 'true', 'Enable status notifications'),
  ('xero_client_id', null, 'Xero OAuth client ID'),
  ('xero_client_secret', null, 'Xero OAuth client secret'),
  ('xero_redirect_uri', null, 'Xero OAuth redirect URI'),
  ('xero_tenant_id', null, 'Xero tenant ID'),
  ('company_logo', null, 'Uploaded company logo path'),
  ('company_favicon', null, 'Uploaded favicon path'),
  ('storage_config', null, 'Storage driver configuration as JSON'),
  ('email_config', null, 'Email service configuration as JSON')
on conflict (key) do nothing;
