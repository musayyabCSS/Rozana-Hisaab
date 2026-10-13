ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT true;
