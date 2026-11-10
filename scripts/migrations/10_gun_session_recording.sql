-- =============================================================================
-- SPERO EV SCMS: MANUAL SESSION RECORDING BY GUN (A / B)
-- =============================================================================
-- The charging machine is not connected to the app, so attendants record each
-- session by hand: they pick Gun A or Gun B, type the kWh shown on the machine
-- display before and after charging, and photograph the display both times.
-- The server works out the energy and the bill from the two readings — the
-- attendant never types an amount.
--
-- RUN THIS BEFORE deploying the matching app code. Safe to run more than once.

-- 1. Gun + reading + evidence columns on sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS gun TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS start_reading NUMERIC;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS end_reading NUMERIC;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS start_photo_path TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS end_photo_path TEXT;
-- start_reading minus the previous end reading on the same gun. Anything other
-- than ~0 means energy went through the gun without being recorded.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS start_gap NUMERIC;
-- e.g. {start_gap, exceeds_battery, impossible_power, long_session}
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS review_flags TEXT[] DEFAULT '{}';
-- 'manual_gun' for sessions recorded this way; older rows keep 'legacy'
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recording_mode TEXT DEFAULT 'legacy';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_gun_check'
  ) THEN
    ALTER TABLE sessions ADD CONSTRAINT sessions_gun_check CHECK (gun IS NULL OR gun IN ('A', 'B'));
  END IF;
END $$;

-- 2. A gun can only have one running session at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_one_active_per_gun
  ON sessions (gun)
  WHERE gun IS NOT NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_sessions_gun_created ON sessions (gun, created_at DESC);

-- 3. A MoMo transaction ID can be used on one payment only.
-- Older payments already contain duplicate references (for example
-- MTN-1792922485022 appears more than once), so a unique rule on `reference`
-- cannot be created. Instead the new flow writes the normalised MoMo ID to its
-- own column, and uniqueness is enforced on that column only. Old rows keep
-- NULL there and are left exactly as they are.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS momo_ref_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_momo_ref_key
  ON payments (momo_ref_key)
  WHERE momo_ref_key IS NOT NULL;

-- 4. Closing notes on a shift (the old close-shift form had the field but never saved it)
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS closing_notes TEXT;

-- 5. Atomic shift-totals update. The old code read a total, added to it in the
-- app and wrote it back, which loses updates when two payments land together.
CREATE OR REPLACE FUNCTION bump_shift_totals(
  p_shift_id UUID,
  p_cash NUMERIC DEFAULT 0,
  p_momo NUMERIC DEFAULT 0,
  p_wallet NUMERIC DEFAULT 0,
  p_sessions INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE shifts
  SET cash_collected    = COALESCE(cash_collected, 0)    + p_cash,
      hubtel_collected  = COALESCE(hubtel_collected, 0)  + p_momo,
      wallet_deductions = COALESCE(wallet_deductions, 0) + p_wallet,
      total_sessions    = COALESCE(total_sessions, 0)    + p_sessions
  WHERE id = p_shift_id;
$$;

-- 6. Write-once audit log. Rows can be added but never changed or removed:
-- the trigger fires for every role, including the service role.
--
-- audit_logs may already exist in an older shape (user_id, table_name,
-- record_id, old_value, new_value, ip_address). That table is kept as it is and
-- the columns the app writes are added next to the old ones.
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  action TEXT NOT NULL
);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_id UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_name TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_role TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_type TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS resource_id TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- The older columns may be marked mandatory; the app does not fill them in.
DO $$
DECLARE c TEXT;
BEGIN
  FOREACH c IN ARRAY ARRAY['user_id', 'table_name', 'record_id', 'old_value', 'new_value', 'ip_address'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = c AND is_nullable = 'NO'
    ) THEN
      EXECUTE format('ALTER TABLE audit_logs ALTER COLUMN %I DROP NOT NULL', c);
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs (resource_type, resource_id);

CREATE OR REPLACE FUNCTION audit_logs_write_once()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is write-once: rows cannot be updated or deleted';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_write_once ON audit_logs;
CREATE TRIGGER trg_audit_logs_write_once
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION audit_logs_write_once();

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
-- No policies: only the server (service role) reads and writes this table.

-- 7. Private storage bucket for the display photos. All reads and writes go
-- through server actions using the service role, so there are deliberately no
-- storage policies for the browser.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'meter-photos',
  'meter-photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;
