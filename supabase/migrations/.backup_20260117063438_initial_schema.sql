-- Initial schema for Supabase migration (fresh start)
-- Users, permissions, and RLS policies

-- Enable necessary extensions
create extension if not exists pgcrypto;

-- Users table (app-specific user profile)
-- Aligns with Supabase auth.users: id UUID matches auth.uid()
create table if not exists public.users (
	id uuid primary key,
	email text not null unique,
	name text not null,
	role text not null check (role in ('admin','manager','user')),
	avatar_url text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- Permissions reference (system-defined)
create table if not exists public.permissions (
	key text primary key,
	label text not null,
	description text,
	is_system boolean not null default true
);

-- User permissions (grants)
create table if not exists public.user_permissions (
	user_id uuid not null references public.users(id) on delete cascade,
	permission text not null references public.permissions(key) on delete cascade,
	granted boolean not null default true,
	created_at timestamptz not null default now(),
	primary key (user_id, permission)
);

-- Basic seed permissions
insert into public.permissions(key, label, description, is_system) values
	('can_manage_projects','Manage Projects','Create/update/delete projects',true),
	('can_view_projects','View Projects','View project listings',true),
	('can_manage_clients','Manage Clients','Create/update/delete clients',true),
	('can_view_clients','View Clients','View client listings',true)
on conflict (key) do nothing;

-- RLS policies
alter table public.users enable row level security;
alter table public.user_permissions enable row level security;
alter table public.permissions enable row level security;

-- Helper: check if current user is admin
-- Policy checks use existence of admin role
-- Note: Evaluated per-row; use subquery on current user id

-- Users: current user can select/update own row
create policy users_select_own on public.users
	for select using (id = auth.uid());

create policy users_update_own on public.users
	for update using (id = auth.uid());

-- Users: admins can select/update all rows
create policy users_admin_select_all on public.users
	for select using (exists (
		select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'
	));

create policy users_admin_update_all on public.users
	for update using (exists (
		select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'
	));

-- Permissions: readable by authenticated
create policy permissions_read_all on public.permissions
	for select to authenticated using (true);

-- User permissions: owner can read own; admin can read all
create policy user_permissions_select_own on public.user_permissions
	for select using (user_id = auth.uid());

create policy user_permissions_admin_select_all on public.user_permissions
	for select using (exists (
		select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'
	));

-- Writes: only admins can modify users and grants
create policy users_admin_insert on public.users
	for insert with check (exists (
		select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'
	));

create policy user_permissions_admin_write on public.user_permissions
	for all using (exists (
		select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'
	)) with check (exists (
		select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'
	));

-- Grants for roles
grant usage on schema public to authenticated;
grant usage on schema public to service_role;
grant select on public.permissions to authenticated;
grant select on public.users to authenticated;
grant select on public.user_permissions to authenticated;
