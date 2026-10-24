/*
# Bill connections

Saved utility/bill accounts ("My Bills") recognised by their consumer or
reference number, so later scans link to the same connection and the app can
remind users when the next bill is expected (the billing interval, usually one
month, after the last issue date).

1. Schema
- `transactions.consumer_number` (text): already present on the live project.
- `transactions.issue_date` (date): the bill's printed issue date.
- `bill_connections`: one row per user and consumer number.
2. Security
- Owner-only RLS, matching `transactions` (`user_id` is text).
*/

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS consumer_number text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS issue_date date;

CREATE TABLE IF NOT EXISTS bill_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  consumer_number text NOT NULL,
  provider text NOT NULL,
  nickname text,
  last_issue_date date,
  last_amount numeric,
  -- Months between bills: 1 for most utilities, 2 for bi-monthly bills such as WASA.
  billing_interval_months smallint NOT NULL DEFAULT 1 CHECK (billing_interval_months BETWEEN 1 AND 12),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, consumer_number)
);

-- The daily reminder job looks up connections by their last issue date.
CREATE INDEX IF NOT EXISTS idx_bill_connections_last_issue
  ON bill_connections (last_issue_date);

ALTER TABLE bill_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own bill connections" ON bill_connections;
CREATE POLICY "Users can manage own bill connections" ON bill_connections FOR ALL
TO authenticated
USING ((select auth.uid())::text = user_id)
WITH CHECK ((select auth.uid())::text = user_id);
