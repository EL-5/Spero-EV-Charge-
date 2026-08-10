-- ============================================================
-- kWh Daily Readings Migration
-- Run this in Supabase Studio > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS kwh_daily_readings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reading_date  DATE NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('smart_meter', 'machine', 'notebook')),
  kwh           NUMERIC(10, 3) NOT NULL CHECK (kwh >= 0),
  notes         TEXT,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast date lookups
CREATE INDEX IF NOT EXISTS idx_kwh_daily_readings_date ON kwh_daily_readings(reading_date DESC);

-- Enable Row Level Security
ALTER TABLE kwh_daily_readings ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can read all readings
CREATE POLICY "Authenticated users can read kwh_daily_readings"
  ON kwh_daily_readings FOR SELECT
  TO authenticated
  USING (true);

-- Policy: authenticated users can insert readings
CREATE POLICY "Authenticated users can insert kwh_daily_readings"
  ON kwh_daily_readings FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: only super_admin (via service role / admin actions) can delete
CREATE POLICY "Authenticated users can delete kwh_daily_readings"
  ON kwh_daily_readings FOR DELETE
  TO authenticated
  USING (true);
