-- Phase 1 Schema Fixes
-- Adds missing columns for Phase 1 blocker resolution
-- Date: 2026-01-18

-- ============================================
-- Add actual_cost to projects (budget vs actual tracking)
-- ============================================
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS actual_cost numeric(12, 2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_projects_actual_cost 
ON public.projects(actual_cost);

-- ============================================
-- Add contact_name to clients (for Xero contact mapping)
-- ============================================
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS contact_name text;

CREATE INDEX IF NOT EXISTS idx_clients_contact_name 
ON public.clients(contact_name);

-- ============================================
-- Comment: Phase 1 columns added
-- These enable:
-- 1. actual_cost: Budget vs actual comparison on dashboard
-- 2. contact_name: Xero contact person mapping
-- ============================================
