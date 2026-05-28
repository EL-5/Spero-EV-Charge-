-- Migration: Add charger tracking and allow guests in sessions table
-- Description:
-- 1. Adds charger_id (UUID) and connector_number (INTEGER) to map a session to a physical connector.
-- 2. Makes driver_id and vehicle_id nullable to support Guest flows.

ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS charger_id UUID REFERENCES public.chargers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS connector_number INTEGER;

ALTER TABLE public.sessions
ALTER COLUMN driver_id DROP NOT NULL,
ALTER COLUMN vehicle_id DROP NOT NULL;

-- Optional: Create an index for faster lookups when querying sessions by charger
CREATE INDEX IF NOT EXISTS idx_sessions_charger_id ON public.sessions(charger_id);
