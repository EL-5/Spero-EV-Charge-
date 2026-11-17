-- =============================================================================
-- SPERO EV SCMS: INDEXES FOR THE ATTENDANT APP AND MANAGER SCREENS
-- =============================================================================
-- Every screen filters sessions by gun and status, by attendant, and by date; the
-- payment and wallet lookups go by session. These indexes keep those queries fast
-- as the number of recorded sessions grows. Safe to run more than once.

CREATE INDEX IF NOT EXISTS idx_sessions_gun_status ON sessions (gun, status);
CREATE INDEX IF NOT EXISTS idx_sessions_attendant_status ON sessions (attendant_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_mode_start ON sessions (recording_mode, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_payments_session ON payments (session_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_session ON wallet_transactions (session_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created ON wallet_transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_driver ON wallet_transactions (driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicles_driver ON vehicles (driver_id);
