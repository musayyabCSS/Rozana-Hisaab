import { Briefcase, Droplets, FileText, GraduationCap, HandCoins, Home, Laptop, Percent, Receipt, School, ShoppingCart, Stethoscope, Wallet, Wrench, Zap } from 'lucide-react';
import type { Category, Language } from '@/types';

interface CategoryMeta {
  icon: typeof Zap;
  emoji: string;
  label: Record<Language, string>;
}

export const CATEGORIES: Record<Category, CategoryMeta> = {
  salary: { icon: Wallet, emoji: '💵', label: { en: 'Salary', ur: 'تنخواہ' } },
  business: { icon: Briefcase, emoji: '💼', label: { en: 'Business', ur: 'کاروبار' } },
  freelance: { icon: Laptop, emoji: '💻', label: { en: 'Freelance', ur: 'فری لانس' } },
  rental_income: { icon: Home, emoji: '🏠', label: { en: 'Rental Income', ur: 'کرایہ آمدنی' } },
  commission: { icon: Percent, emoji: '％', label: { en: 'Commission', ur: 'کمیشن' } },
  loan: { icon: HandCoins, emoji: '🤝', label: { en: 'Loan', ur: 'قرض' } },
  scholarship: { icon: GraduationCap, emoji: '🎓', label: { en: 'Scholarship', ur: 'وظیفہ' } },
  fuel: { icon: Droplets, emoji: '⛽', label: { en: 'Fuel / Petrol', ur: 'پیٹرول' } },
  bills: { icon: Zap, emoji: '⚡', label: { en: 'Bills / Utilities', ur: 'بلز / یوٹیلیٹیز' } },
  groceries: { icon: ShoppingCart, emoji: '🛒', label: { en: 'Grocery', ur: 'راشن' } },
  medical: { icon: Stethoscope, emoji: '🏥', label: { en: 'Medical', ur: 'علاج' } },
  udhaar: { icon: Receipt, emoji: '🧾', label: { en: 'Loan Repayment', ur: 'قرض کی ادائیگی' } },
  rent: { icon: Home, emoji: '🏠', label: { en: 'Rent', ur: 'کرایہ' } },
  school_fee: { icon: School, emoji: '🎓', label: { en: 'School Fee', ur: 'اسکول فیس' } },
  mechanic: { icon: Wrench, emoji: '🔧', label: { en: 'Mechanic', ur: 'مکینک' } },
  misc_expense: { icon: FileText, emoji: '🧾', label: { en: 'Misc. Expense', ur: 'متفرق خرچ' } },
};

export const EXPENSE_CATEGORIES: Category[] = ['fuel', 'bills', 'groceries', 'medical', 'udhaar', 'rent', 'school_fee', 'mechanic', 'misc_expense'];
export const INCOME_CATEGORIES: Category[] = ['salary', 'business', 'freelance', 'rental_income', 'commission', 'loan', 'scholarship'];

export function getCategoryLabel(cat: Category, lang: Language): string {
  return CATEGORIES[cat].label[lang];
}

export function getCategoryIcon(cat: Category) {
  return CATEGORIES[cat].icon;
}

export function getCategoryEmoji(cat: Category): string {
  return CATEGORIES[cat].emoji;
}
