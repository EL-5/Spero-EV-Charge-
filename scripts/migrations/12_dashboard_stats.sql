-- =============================================================================
-- SPERO EV SCMS: DASHBOARD STATS IN ONE QUERY
-- =============================================================================
-- The dashboard used to run nine queries every refresh, including one that
-- downloaded EVERY session ever recorded just to add up kWh and count unpaid
-- sessions. This does the same arithmetic inside the database and returns one
-- small row, so the dashboard stays fast as the station records more sessions.
--
-- Safe to run more than once. The app falls back to the old queries until this
-- exists, so running it is an upgrade, not a requirement.

CREATE OR REPLACE FUNCTION dashboard_stats(
  p_since TIMESTAMPTZ,
  p_attendant UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'revenue_today', COALESCE((
      SELECT SUM(amount) FROM payments
      WHERE created_at >= p_since AND (p_attendant IS NULL OR attendant_id = p_attendant)
    ), 0),
    'sessions_today', (
      SELECT COUNT(*) FROM sessions
      WHERE status = 'completed' AND created_at >= p_since
        AND (p_attendant IS NULL OR attendant_id = p_attendant)
    ),
    'active_sessions', (
      SELECT COUNT(*) FROM sessions
      WHERE status = 'active' AND (p_attendant IS NULL OR attendant_id = p_attendant)
    ),
    'pending_count', (
      SELECT COUNT(*) FROM sessions
      WHERE (status = 'pending_payment'
             OR (status = 'completed' AND (payment_status = 'unpaid' OR payment_status IS NULL)))
        AND (p_attendant IS NULL OR attendant_id = p_attendant)
    ),
    'pending_amount', COALESCE((
      SELECT SUM(COALESCE(NULLIF(total_amount, 0), NULLIF(prepaid_amount, 0), 0)) FROM sessions
      WHERE (status = 'pending_payment'
             OR (status = 'completed' AND (payment_status = 'unpaid' OR payment_status IS NULL)))
        AND (p_attendant IS NULL OR attendant_id = p_attendant)
    ), 0),
    'units_today', COALESCE((
      SELECT SUM(units_consumed) FROM sessions
      WHERE status = 'completed' AND created_at >= p_since
        AND (p_attendant IS NULL OR attendant_id = p_attendant)
    ), 0),
    'units_all_time', COALESCE((
      SELECT SUM(units_consumed) FROM sessions
      WHERE status = 'completed' AND (p_attendant IS NULL OR attendant_id = p_attendant)
    ), 0),
    'completed_count', (
      SELECT COUNT(*) FROM sessions
      WHERE status = 'completed' AND (p_attendant IS NULL OR attendant_id = p_attendant)
    ),
    'drivers', (SELECT COUNT(*) FROM drivers),
    'vehicles', (SELECT COUNT(*) FROM vehicles),
    'drivers_debt', COALESCE((SELECT SUM(debt_balance) FROM drivers), 0)
  );
$$;

-- Indexes that the dashboard, the approvals queue and the attendant home screen filter on
CREATE INDEX IF NOT EXISTS idx_sessions_status_created ON sessions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_attendant_created ON sessions (attendant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shifts_attendant_status ON shifts (attendant_id, status);
