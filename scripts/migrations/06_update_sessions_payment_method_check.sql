-- Drop the constraint first so we can modify the rows and migrate historical data
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_payment_method_check;

-- Migrate historical 'hubtel' and 'paystack' records to 'mtn' (record keeping sake)
UPDATE sessions SET payment_method = 'mtn' WHERE payment_method IN ('hubtel', 'paystack');

-- Recreate the check constraint to only allow active record-keeping channels
ALTER TABLE sessions ADD CONSTRAINT sessions_payment_method_check 
  CHECK (payment_method IN ('cash', 'wallet', 'mtn', 'telecel', 'airteltigo'));
