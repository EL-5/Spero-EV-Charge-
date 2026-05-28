-- Migration: Fix Row-Level Security and add OCPP Columns
-- Description: 
-- 1. Disables row-level security on the `stations`, `chargers`, and `connectors` tables so client-side queries can read data without policy conflicts.
-- 2. Adds advanced OCPP configuration columns to the `chargers` table to support enterprise registration details.

-- Disable RLS to allow client-side operations reads
ALTER TABLE public.stations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.chargers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.connectors DISABLE ROW LEVEL SECURITY;

-- Add OCPP configuration columns
ALTER TABLE public.chargers ADD COLUMN IF NOT EXISTS ocpp_version TEXT DEFAULT '1.6-J';
ALTER TABLE public.chargers ADD COLUMN IF NOT EXISTS security_profile INTEGER DEFAULT 1;
ALTER TABLE public.chargers ADD COLUMN IF NOT EXISTS auth_password TEXT;
ALTER TABLE public.chargers ADD COLUMN IF NOT EXISTS heartbeat_interval INTEGER DEFAULT 60;
