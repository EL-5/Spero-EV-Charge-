-- =============================================================================
-- SPERO EV SCMS: APPROVALS, DAILY CLOSE AND STATION LIMITS
-- =============================================================================
-- Run AFTER 10_gun_session_recording.sql. Safe to run more than once.
-- All of these tables are read and written by server actions using the service
-- role, so they have row level security switched on with no browser policies.

-- 1. Review and void fields on sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reviewed_by UUID;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS review_decision TEXT;  -- 'accepted' | 'problem'
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS voided_by UUID;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS void_reason TEXT;
-- MoMo money that must be paid back to the driver by hand after a void
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS refund_due NUMERIC;

-- 2. Void requests: an attendant asks, a manager decides
CREATE TABLE IF NOT EXISTS session_void_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL,
  reason TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT
);
-- Only one open request per session
CREATE UNIQUE INDEX IF NOT EXISTS uq_void_requests_one_pending
  ON session_void_requests (session_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_void_requests_status ON session_void_requests (status, requested_at DESC);
ALTER TABLE session_void_requests ENABLE ROW LEVEL SECURITY;

-- 3. Station limits (one row). These replace numbers that were fixed in code.
CREATE TABLE IF NOT EXISTS station_limits (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Daily energy gap (machine total vs recorded kWh) allowed before a note is needed
  energy_gap_percent NUMERIC NOT NULL DEFAULT 2,
  -- A session longer than this is flagged
  long_session_hours NUMERIC NOT NULL DEFAULT 4,
  -- Most one gun can deliver; more energy than this in the time is flagged
  max_gun_kw NUMERIC NOT NULL DEFAULT 60,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO station_limits (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE station_limits ENABLE ROW LEVEL SECURITY;

-- 4. Daily close. One row per day; once written the day is locked.
CREATE TABLE IF NOT EXISTS daily_closes (
  close_date DATE PRIMARY KEY,
  -- MoMo: what the system recorded vs the provider statement total
  momo_system NUMERIC NOT NULL,
  momo_statement NUMERIC NOT NULL,
  -- Wallet: payments taken from wallets vs the wallet ledger
  wallet_system NUMERIC NOT NULL,
  wallet_ledger NUMERIC NOT NULL,
  -- Energy recorded by attendants, per gun
  recorded_a NUMERIC NOT NULL,
  recorded_b NUMERIC NOT NULL,
  -- What the charging machine shows, at the start and end of the day
  machine_a_start NUMERIC NOT NULL,
  machine_b_start NUMERIC NOT NULL,
  machine_total_start NUMERIC NOT NULL,
  machine_a_end NUMERIC NOT NULL,
  machine_b_end NUMERIC NOT NULL,
  machine_total_end NUMERIC NOT NULL,
  -- Explanations for anything that did not match: {momo, wallet, energy_a, energy_b, energy_total}
  notes JSONB NOT NULL DEFAULT '{}'::jsonb,
  closed_by UUID NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE daily_closes ENABLE ROW LEVEL SECURITY;

-- A closed day cannot be changed or deleted. Corrections are made as new
-- entries on a later day, never as edits.
CREATE OR REPLACE FUNCTION daily_closes_locked()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'A closed day cannot be changed or removed';
END;
$$;

DROP TRIGGER IF EXISTS trg_daily_closes_locked ON daily_closes;
CREATE TRIGGER trg_daily_closes_locked
  BEFORE UPDATE OR DELETE ON daily_closes
  FOR EACH ROW
  EXECUTE FUNCTION daily_closes_locked();
