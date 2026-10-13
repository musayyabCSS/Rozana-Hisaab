ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS has_receipt boolean NOT NULL DEFAULT false;
