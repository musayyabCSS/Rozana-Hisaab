export type TransactionType = 'income' | 'expense';

export type Category =
  | 'salary'
  | 'business'
  | 'freelance'
  | 'rental_income'
  | 'commission'
  | 'loan'
  | 'scholarship'
  | 'fuel'
  | 'bills'
  | 'groceries'
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
}

export type Language = 'en' | 'ur';
