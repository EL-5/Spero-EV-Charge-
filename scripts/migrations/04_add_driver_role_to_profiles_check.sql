-- =============================================================================
-- SPERO EV SCMS: ADD DRIVER ROLE TO PROFILES CHECK CONSTRAINT
-- =============================================================================
-- INSTRUCTIONS: Run this SQL script in your Supabase SQL Editor.
-- This prevents the "handle_new_user" trigger from failing when registering drivers.
-- =============================================================================

-- 1. Drop the existing role check constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 2. Re-create the constraint including 'driver' as a valid role
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('super_admin', 'manager', 'accountant', 'finance', 'attendant', 'driver'));
