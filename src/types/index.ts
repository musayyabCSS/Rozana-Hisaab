export type TransactionType = 'income' | 'expense';

export type Category =
  | 'salary'
  | 'business'
  | 'freelance'
  | 'rental_income'
  | 'commission'
  | 'loan'
  | 'scholarship'
  | 'office_funds'
  | 'transport'
  | 'fuel'
  | 'bills'
  | 'groceries'
  | 'food'
  | 'medical'
  | 'udhaar'
  | 'rent'
  | 'school_fee'
  | 'mechanic'
  | 'misc_expense';

export type PaymentMethod = 'cash' | 'bank' | 'easypaisa' | 'jazzcash' | 'card';

export type TransactionSource = 'manual' | 'voice' | 'scan' | 'bank';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  category: Category;
  title: string;
  payment_method: PaymentMethod | null;
  provider: string | null;
  due_date: string | null;
  units_consumed: string | null;
  source: TransactionSource;
  transaction_date: string;
  created_at: string;
  has_receipt?: boolean;
  is_paid?: boolean;
  consumer_number?: string | null;
  issue_date?: string | null;
  // Client-only hint from a scan (months the bill covers); not stored on the transaction.
  billing_cycle_months?: number;
  is_synced?: boolean;
}

export interface NewTransaction {
  id?: string;
  created_at?: string;
  type: TransactionType;
  amount: number;
  category: Category;
  title: string;
  payment_method?: PaymentMethod | null;
  provider?: string | null;
  due_date?: string | null;
  units_consumed?: string | null;
  source?: TransactionSource;
  transaction_date?: string;
  has_receipt?: boolean;
  is_paid?: boolean;
  consumer_number?: string | null;
  issue_date?: string | null;
}

// A saved utility/bill account, recognised on later scans by its consumer number.
export interface BillConnection {
  id: string;
  consumer_number: string;
  provider: string;
  nickname: string | null;
  last_issue_date: string | null;
  last_amount: number | null;
  billing_interval_months: number;
}

export type Language = 'en' | 'ur';
