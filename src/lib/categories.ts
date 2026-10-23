import { Briefcase, Building2, Car, Droplets, FileText, GraduationCap, HandCoins, Home, Laptop, Percent, Receipt, School, ShoppingCart, Stethoscope, UtensilsCrossed, Wallet, Wrench, Zap } from 'lucide-react';
import type { Category, Language } from '@/types';

interface CategoryMeta {
  icon: typeof Zap;
  emoji: string;
  label: Record<Language, string>;
}

interface CategoryDetails extends CategoryMeta {
  id: string;
  name: string;
  color: string;
}

export const DEFAULT_CATEGORY = {
  id: 'other',
  name: 'Other',
  label: 'Other',
  emoji: '📦',
  color: '#64748B',
} as const;

export const CATEGORIES: Record<Category, CategoryMeta> = {
  salary: { icon: Wallet, emoji: '💵', label: { en: 'Salary', ur: 'تنخواہ' } },
  business: { icon: Briefcase, emoji: '💼', label: { en: 'Business', ur: 'کاروبار' } },
  freelance: { icon: Laptop, emoji: '💻', label: { en: 'Freelance', ur: 'فری لانس' } },
  rental_income: { icon: Home, emoji: '🏠', label: { en: 'Rental Income', ur: 'کرایہ آمدنی' } },
  commission: { icon: Percent, emoji: '％', label: { en: 'Commission', ur: 'کمیشن' } },
  loan: { icon: HandCoins, emoji: '🤝', label: { en: 'Loan', ur: 'قرض' } },
  scholarship: { icon: GraduationCap, emoji: '🎓', label: { en: 'Scholarship', ur: 'وظیفہ' } },
  office_funds: { icon: Building2, emoji: '🏢', label: { en: 'Office Funds', ur: 'دفتری فنڈز' } },
  transport: { icon: Car, emoji: '🚗', label: { en: 'Transport', ur: 'ٹرانسپورٹ' } },
  fuel: { icon: Droplets, emoji: '⛽', label: { en: 'Fuel / Petrol', ur: 'پیٹرول' } },
  bills: { icon: Zap, emoji: '⚡', label: { en: 'Bills / Utilities', ur: 'بلز / یوٹیلیٹیز' } },
  groceries: { icon: ShoppingCart, emoji: '🛒', label: { en: 'Grocery', ur: 'راشن' } },
  food: { icon: UtensilsCrossed, emoji: '🍽️', label: { en: 'Food', ur: 'کھانا' } },
  medical: { icon: Stethoscope, emoji: '🏥', label: { en: 'Medical', ur: 'علاج' } },
  udhaar: { icon: Receipt, emoji: '🧾', label: { en: 'Loan Repayment', ur: 'قرض کی ادائیگی' } },
  rent: { icon: Home, emoji: '🏠', label: { en: 'Rent', ur: 'کرایہ' } },
  school_fee: { icon: School, emoji: '🎓', label: { en: 'School Fee', ur: 'اسکول فیس' } },
  mechanic: { icon: Wrench, emoji: '🔧', label: { en: 'Mechanic', ur: 'مکینک' } },
  misc_expense: { icon: FileText, emoji: '🧾', label: { en: 'Misc. Expense', ur: 'متفرق خرچ' } },
};

export const EXPENSE_CATEGORIES: Category[] = ['transport', 'fuel', 'bills', 'groceries', 'food', 'medical', 'udhaar', 'rent', 'school_fee', 'mechanic', 'misc_expense'];
export const INCOME_CATEGORIES: Category[] = ['salary', 'business', 'freelance', 'rental_income', 'commission', 'loan', 'scholarship', 'office_funds'];

export function getCategoryDetails(categoryName?: string | null): CategoryDetails | typeof DEFAULT_CATEGORY {
  const normalized = categoryName?.trim().toLowerCase();
  if (!normalized) return DEFAULT_CATEGORY;

  const found = Object.entries(CATEGORIES).find(([key, category]) =>
    key.toLowerCase() === normalized ||
    category.label.en.toLowerCase() === normalized ||
    category.label.ur.toLowerCase() === normalized,
  );
  if (!found) return DEFAULT_CATEGORY;

  const [id, category] = found;
  return {
    ...category,
    id,
    name: category.label.en,
    color: id === 'salary' || INCOME_CATEGORIES.includes(id as Category) ? '#10B981' : '#F43F5E',
  };
}

export function getCategoryLabel(cat: string | null | undefined, lang: Language): string {
  const category = getCategoryDetails(cat);
  if (typeof category.label === 'string') return category.label;
  return category.label[lang];
}

export function getCategoryIcon(cat: string | null | undefined) {
  const category = getCategoryDetails(cat);
  return 'icon' in category ? category.icon : Zap;
}

export function getCategoryEmoji(cat: string | null | undefined): string {
  return getCategoryDetails(cat).emoji;
}
