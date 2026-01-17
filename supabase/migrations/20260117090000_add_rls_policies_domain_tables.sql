-- Add RLS policies to existing domain tables
-- Enhances clients, projects, timesheets, activity_types, cost_centers tables
-- This migration works with the existing legacy schema from Postgres

-- ============================================
-- ENABLE RLS ON ALL DOMAIN TABLES
-- ============================================
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.timesheets enable row level security;
alter table public.activity_types enable row level security;
alter table public.cost_centers enable row level security;

-- ============================================
-- CLIENTS TABLE - RLS POLICIES
-- ============================================
-- Drop old policies if they exist
drop policy if exists "Allow authenticated users to read all clients" on public.clients;
drop policy if exists "Allow authenticated users to create clients" on public.clients;

-- New RLS policies for authenticated users
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

-- ============================================
-- PROJECTS TABLE - RLS POLICIES
-- ============================================
-- Drop old policies if they exist
drop policy if exists "Allow authenticated users to read all projects" on public.projects;
drop policy if exists "Allow authenticated users to create projects" on public.projects;

-- New RLS policies for authenticated users
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

-- ============================================
-- ACTIVITY_TYPES TABLE - RLS POLICIES
-- ============================================
-- Drop old policies if they exist
drop policy if exists "Allow authenticated users to read activity types" on public.activity_types;

-- New RLS policies
create policy "activity_types_select_authenticated"
  on public.activity_types for select
  using (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);

create policy "activity_types_insert_service"
  on public.activity_types for insert
  with check (auth.role() = 'service_role'::text);

create policy "activity_types_update_service"
  on public.activity_types for update
  using (auth.role() = 'service_role'::text)
  with check (auth.role() = 'service_role'::text);

create policy "activity_types_delete_service"
  on public.activity_types for delete
  using (auth.role() = 'service_role'::text);

-- ============================================
-- COST_CENTERS TABLE - RLS POLICIES
-- ============================================
create policy "cost_centers_select_authenticated"
  on public.cost_centers for select
  using (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);

create policy "cost_centers_insert_service"
  on public.cost_centers for insert
  with check (auth.role() = 'service_role'::text);

create policy "cost_centers_update_service"
  on public.cost_centers for update
  using (auth.role() = 'service_role'::text)
  with check (auth.role() = 'service_role'::text);

create policy "cost_centers_delete_service"
  on public.cost_centers for delete
  using (auth.role() = 'service_role'::text);

-- ============================================
-- TIMESHEETS TABLE - RLS POLICIES
-- ============================================
-- Drop old policies if they exist
drop policy if exists "Allow users to read own timesheets" on public.timesheets;
drop policy if exists "Allow users to create timesheets" on public.timesheets;

-- New RLS policies
create policy "timesheets_select_authenticated"
  on public.timesheets for select
  using (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);

create policy "timesheets_insert_authenticated"
  on public.timesheets for insert
  with check (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);

create policy "timesheets_update_authenticated"
  on public.timesheets for update
  using (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text)
  with check (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);

-- ============================================
-- PROJECT_COST_CENTERS TABLE - RLS POLICIES
-- ============================================
alter table if exists public.project_cost_centers enable row level security;

drop policy if exists "project_cost_centers_select_authenticated" on public.project_cost_centers;
drop policy if exists "project_cost_centers_insert_authenticated" on public.project_cost_centers;
drop policy if exists "project_cost_centers_update_authenticated" on public.project_cost_centers;

create policy "project_cost_centers_select_authenticated"
  on public.project_cost_centers for select
  using (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);

create policy "project_cost_centers_insert_authenticated"
  on public.project_cost_centers for insert
  with check (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);

create policy "project_cost_centers_update_authenticated"
  on public.project_cost_centers for update
  using (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text)
  with check (auth.role() = 'authenticated'::text or auth.role() = 'service_role'::text);
