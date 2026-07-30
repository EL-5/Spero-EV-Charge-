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
CREATE POLICY "drivers_insert_own_topup_requests"
  ON wallet_topup_requests FOR INSERT
  TO authenticated
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "drivers_view_own_topup_requests"
  ON wallet_topup_requests FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

CREATE POLICY "staff_view_all_topup_requests"
  ON wallet_topup_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('super_admin', 'manager', 'accountant', 'finance')
    )
  );

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
    RAISE EXCEPTION 'Driver % not found' USING ERRCODE = 'P0002';
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
