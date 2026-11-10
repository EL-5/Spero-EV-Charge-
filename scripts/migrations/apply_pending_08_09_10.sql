-- RUN THIS ONCE in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- It applies the three pending database updates in the right order:
--   08  atomic wallet balance function
--   09  wallet top-up requests + protection for balance columns
--   10  gun A/B session recording (sessions.gun, readings, photo bucket, audit log)
-- Migration 11 is already applied. Every statement is safe to run more than once.

-- =============================================================================
-- 08_atomic_wallet_balance.sql
-- =============================================================================
-- =============================================================================
-- SPERO EV SCMS: ATOMIC WALLET BALANCE ADJUSTMENTS
-- =============================================================================
-- WHY: wallet_balance was previously mutated via a read-then-write pattern in
-- application code (SELECT balance -> compute in JS -> UPDATE). Two concurrent
-- adjustments to the same driver (e.g. a top-up racing a session refund) can
-- silently clobber one another's result. This function performs the read,
-- bounds check, and write as a single atomic statement using row-level
-- locking, so concurrent callers serialize instead of racing.

CREATE OR REPLACE FUNCTION adjust_wallet_balance(
  p_driver_id UUID,
  p_delta NUMERIC
)
RETURNS TABLE (balance_before NUMERIC, balance_after NUMERIC)
LANGUAGE plpgsql
AS $$
DECLARE
  v_before NUMERIC;
  v_after NUMERIC;
BEGIN
  SELECT wallet_balance INTO v_before
  FROM drivers
  WHERE id = p_driver_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver % not found', p_driver_id USING ERRCODE = 'P0002';
  END IF;

  v_after := COALESCE(v_before, 0) + p_delta;

  IF v_after < 0 THEN
    RAISE EXCEPTION 'Insufficient wallet balance: available %, requested %', v_before, -p_delta
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE drivers SET wallet_balance = v_after WHERE id = p_driver_id;

  RETURN QUERY SELECT COALESCE(v_before, 0), v_after;
END;
$$;

-- =============================================================================
-- 09_wallet_topup_requests_and_balance_protection.sql
-- =============================================================================
-- =============================================================================
-- SPERO EV SCMS: MANUAL WALLET TOP-UP REQUESTS + FINANCIAL COLUMN PROTECTION
-- =============================================================================
-- CONTEXT: The driver-facing wallet page previously credited wallet_balance
-- directly from the browser (client-side Supabase call), with no server
-- verification and no real payment step behind it — any driver could grant
-- themselves unlimited balance. There is no live Hubtel/Paystack integration
-- yet, so top-ups are manual: a driver pays an attendant/manager by cash or
-- MoMo, and staff confirm the payment actually happened before the wallet is
-- credited. This migration adds a request/approve workflow for that, and
-- locks the financial columns down at the database layer so a future
-- app-layer bug of the same shape can't silently create money again.

-- 1. Wallet top-up requests (driver submits, staff approves/rejects)
CREATE TABLE IF NOT EXISTS wallet_topup_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL DEFAULT 'momo_manual' CHECK (method IN ('momo_manual', 'cash')),
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ DEFAULT now(),
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_wallet_topup_requests_driver ON wallet_topup_requests(driver_id);
CREATE INDEX IF NOT EXISTS idx_wallet_topup_requests_status ON wallet_topup_requests(status);

ALTER TABLE wallet_topup_requests ENABLE ROW LEVEL SECURITY;

-- All application reads/writes go through server actions using the service
-- role (which bypasses RLS), so these policies are defense-in-depth for any
-- direct client-side query, matching the pattern already used for
-- payment_proofs.
DROP POLICY IF EXISTS "drivers_insert_own_topup_requests" ON wallet_topup_requests;
CREATE POLICY "drivers_insert_own_topup_requests"
  ON wallet_topup_requests FOR INSERT
  TO authenticated
  WITH CHECK (driver_id = auth.uid());

DROP POLICY IF EXISTS "drivers_view_own_topup_requests" ON wallet_topup_requests;
CREATE POLICY "drivers_view_own_topup_requests"
  ON wallet_topup_requests FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

DROP POLICY IF EXISTS "staff_view_all_topup_requests" ON wallet_topup_requests;
CREATE POLICY "staff_view_all_topup_requests"
  ON wallet_topup_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'manager', 'accountant', 'finance')
    )
  );

DROP POLICY IF EXISTS "managers_update_topup_requests" ON wallet_topup_requests;
CREATE POLICY "managers_update_topup_requests"
  ON wallet_topup_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'manager')
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'wallet_topup_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE wallet_topup_requests;
  END IF;
END $$;

-- 2. Atomic debt_balance adjustment, mirroring adjust_wallet_balance (08).
-- recordDebtPayment() previously read debt_balance, computed the new value
-- in application code, then wrote it back — the same lost-update race the
-- wallet function was built to close, just on a different column.
CREATE OR REPLACE FUNCTION adjust_debt_balance(
  p_driver_id UUID,
  p_delta NUMERIC
)
RETURNS TABLE (balance_before NUMERIC, balance_after NUMERIC)
LANGUAGE plpgsql
AS $$
DECLARE
  v_before NUMERIC;
  v_after NUMERIC;
BEGIN
  SELECT debt_balance INTO v_before
  FROM drivers
  WHERE id = p_driver_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver % not found', p_driver_id USING ERRCODE = 'P0002';
  END IF;

  v_after := GREATEST(0, COALESCE(v_before, 0) + p_delta);

  UPDATE drivers SET debt_balance = v_after WHERE id = p_driver_id;

  RETURN QUERY SELECT COALESCE(v_before, 0), v_after;
END;
$$;

-- 3. Defense-in-depth: reject any write to wallet_balance/debt_balance that
-- doesn't come from the service role. Server actions use supabaseAdmin
-- (service role) exclusively for these columns via the RPCs above, so this
-- should never fire in normal operation — it exists purely to turn a future
-- "oops, wrote to the table straight from the client" bug into a loud
-- error instead of a silent balance change.
CREATE OR REPLACE FUNCTION protect_driver_financial_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance THEN
      RAISE EXCEPTION 'wallet_balance may only be modified via adjust_wallet_balance()';
    END IF;
    IF NEW.debt_balance IS DISTINCT FROM OLD.debt_balance THEN
      RAISE EXCEPTION 'debt_balance may only be modified via adjust_debt_balance()';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_driver_financial_columns ON drivers;
CREATE TRIGGER trg_protect_driver_financial_columns
  BEFORE UPDATE ON drivers
  FOR EACH ROW
  EXECUTE FUNCTION protect_driver_financial_columns();

-- =============================================================================
-- 10_gun_session_recording.sql
-- =============================================================================
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
