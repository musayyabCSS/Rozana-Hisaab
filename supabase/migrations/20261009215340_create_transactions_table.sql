/*
# Create transactions table for Rozana Hisaab (single-tenant, no auth)

1. New Tables
- `transactions`
  - `id` (uuid, primary key)
  - `type` (text: 'income' or 'expense', not null)
  - `amount` (numeric, not null) — amount in PKR
  - `category` (text, not null) — e.g. 'fuel', 'bills', 'groceries', 'udhaar', 'salary', 'business', 'freelance', 'medical'
  - `title` (text, not null) — short description / label
  - `payment_method` (text, nullable) — 'cash', 'bank', 'easypaisa', 'jazzcash'
  - `provider` (text, nullable) — for scanned bills: e.g. 'LESCO', 'K-Electric', 'SNGPL', 'PTCL'
  - `due_date` (date, nullable) — for scanned bills
  - `units_consumed` (text, nullable) — for scanned bills
  - `source` (text, default 'manual') — 'manual', 'voice', 'scan', 'bank'
  - `transaction_date` (date, not null, default current date)
  - `created_at` (timestamptz, default now())
2. Security
- Enable RLS on `transactions`.
- Allow anon + authenticated CRUD because this is a single-tenant no-auth app.
*/

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  amount numeric NOT NULL DEFAULT 0,
  category text NOT NULL,
  title text NOT NULL,
  payment_method text,
  provider text,
  due_date date,
  units_consumed text,
  source text NOT NULL DEFAULT 'manual',
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_transactions" ON transactions;
CREATE POLICY "anon_select_transactions" ON transactions FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_transactions" ON transactions;
CREATE POLICY "anon_insert_transactions" ON transactions FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_transactions" ON transactions;
CREATE POLICY "anon_update_transactions" ON transactions FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_transactions" ON transactions;
CREATE POLICY "anon_delete_transactions" ON transactions FOR DELETE
TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions (type);
