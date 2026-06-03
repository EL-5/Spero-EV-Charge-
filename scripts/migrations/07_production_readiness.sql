-- =============================================================================
-- SPERO EV SCMS: PRODUCTION READINESS & SMART METER INTEGRATION MIGRATION
-- =============================================================================

-- 1. Extend Chargers and Commands for Multi-Instance Gateway Routing
ALTER TABLE chargers ADD COLUMN IF NOT EXISTS gateway_instance_id TEXT;
ALTER TABLE ocpp_commands ADD COLUMN IF NOT EXISTS instance_id TEXT;

-- 2. Create live_transactions table to persist volatile active session states
CREATE TABLE IF NOT EXISTS live_transactions (
  transaction_id INTEGER PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  charge_point_id TEXT NOT NULL,
  connector_id INTEGER NOT NULL,
  target_units NUMERIC DEFAULT 0,
  prepaid_amount NUMERIC DEFAULT 0,
  rate_at_time NUMERIC DEFAULT 5.50,
  start_wh NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create station_grid_metrics table for smart meter monitoring
CREATE TABLE IF NOT EXISTS station_grid_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id UUID REFERENCES stations(id) ON DELETE CASCADE,
  active_power_kw NUMERIC NOT NULL,
  voltage_v NUMERIC[] NOT NULL,
  current_a NUMERIC[] NOT NULL,
  total_energy_kwh NUMERIC NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Enable Realtime Subscriptions for New Tables
DO $$
DECLARE
  tables TEXT[] := ARRAY['live_transactions', 'station_grid_metrics'];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;

-- 5. Create Performance Indexes
CREATE INDEX IF NOT EXISTS idx_live_transactions_session ON live_transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_station_grid_metrics_station ON station_grid_metrics(station_id, recorded_at DESC);
