-- Create all domain tables with proper schema
-- This migration creates clients, projects, timesheets, activity_types, cost_centers, and project_cost_centers
-- Run after: 20260117064508_initial_schema.sql and 20260117080000_app_settings_table.sql

-- ============================================
-- CLIENTS TABLE
-- ============================================
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  postal_code text,
  country text,
  website text,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by uuid references public.users(id) on delete set null,
  company_name text
);

create index idx_clients_is_active on public.clients(is_active);
create index idx_clients_created_by on public.clients(created_by);
create index idx_clients_company_name on public.clients(company_name);

-- ============================================
-- ACTIVITY_TYPES TABLE
-- ============================================
create table if not exists public.activity_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_billable boolean default false,
  hourly_rate numeric(10, 2),
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  company_name text
);

create index idx_activity_types_is_active on public.activity_types(is_active);
create index idx_activity_types_company_name on public.activity_types(company_name);

-- ============================================
-- COST_CENTERS TABLE
-- ============================================
create table if not exists public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  description text,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  company_name text,
  constraint unique_cost_center_code unique (code, company_name)
);

create index idx_cost_centers_is_active on public.cost_centers(is_active);
create index idx_cost_centers_company_name on public.cost_centers(company_name);

-- ============================================
-- PROJECTS TABLE
-- ============================================
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  client_id uuid references public.clients(id) on delete cascade,
  budget numeric(12, 2),
  status text default 'active', -- active, paused, completed
  start_date date,
  end_date date,
  is_billable boolean default true,
  hourly_rate numeric(10, 2),
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  created_by uuid references public.users(id) on delete set null,
  company_name text
);

create index idx_projects_client_id on public.projects(client_id);
create index idx_projects_status on public.projects(status);
create index idx_projects_is_active on public.projects(is_active);
create index idx_projects_created_by on public.projects(created_by);
create index idx_projects_company_name on public.projects(company_name);

-- ============================================
-- PROJECT_COST_CENTERS TABLE (Junction Table)
-- ============================================
create table if not exists public.project_cost_centers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  cost_center_id uuid not null references public.cost_centers(id) on delete cascade,
  created_at timestamp with time zone default now(),
  company_name text,
  constraint unique_project_cost_center unique (project_id, cost_center_id)
);

create index idx_project_cost_centers_project_id on public.project_cost_centers(project_id);
create index idx_project_cost_centers_cost_center_id on public.project_cost_centers(cost_center_id);

-- ============================================
-- TIMESHEETS TABLE
-- ============================================
create table if not exists public.timesheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  activity_type_id uuid references public.activity_types(id) on delete set null,
  cost_center_id uuid references public.cost_centers(id) on delete set null,
  entry_date date not null,
  hours numeric(5, 2) not null,
  description text,
  is_billable boolean,
  is_submitted boolean default false,
  is_approved boolean default false,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  company_name text
);

create index idx_timesheets_user_id on public.timesheets(user_id);
create index idx_timesheets_project_id on public.timesheets(project_id);
create index idx_timesheets_activity_type_id on public.timesheets(activity_type_id);
create index idx_timesheets_cost_center_id on public.timesheets(cost_center_id);
create index idx_timesheets_entry_date on public.timesheets(entry_date);
create index idx_timesheets_is_submitted on public.timesheets(is_submitted);
create index idx_timesheets_is_approved on public.timesheets(is_approved);
create index idx_timesheets_company_name on public.timesheets(company_name);

-- ============================================
-- ENABLE RLS ON NEW TABLES
-- ============================================
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.timesheets enable row level security;
alter table public.activity_types enable row level security;
alter table public.cost_centers enable row level security;
alter table public.project_cost_centers enable row level security;

-- ============================================
-- CLIENTS TABLE - RLS POLICIES
-- ============================================
create policy "clients_select_authenticated"
  on public.clients for select
  using (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);

create policy "clients_insert_authenticated"
  on public.clients for insert
  with check (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);

create policy "clients_update_authenticated"
  on public.clients for update
  using (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text)
  with check (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);

create policy "clients_delete_authenticated"
  on public.clients for delete
  using (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);

-- ============================================
-- PROJECTS TABLE - RLS POLICIES
-- ============================================
create policy "projects_select_authenticated"
  on public.projects for select
  using (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);

create policy "projects_insert_authenticated"
  on public.projects for insert
  with check (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);

create policy "projects_update_authenticated"
  on public.projects for update
  using (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text)
  with check (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);

create policy "projects_delete_authenticated"
  on public.projects for delete
  using (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);

-- ============================================
-- TIMESHEETS TABLE - RLS POLICIES
-- ============================================
create policy "timesheets_select_own"
  on public.timesheets for select
  using (
    auth.uid() = user_id 
    or auth.role() = 'service_role'::text
    or exists (
      select 1 from public.users 
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "timesheets_insert_authenticated"
  on public.timesheets for insert
  with check (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);

create policy "timesheets_update_own"
  on public.timesheets for update
  using (
    auth.uid() = user_id 
    or auth.role() = 'service_role'::text
    or exists (
      select 1 from public.users 
      where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    auth.uid() = user_id 
    or auth.role() = 'service_role'::text
    or exists (
      select 1 from public.users 
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "timesheets_delete_own"
  on public.timesheets for delete
  using (
    auth.uid() = user_id 
    or auth.role() = 'service_role'::text
    or exists (
      select 1 from public.users 
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================
-- ACTIVITY_TYPES TABLE - RLS POLICIES
-- ============================================
create policy "activity_types_select_authenticated"
  on public.activity_types for select
  using (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);

create policy "activity_types_insert_admin"
  on public.activity_types for insert
  with check (
    auth.role() = 'service_role'::text
    or exists (
      select 1 from public.users 
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "activity_types_update_admin"
  on public.activity_types for update
  using (
    auth.role() = 'service_role'::text
    or exists (
      select 1 from public.users 
      where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    auth.role() = 'service_role'::text
    or exists (
      select 1 from public.users 
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "activity_types_delete_admin"
  on public.activity_types for delete
  using (
    auth.role() = 'service_role'::text
    or exists (
      select 1 from public.users 
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================
-- COST_CENTERS TABLE - RLS POLICIES
-- ============================================
create policy "cost_centers_select_authenticated"
  on public.cost_centers for select
  using (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);

create policy "cost_centers_insert_admin"
  on public.cost_centers for insert
  with check (
    auth.role() = 'service_role'::text
    or exists (
      select 1 from public.users 
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "cost_centers_update_admin"
  on public.cost_centers for update
  using (
    auth.role() = 'service_role'::text
    or exists (
      select 1 from public.users 
      where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    auth.role() = 'service_role'::text
    or exists (
      select 1 from public.users 
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "cost_centers_delete_admin"
  on public.cost_centers for delete
  using (
    auth.role() = 'service_role'::text
    or exists (
      select 1 from public.users 
      where id = auth.uid() and role = 'admin'
    )
  );

-- ============================================
-- PROJECT_COST_CENTERS TABLE - RLS POLICIES
-- ============================================
create policy "project_cost_centers_select_authenticated"
  on public.project_cost_centers for select
  using (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);

create policy "project_cost_centers_insert_authenticated"
  on public.project_cost_centers for insert
  with check (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);

create policy "project_cost_centers_delete_authenticated"
  on public.project_cost_centers for delete
  using (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);
