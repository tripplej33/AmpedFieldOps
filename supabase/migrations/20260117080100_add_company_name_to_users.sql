-- Add company_name column to users table for first-time setup
-- This will store the company name configured during first-time setup

alter table public.users 
add column if not exists company_name text;

-- No RLS policy update needed - existing policies still apply
