-- =============================================================================
-- SPERO EV SCMS: OCPP 1.6-J & PREPAYMENT SCHEMA MIGRATION
-- =============================================================================
-- INSTRUCTIONS: Run this complete SQL script in your Supabase SQL Editor.
-- =============================================================================

-- 1. Extend Existing Tables
-- -----------------------------------------------------------------------------

-- Alter settings to include OCPP Mode
ALTER TABLE settings ADD COLUMN IF NOT EXISTS ocpp_mode BOOLEAN DEFAULT FALSE;

-- Alter vehicles to include battery capacity (in kWh)
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS battery_capacity NUMERIC DEFAULT 40.0;

-- Alter sessions to include OCPP and prepayment parameters
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS start_battery_percentage INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS target_percentage INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS target_units NUMERIC; -- max kWh or duration target
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid'; -- 'unpaid', 'paid', 'refunded'
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS charger_id UUID;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS connector_number INTEGER;

-- 2. Create OCPP Specific Tables
-- -----------------------------------------------------------------------------

-- Table: chargers (Central System inventory of EVSE machines)
CREATE TABLE IF NOT EXISTS chargers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_point_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  vendor TEXT,
  model TEXT,
  serial_number TEXT,
  location TEXT,
  status TEXT DEFAULT 'offline', -- 'online', 'offline', 'faulted'
  last_heartbeat TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table: connectors (Individual outlets on a charging machine)
CREATE TABLE IF NOT EXISTS connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charger_id UUID REFERENCES chargers(id) ON DELETE CASCADE,
  connector_number INTEGER NOT NULL,
  status TEXT DEFAULT 'Available', -- OCPP status: Available, Preparing, Charging, Faulted, etc.
  power_type TEXT DEFAULT 'AC', -- 'AC', 'DC'
  max_power NUMERIC DEFAULT 22.0, -- Max kW power rating
  current_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  last_status_notification TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (charger_id, connector_number)
);

-- Table: ocpp_tags (RFID card tokens mapped to drivers)
CREATE TABLE IF NOT EXISTS ocpp_tags (
  id TEXT PRIMARY KEY, -- Raw RFID tag token string (e.g. ISO-14443 HEX uid)
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: ocpp_commands (Queue for sending commands from UI -> Server -> Charger)
CREATE TABLE IF NOT EXISTS ocpp_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_point_id TEXT NOT NULL,
  command TEXT NOT NULL, -- e.g. 'RemoteStartTransaction', 'RemoteStopTransaction', 'Reset', 'UnlockConnector'
  payload JSONB, -- Argument payload (e.g. { connectorId: 1, idTag: "12A34B" })
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'success', 'failed'
  response_payload JSONB, -- Response returned by physical charger
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table: ocpp_logs (Debugging terminal to track raw websocket packets)
CREATE TABLE IF NOT EXISTS ocpp_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_point_id TEXT,
  direction TEXT NOT NULL, -- 'IN' (charger -> gateway), 'OUT' (gateway -> charger)
  message_type TEXT NOT NULL, -- e.g. 'BootNotification', 'Heartbeat', 'MeterValues'
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Enable Realtime Subscriptions for OCPP Tables (safe, idempotent)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  tables TEXT[] := ARRAY['chargers', 'connectors', 'ocpp_commands', 'ocpp_logs', 'sessions'];
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

-- 4. Create Indexes for High Performance Querying
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_chargers_status ON chargers(status);
CREATE INDEX IF NOT EXISTS idx_connectors_charger ON connectors(charger_id);
CREATE INDEX IF NOT EXISTS idx_ocpp_commands_status ON ocpp_commands(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ocpp_logs_created ON ocpp_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocpp_tags_driver ON ocpp_tags(driver_id);
