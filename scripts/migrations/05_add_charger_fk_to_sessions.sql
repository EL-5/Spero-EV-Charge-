-- =============================================================================
-- SPERO EV SCMS: ADD CHARGER FOREIGN KEY CONSTRAINT TO SESSIONS
-- =============================================================================
-- INSTRUCTIONS: Run this SQL script in your Supabase SQL Editor.
-- This establishes the relational link between sessions and chargers.
-- =============================================================================

-- 1. Drop existing constraint if it already exists
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS fk_sessions_charger;

-- 2. Add foreign key constraint
ALTER TABLE public.sessions 
  ADD CONSTRAINT fk_sessions_charger 
  FOREIGN KEY (charger_id) REFERENCES public.chargers(id) 
  ON DELETE SET NULL;
