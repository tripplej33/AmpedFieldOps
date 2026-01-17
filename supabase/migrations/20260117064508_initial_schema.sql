-- Initial Supabase schema: users, permissions, user_permissions

-- Users table (app profile linked to auth.users)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text not null,
  role text not null check (role in ('admin','manager','user')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Permissions catalog
create table if not exists public.permissions (
  key text primary key,
  label text not null,
  description text,
  is_system boolean not null default true
);

-- User permissions mapping
create table if not exists public.user_permissions (
  user_id uuid not null references public.users(id) on delete cascade,
  permission text not null references public.permissions(key) on delete cascade,
  granted boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, permission)
);

-- Helper function to check admin role
create or replace function public.auth_is_admin() returns boolean
  language sql
  security definer
  stable
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- Enable RLS
alter table public.users enable row level security;
alter table public.user_permissions enable row level security;
alter table public.permissions enable row level security;

-- RLS Policies
-- Users: read own, admins read/update all
create policy users_read_own on public.users
  for select using (auth.uid() = id);

create policy users_admin_read_all on public.users
  for select to authenticated using (public.auth_is_admin());

create policy users_admin_update on public.users
  for update to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());

-- User_permissions: read own, admins manage all
create policy user_permissions_read_own on public.user_permissions
  for select using (auth.uid() = user_id);

create policy user_permissions_admin_manage on public.user_permissions
  for all to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());

-- Permissions: readable to any authenticated user; only admins can write
create policy permissions_read_all on public.permissions
  for select to authenticated using (true);

create policy permissions_admin_write on public.permissions
  for all to authenticated using (public.auth_is_admin()) with check (public.auth_is_admin());

-- Seed base permissions
insert into public.permissions (key, label, description, is_system) values
  ('can_view_projects', 'View Projects', 'View project records', true),
  ('can_edit_projects', 'Edit Projects', 'Edit project records', true),
  ('can_view_clients', 'View Clients', 'View client records', true),
  ('can_edit_clients', 'Edit Clients', 'Edit client records', true),
  ('can_submit_timesheets', 'Submit Timesheets', 'Create and submit timesheets', true)
  on conflict (key) do nothing;
