-- Add snapshot columns to sessions to preserve historical integrity
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS driver_name TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS vehicle_plate TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS vehicle_details TEXT;

-- Backfill existing sessions
UPDATE sessions s
SET 
  driver_name = d.name,
  vehicle_plate = v.plate_number,
  vehicle_details = v.brand || ' ' || v.model
FROM drivers d, vehicles v
WHERE s.driver_id = d.id AND s.vehicle_id = v.id;
