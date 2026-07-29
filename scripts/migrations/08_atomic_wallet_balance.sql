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
    RAISE EXCEPTION 'Driver % not found' USING ERRCODE = 'P0002';
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
